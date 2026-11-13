import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { likeContains } from '../../common/utils/like.js';
import { Brackets, Repository } from 'typeorm';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import { sniffType } from '../../common/utils/file-signature.js';
import { scanWordPlaceholders } from './word-placeholders.js';
import { Template } from './entities/template.entity.js';
import { TemplateField } from './entities/template-field.entity.js';
import { TemplateFieldLabel } from './entities/template-field-label.entity.js';
import { Document } from '../documents/entities/document.entity.js';
import { DocumentFieldValue } from '../documents/entities/document-field-value.entity.js';
import { Language } from '../settings/entities/language.entity.js';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto.js';
import {
  CreateTemplateFieldDto,
  UpdateTemplateFieldDto,
} from './dto/template-field.dto.js';

/** "date_of_birth" → date, "page_count" → number, "notes" → textarea, else text. */
export function guessFieldType(
  key: string,
): 'text' | 'textarea' | 'number' | 'date' {
  const k = key.toLowerCase();
  if (
    /(^|_)(date|dob|born|birthday|issued|expiry|expires)(_|$)|_date$|^date_/.test(
      k,
    )
  )
    return 'date';
  if (/(^|_)(count|number_of|qty|quantity|amount|age)(_|$)/.test(k))
    return 'number';
  if (/(^|_)(notes?|remarks?|comments?|description|address)(_|$)/.test(k))
    return 'textarea';
  return 'text';
}

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(TemplateField)
    private readonly fieldRepository: Repository<TemplateField>,
    @InjectRepository(TemplateFieldLabel)
    private readonly labelRepository: Repository<TemplateFieldLabel>,
  ) {}

  /** Field labels may only use languages this tenant can see (global or its own). */
  private async assertLabelLanguages(
    labels: { languageId: string }[] | undefined,
    tenantId: string,
  ): Promise<void> {
    await this.assertLanguages(
      (labels ?? []).map((l) => l.languageId),
      tenantId,
    );
  }

  /** Every id is a language this tenant can see (global or its own). */
  private async assertLanguages(
    languageIds: string[],
    tenantId: string,
  ): Promise<void> {
    const ids = [...new Set(languageIds)];
    if (ids.length === 0) return;
    const found = await this.templateRepository.manager
      .createQueryBuilder(Language, 'l')
      .where('l.id IN (:...ids)', { ids })
      .andWhere(
        new Brackets((w) =>
          w
            .where('l.tenant_id IS NULL')
            .orWhere('l.tenant_id = :tenantId', { tenantId }),
        ),
      )
      .getCount();
    if (found !== ids.length) {
      throw new BadRequestException('Language not found');
    }
  }

  // ── Templates ──

  async findAll(query: {
    tenantId: string;
    search?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const { search, isActive, sortBy = 'name', sortOrder = 'ASC' } = query;

    const qb = this.templateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.fields', 'fields')
      .leftJoinAndSelect('fields.labels', 'labels')
      .leftJoinAndSelect('labels.language', 'language')
      .leftJoinAndSelect('template.languages', 'docLanguages')
      .where('template.tenant_id = :tenantId', { tenantId: query.tenantId });

    if (search) {
      qb.andWhere('template.name LIKE :search', {
        search: likeContains(search),
      });
    }

    if (isActive !== undefined) {
      qb.andWhere('template.isActive = :isActive', { isActive });
    }

    const allowedSortFields = ['name', 'createdAt', 'pricePerPage'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';
    qb.orderBy(`template.${safeSortBy}`, sortOrder === 'DESC' ? 'DESC' : 'ASC');
    qb.addOrderBy('fields.sortOrder', 'ASC');

    const data = await qb.getMany();
    return data;
  }

  /** A template of this tenant (404 for any other tenant's id). */
  async findOne(id: string, tenantId: string): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id, tenantId },
      relations: {
        fields: {
          labels: {
            language: true,
          },
        },
        languages: true,
      },
      order: { fields: { sortOrder: 'ASC' } },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async create(dto: CreateTemplateDto, tenantId: string): Promise<Template> {
    const { languageIds, ...rest } = dto;
    await this.assertLanguages(languageIds ?? [], tenantId);
    const template = this.templateRepository.create({
      ...rest,
      tenantId,
      languages: (languageIds ?? []).map((id) => ({ id }) as Language),
    });
    const saved = await this.templateRepository.save(template);
    return this.findOne(saved.id, tenantId);
  }

  async update(
    id: string,
    dto: UpdateTemplateDto,
    tenantId: string,
  ): Promise<Template> {
    const template = await this.findOne(id, tenantId);
    const { languageIds, ...rest } = dto;
    Object.assign(template, rest);
    if (languageIds) {
      await this.assertLanguages(languageIds, tenantId);
      template.languages = languageIds.map((lid) => ({ id: lid }) as Language);
    }
    await this.templateRepository.save(template);
    return this.findOne(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const template = await this.findOne(id, tenantId);
    // documents.template_id has no cascade — explain instead of a generic FK error.
    const used = await this.templateRepository.manager.count(Document, {
      where: { templateId: id },
    });
    if (used > 0) {
      throw new BadRequestException(
        `This template is used by ${used} document${used === 1 ? '' : 's'}. Deactivate it instead of deleting it.`,
      );
    }
    const { wordFilePath } = template;
    await this.templateRepository.remove(template);
    // Delete the Word file only once the template row is gone.
    if (wordFilePath && existsSync(wordFilePath)) unlinkSync(wordFilePath);
  }

  // ── Word Template ──

  async uploadWordFile(
    id: string,
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<Template> {
    if (!file) throw new BadRequestException('File is required');
    const template = await this.findOne(id, tenantId);
    if (template.type !== 'word') {
      throw new BadRequestException(
        'This template is not a Word-based template',
      );
    }

    // Scan for placeholders before accepting
    const buffer = readFileSync(file.path);
    // A real .docx is a ZIP (PK signature) — reject spoofed/renamed content
    // before handing it to the parser.
    if (sniffType(buffer.subarray(0, 16)) !== 'zip') {
      throw new BadRequestException(
        'The uploaded file is not a valid .docx document',
      );
    }
    const result = await mammoth.convertToHtml({ buffer }).catch(() => {
      throw new BadRequestException(
        'The uploaded file could not be read as a Word document',
      );
    });
    const scan = scanWordPlaceholders(result.value.replace(/<[^>]*>/g, ''));

    if (scan.malformed.length > 0) {
      const list = scan.malformed.map((m) => `${m.text} (${m.reason})`);
      throw new BadRequestException(
        `Word file contains malformed placeholders: ${list.join('; ')}. Fix them and re-upload.`,
      );
    }

    if (scan.fields.length === 0) {
      throw new BadRequestException(
        'No placeholders found in the Word file. Add placeholders like {full_name} where field values should go.',
      );
    }

    // Save first, then delete the replaced file — a failed save must not
    // leave the template pointing at a deleted file.
    const oldPath = template.wordFilePath;
    template.wordFilePath = file.path;
    template.wordFileName = file.originalname;
    await this.templateRepository.save(template);
    if (oldPath && oldPath !== file.path && existsSync(oldPath)) {
      unlinkSync(oldPath);
    }
    return this.findOne(id, tenantId);
  }

  async getWordPreview(
    id: string,
    tenantId: string,
  ): Promise<{
    html: string;
    valid: string[];
    unlinked: string[];
    malformed: { text: string; reason: string }[];
    /** placeholder → the {#group} loop it sits in */
    groups: Record<string, string>;
    /** Template fields that no longer appear in the Word file. */
    orphans: string[];
  }> {
    const template = await this.findOne(id, tenantId);
    if (!template.wordFilePath) {
      throw new NotFoundException('No Word file uploaded for this template');
    }

    const buffer = readFileSync(template.wordFilePath);
    const result = await mammoth.convertToHtml({ buffer });
    const scan = scanWordPlaceholders(result.value.replace(/<[^>]*>/g, ''));
    const foundValid = scan.fields;
    const malformed = [...scan.malformed];

    // A field used inside {#group}…{/group} must belong to that group, or the
    // loop would render it empty on every row.
    for (const field of template.fields) {
      const loop = scan.groupOf[field.fieldKey];
      if (loop && field.groupKey !== loop) {
        malformed.push({
          text: `{${field.fieldKey}}`,
          reason: `Used inside {#${loop}} but the field's group is ${field.groupKey ? `"${field.groupKey}"` : 'not set'} — set its group to "${loop}"`,
        });
      }
    }

    // Split valid into linked (has matching field) and unlinked
    const fieldKeys = template.fields.map((f) => f.fieldKey);
    const valid = foundValid.filter((p) => fieldKeys.includes(p));
    const unlinked = foundValid.filter((p) => !fieldKeys.includes(p));

    const cleanHtml = sanitizeHtml(result.value, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'img',
        'h1',
        'h2',
        'span',
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        '*': ['style', 'class'],
        img: ['src', 'alt', 'width', 'height'],
      },
      allowedSchemes: ['http', 'https', 'data'],
    });
    const orphans = fieldKeys.filter((k) => !foundValid.includes(k));
    return {
      html: cleanHtml,
      valid,
      unlinked,
      malformed,
      groups: { ...scan.groupOf },
      orphans,
    };
  }

  async setWordPlaceholders(
    id: string,
    placeholders: { find: string; fieldKey: string }[],
    tenantId: string,
  ): Promise<Template> {
    const template = await this.findOne(id, tenantId);
    if (template.type !== 'word' || !template.wordFilePath) {
      throw new BadRequestException('Not a Word template or no file uploaded');
    }
    // Fields that sit inside a {#group} loop in the file are created in that group.
    const result = await mammoth.convertToHtml({
      buffer: readFileSync(template.wordFilePath),
    });
    const { groupOf } = scanWordPlaceholders(
      result.value.replace(/<[^>]*>/g, ''),
    );

    // Fields already there but in the wrong (or no) group for the loop they
    // sit in are moved into it.
    for (const field of template.fields) {
      const loop = groupOf[field.fieldKey];
      if (loop && field.groupKey !== loop) {
        await this.fieldRepository.update(field.id, { groupKey: loop });
      }
    }

    // Create/update fields based on placeholders
    for (const ph of placeholders) {
      const existing = template.fields.find((f) => f.fieldKey === ph.fieldKey);
      if (!existing) {
        await this.addField(
          id,
          {
            fieldKey: ph.fieldKey,
            fieldType: guessFieldType(ph.fieldKey),
            groupKey: groupOf[ph.fieldKey],
          },
          tenantId,
        );
      }
    }

    return this.findOne(id, tenantId);
  }

  // ── Fields ──

  async addField(
    templateId: string,
    dto: CreateTemplateFieldDto,
    tenantId: string,
  ): Promise<TemplateField> {
    await this.findOne(templateId, tenantId);
    await this.assertLabelLanguages(dto.labels, tenantId);

    // Auto-set sortOrder if not provided
    if (dto.sortOrder === undefined) {
      const maxSort = await this.fieldRepository
        .createQueryBuilder('f')
        .where('f.template_id = :templateId', { templateId })
        .select('MAX(f.sortOrder)', 'max')
        .getRawOne<{ max: string | number | null }>();
      dto.sortOrder = Number(maxSort?.max ?? -1) + 1;
    }

    const field = this.fieldRepository.create({
      templateId,
      fieldKey: dto.fieldKey,
      fieldType: dto.fieldType,
      sortOrder: dto.sortOrder,
      required: dto.required,
      groupKey: dto.groupKey,
    });

    const saved = await this.fieldRepository.save(field);

    // Save labels
    if (dto.labels?.length) {
      const labels = dto.labels.map((l) =>
        this.labelRepository.create({
          templateFieldId: saved.id,
          languageId: l.languageId,
          label: l.label,
        }),
      );
      await this.labelRepository.save(labels);
    }

    return this.fieldRepository.findOne({
      where: { id: saved.id },
      relations: {
        labels: {
          language: true,
        },
      },
    }) as Promise<TemplateField>;
  }

  async updateField(
    templateId: string,
    fieldId: string,
    dto: UpdateTemplateFieldDto,
    tenantId: string,
  ): Promise<TemplateField> {
    await this.findOne(templateId, tenantId);
    await this.assertLabelLanguages(dto.labels, tenantId);
    const field = await this.fieldRepository.findOne({
      where: { id: fieldId, templateId },
      relations: {
        labels: true,
      },
    });
    if (!field) throw new NotFoundException('Field not found');

    if (dto.fieldKey !== undefined) field.fieldKey = dto.fieldKey;
    if (dto.fieldType !== undefined) field.fieldType = dto.fieldType;
    if (dto.sortOrder !== undefined) field.sortOrder = dto.sortOrder;
    if (dto.required !== undefined) field.required = dto.required;
    if (dto.groupKey !== undefined) field.groupKey = dto.groupKey;

    await this.fieldRepository.save(field);

    // Replace labels if provided
    if (dto.labels !== undefined) {
      await this.labelRepository.delete({ templateFieldId: fieldId });
      if (dto.labels.length > 0) {
        const labels = dto.labels.map((l) =>
          this.labelRepository.create({
            templateFieldId: fieldId,
            languageId: l.languageId,
            label: l.label,
          }),
        );
        await this.labelRepository.save(labels);
      }
    }

    return this.fieldRepository.findOne({
      where: { id: fieldId },
      relations: {
        labels: {
          language: true,
        },
      },
    }) as Promise<TemplateField>;
  }

  async removeField(
    templateId: string,
    fieldId: string,
    tenantId: string,
  ): Promise<void> {
    await this.findOne(templateId, tenantId);
    const field = await this.fieldRepository.findOne({
      where: { id: fieldId, templateId },
    });
    if (!field) throw new NotFoundException('Field not found');
    const used = await this.fieldRepository.manager.count(DocumentFieldValue, {
      where: { templateFieldId: fieldId },
    });
    if (used > 0) {
      throw new BadRequestException(
        'This field already has values in documents, so it cannot be deleted.',
      );
    }
    await this.fieldRepository.remove(field);
  }

  async reorderFields(
    templateId: string,
    fieldIds: string[],
    tenantId: string,
  ): Promise<void> {
    await this.findOne(templateId, tenantId);
    await Promise.all(
      fieldIds.map((id, i) =>
        this.fieldRepository.update({ id, templateId }, { sortOrder: i }),
      ),
    );
  }
}
