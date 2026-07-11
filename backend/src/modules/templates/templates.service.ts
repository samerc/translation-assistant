import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import { Template } from './entities/template.entity.js';
import { TemplateField } from './entities/template-field.entity.js';
import { TemplateFieldLabel } from './entities/template-field-label.entity.js';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto.js';
import {
  CreateTemplateFieldDto,
  UpdateTemplateFieldDto,
} from './dto/template-field.dto.js';

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

  // ── Templates ──

  async findAll(query: {
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
      .leftJoinAndSelect('labels.language', 'language');

    if (search) {
      qb.andWhere('template.name LIKE :search', { search: `%${search}%` });
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

  async findOne(id: string): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id },
      relations: ['fields', 'fields.labels', 'fields.labels.language'],
      order: { fields: { sortOrder: 'ASC' } },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async create(dto: CreateTemplateDto): Promise<Template> {
    const template = this.templateRepository.create(dto);
    const saved = await this.templateRepository.save(template);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.findOne(id);
    Object.assign(template, dto);
    await this.templateRepository.save(template);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);
    // Delete word file from disk if present
    if (template.wordFilePath && existsSync(template.wordFilePath)) {
      unlinkSync(template.wordFilePath);
    }
    await this.templateRepository.remove(template);
  }

  // ── Word Template ──

  async uploadWordFile(
    id: string,
    file: Express.Multer.File,
  ): Promise<Template> {
    const template = await this.findOne(id);
    if (template.type !== 'word') {
      throw new BadRequestException('This template is not a Word-based template');
    }

    // Scan for placeholders before accepting
    const buffer = readFileSync(file.path);
    const result = await mammoth.convertToHtml({ buffer });
    const rawText = result.value.replace(/<[^>]*>/g, '');

    const validRegex = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    const placeholders: string[] = [];
    let match;
    while ((match = validRegex.exec(rawText)) !== null) {
      if (!placeholders.includes(match[1])) placeholders.push(match[1]);
    }

    // Check for malformed placeholders
    const allBracesRegex = /\{([^}]*)\}/g;
    const malformed: string[] = [];
    while ((match = allBracesRegex.exec(rawText)) !== null) {
      const inner = match[1];
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(inner)) {
        malformed.push(`{${inner}}`);
      }
    }

    if (malformed.length > 0) {
      const { unlinkSync } = await import('fs');
      unlinkSync(file.path);
      throw new BadRequestException(
        `Word file contains malformed placeholders: ${malformed.join(', ')}. Fix them and re-upload.`,
      );
    }

    if (placeholders.length === 0) {
      const { unlinkSync } = await import('fs');
      unlinkSync(file.path);
      throw new BadRequestException(
        'No placeholders found in the Word file. Add placeholders like {full_name} where field values should go.',
      );
    }

    // Delete old word file if replacing
    if (template.wordFilePath && template.wordFilePath !== file.path && existsSync(template.wordFilePath)) {
      unlinkSync(template.wordFilePath);
    }
    template.wordFilePath = file.path;
    template.wordFileName = file.originalname;
    await this.templateRepository.save(template);
    return this.findOne(id);
  }

  async getWordPreview(id: string): Promise<{
    html: string;
    valid: string[];
    unlinked: string[];
    malformed: { text: string; reason: string }[];
  }> {
    const template = await this.findOne(id);
    if (!template.wordFilePath) {
      throw new NotFoundException('No Word file uploaded for this template');
    }

    const buffer = readFileSync(template.wordFilePath);
    const result = await mammoth.convertToHtml({ buffer });
    const rawText = result.value.replace(/<[^>]*>/g, ''); // strip HTML tags for scanning

    // Find valid placeholders: {valid_field_key}
    const validRegex = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    const foundValid: string[] = [];
    let match;
    while ((match = validRegex.exec(rawText)) !== null) {
      if (!foundValid.includes(match[1])) {
        foundValid.push(match[1]);
      }
    }

    // Find malformed placeholders: anything with braces that doesn't match the valid pattern
    const allBracesRegex = /\{([^}]*)\}/g;
    const malformed: { text: string; reason: string }[] = [];
    while ((match = allBracesRegex.exec(rawText)) !== null) {
      const inner = match[1];
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(inner)) continue; // valid, skip

      let reason = '';
      if (!inner.trim()) {
        reason = 'Empty placeholder';
      } else if (/\s/.test(inner)) {
        reason = `Contains spaces — use underscores instead (e.g., {${inner.replace(/\s+/g, '_')}})`;
      } else if (/^[0-9]/.test(inner)) {
        reason = 'Cannot start with a number';
      } else {
        reason = 'Contains invalid characters — use only letters, numbers, and underscores';
      }

      malformed.push({ text: `{${inner}}`, reason });
    }

    // Check for unclosed braces
    const openCount = (rawText.match(/\{/g) || []).length;
    const closeCount = (rawText.match(/\}/g) || []).length;
    if (openCount !== closeCount) {
      malformed.push({
        text: '{...}',
        reason: `Mismatched braces: ${openCount} opening and ${closeCount} closing braces found`,
      });
    }

    // Split valid into linked (has matching field) and unlinked
    const fieldKeys = template.fields.map((f) => f.fieldKey);
    const valid = foundValid.filter((p) => fieldKeys.includes(p));
    const unlinked = foundValid.filter((p) => !fieldKeys.includes(p));

    const cleanHtml = sanitizeHtml(result.value, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span']),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        '*': ['style', 'class'],
        img: ['src', 'alt', 'width', 'height'],
      },
      allowedSchemes: ['http', 'https', 'data'],
    });
    return { html: cleanHtml, valid, unlinked, malformed };
  }

  async setWordPlaceholders(
    id: string,
    placeholders: { find: string; fieldKey: string }[],
  ): Promise<Template> {
    const template = await this.findOne(id);
    if (template.type !== 'word' || !template.wordFilePath) {
      throw new BadRequestException('Not a Word template or no file uploaded');
    }

    // Create/update fields based on placeholders
    for (const ph of placeholders) {
      const existing = template.fields.find((f) => f.fieldKey === ph.fieldKey);
      if (!existing) {
        await this.addField(id, {
          fieldKey: ph.fieldKey,
          fieldType: 'text',
        });
      }
    }

    return this.findOne(id);
  }

  // ── Fields ──

  async addField(templateId: string, dto: CreateTemplateFieldDto): Promise<TemplateField> {
    await this.findOne(templateId);

    // Auto-set sortOrder if not provided
    if (dto.sortOrder === undefined) {
      const maxSort = await this.fieldRepository
        .createQueryBuilder('f')
        .where('f.template_id = :templateId', { templateId })
        .select('MAX(f.sortOrder)', 'max')
        .getRawOne();
      dto.sortOrder = (maxSort?.max ?? -1) + 1;
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
      relations: ['labels', 'labels.language'],
    }) as Promise<TemplateField>;
  }

  async updateField(
    templateId: string,
    fieldId: string,
    dto: UpdateTemplateFieldDto,
  ): Promise<TemplateField> {
    const field = await this.fieldRepository.findOne({
      where: { id: fieldId, templateId },
      relations: ['labels'],
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
      relations: ['labels', 'labels.language'],
    }) as Promise<TemplateField>;
  }

  async removeField(templateId: string, fieldId: string): Promise<void> {
    const field = await this.fieldRepository.findOne({
      where: { id: fieldId, templateId },
    });
    if (!field) throw new NotFoundException('Field not found');
    await this.fieldRepository.remove(field);
  }

  async reorderFields(
    templateId: string,
    fieldIds: string[],
  ): Promise<void> {
    await this.findOne(templateId);
    await Promise.all(
      fieldIds.map((id, i) =>
        this.fieldRepository.update({ id, templateId }, { sortOrder: i }),
      ),
    );
  }
}
