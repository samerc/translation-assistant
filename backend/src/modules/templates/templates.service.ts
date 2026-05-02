import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findOne(id: number): Promise<Template> {
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

  async update(id: number, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.findOne(id);
    Object.assign(template, dto);
    await this.templateRepository.save(template);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const template = await this.findOne(id);
    await this.templateRepository.remove(template);
  }

  // ── Fields ──

  async addField(templateId: number, dto: CreateTemplateFieldDto): Promise<TemplateField> {
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
      isRepeatable: dto.isRepeatable,
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
    templateId: number,
    fieldId: number,
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
    if (dto.isRepeatable !== undefined) field.isRepeatable = dto.isRepeatable;

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

  async removeField(templateId: number, fieldId: number): Promise<void> {
    const field = await this.fieldRepository.findOne({
      where: { id: fieldId, templateId },
    });
    if (!field) throw new NotFoundException('Field not found');
    await this.fieldRepository.remove(field);
  }

  async reorderFields(
    templateId: number,
    fieldIds: number[],
  ): Promise<void> {
    await this.findOne(templateId);
    for (let i = 0; i < fieldIds.length; i++) {
      await this.fieldRepository.update(
        { id: fieldIds[i], templateId },
        { sortOrder: i },
      );
    }
  }
}
