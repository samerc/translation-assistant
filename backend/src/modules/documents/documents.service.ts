import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './entities/document.entity.js';
import { DocumentFieldValue } from './entities/document-field-value.entity.js';
import { CreateDocumentDto, FieldValueDto } from './dto/document.dto.js';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentFieldValue)
    private readonly fieldValueRepository: Repository<DocumentFieldValue>,
  ) {}

  async findByJob(jobId: number): Promise<Document[]> {
    return this.documentRepository.find({
      where: { jobId },
      relations: ['template', 'fieldValues', 'fieldValues.templateField'],
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Document> {
    const doc = await this.documentRepository.findOne({
      where: { id },
      relations: [
        'template',
        'template.fields',
        'template.fields.labels',
        'template.fields.labels.language',
        'fieldValues',
        'fieldValues.templateField',
      ],
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async create(dto: CreateDocumentDto): Promise<Document> {
    const doc = this.documentRepository.create({
      jobId: dto.jobId,
      templateId: dto.templateId,
      clonedFromId: dto.clonedFromId,
    });
    const saved = await this.documentRepository.save(doc);

    // If cloning, copy field values from source
    if (dto.clonedFromId) {
      const source = await this.findOne(dto.clonedFromId);
      if (source.fieldValues.length > 0) {
        const clonedValues = source.fieldValues.map((fv) =>
          this.fieldValueRepository.create({
            documentId: saved.id,
            templateFieldId: fv.templateFieldId,
            pageNumber: fv.pageNumber,
            entryIndex: fv.entryIndex,
            value: fv.value,
          }),
        );
        await this.fieldValueRepository.save(clonedValues);
      }
    }

    return this.findOne(saved.id);
  }

  async saveFieldValues(documentId: number, values: FieldValueDto[]): Promise<Document> {
    const doc = await this.findOne(documentId);

    // Delete existing values and replace with new ones
    await this.fieldValueRepository.delete({ documentId });

    if (values.length > 0) {
      const fieldValues = values.map((v) =>
        this.fieldValueRepository.create({
          documentId,
          templateFieldId: v.templateFieldId,
          pageNumber: v.pageNumber || 1,
          entryIndex: v.entryIndex,
          value: v.value,
        }),
      );
      await this.fieldValueRepository.save(fieldValues);
    }

    return this.findOne(documentId);
  }

  async updateStatus(id: number, status: 'draft' | 'completed'): Promise<Document> {
    const doc = await this.findOne(id);
    doc.status = status;
    await this.documentRepository.save(doc);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const doc = await this.findOne(id);
    await this.documentRepository.remove(doc);
  }

  // Clone from existing document
  async clone(sourceId: number, jobId: number): Promise<Document> {
    const source = await this.findOne(sourceId);
    return this.create({
      jobId,
      templateId: source.templateId,
      clonedFromId: sourceId,
    });
  }

  // Search documents for cloning
  async searchForClone(query: {
    templateId?: number;
    search?: string;
    limit?: number;
  }): Promise<Document[]> {
    const qb = this.documentRepository
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.template', 'template')
      .leftJoinAndSelect('doc.job', 'job')
      .leftJoinAndSelect('job.client', 'client')
      .where('doc.status = :status', { status: 'completed' });

    if (query.templateId) {
      qb.andWhere('doc.template_id = :templateId', { templateId: query.templateId });
    }

    if (query.search) {
      qb.andWhere('(template.name LIKE :search OR client.name LIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    qb.orderBy('doc.updatedAt', 'DESC');
    qb.take(Math.min(query.limit || 20, 50));

    return qb.getMany();
  }
}
