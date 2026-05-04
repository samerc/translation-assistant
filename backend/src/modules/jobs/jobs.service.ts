import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from './entities/job.entity.js';
import { JobUser } from './entities/job-user.entity.js';
import { JobFile } from './entities/job-file.entity.js';
import { JobLineItem } from './entities/job-line-item.entity.js';
import { Document } from '../documents/entities/document.entity.js';
import { Template } from '../templates/entities/template.entity.js';
import { CreateJobDto, UpdateJobDto } from './dto/job.dto.js';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(JobUser)
    private readonly jobUserRepository: Repository<JobUser>,
    @InjectRepository(JobFile)
    private readonly jobFileRepository: Repository<JobFile>,
    @InjectRepository(JobLineItem)
    private readonly lineItemRepository: Repository<JobLineItem>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
  ) {}

  private static readonly LOCKED_STATUSES = ['delivered', 'invoiced', 'paid'];

  private isLocked(job: Job): boolean {
    return JobsService.LOCKED_STATUSES.includes(job.status);
  }

  private async generateJobNumber(): Promise<string> {
    const result = await this.jobRepository
      .createQueryBuilder('job')
      .select('COUNT(*)', 'count')
      .getRawOne();
    const nextNum = (parseInt(result?.count || '0', 10)) + 1;
    return `JOB-${String(nextNum).padStart(4, '0')}`;
  }

  private calculateLineTotal(item: { pageCount: number; pricePerPage: number; useDiscountedPrice?: boolean; discountedPricePerPage?: number | null }): number {
    const price = item.useDiscountedPrice && item.discountedPricePerPage
      ? Number(item.discountedPricePerPage)
      : Number(item.pricePerPage);
    return item.pageCount * price;
  }

  async findAll(query: {
    search?: string;
    status?: string;
    clientId?: string;
    type?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    page?: number;
    limit?: number;
  }) {
    const { search, status, clientId, type, sortBy = 'createdAt', sortOrder = 'DESC' } = query;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(Math.max(1, query.limit || 25), 100);

    const qb = this.jobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.client', 'client')
      .leftJoinAndSelect('job.sourceLanguage', 'sourceLang')
      .leftJoinAndSelect('job.targetLanguage', 'targetLang')
      .leftJoinAndSelect('job.lineItems', 'lineItems');

    if (search) {
      qb.andWhere('(job.title LIKE :search OR job.jobNumber LIKE :search OR client.name LIKE :search)', { search: `%${search}%` });
    }
    if (status) {
      qb.andWhere('job.status = :status', { status });
    }
    if (clientId) {
      qb.andWhere('job.client_id = :clientId', { clientId });
    }
    if (type) {
      qb.andWhere('job.type = :type', { type });
    }

    const allowedSortFields = ['title', 'status', 'createdAt', 'deadline', 'calculatedTotal', 'jobNumber'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    qb.orderBy(`job.${safeSortBy}`, sortOrder === 'ASC' ? 'ASC' : 'DESC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobRepository.findOne({
      where: { id },
      relations: ['client', 'contact', 'sourceLanguage', 'targetLanguage', 'lineItems', 'assignedUsers', 'assignedUsers.user', 'files'],
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async create(dto: CreateJobDto, userId: string): Promise<Job> {
    const jobNumber = await this.generateJobNumber();

    const job = this.jobRepository.create({
      jobNumber,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      clientId: dto.clientId,
      contactId: dto.contactId,
      sourceLanguageId: dto.sourceLanguageId,
      targetLanguageId: dto.targetLanguageId,
      status: dto.status || 'in_progress',
      deadline: dto.deadline,
      finalPrice: dto.finalPrice,
      isFreeOfCharge: dto.isFreeOfCharge,
      freeOfChargeReason: dto.freeOfChargeReason,
      notes: dto.notes,
      createdByUserId: userId,
    });

    const saved = await this.jobRepository.save(job);

    // Create line items (batch save)
    if (dto.lineItems?.length) {
      const items = dto.lineItems.map((li, i) =>
        this.lineItemRepository.create({
          jobId: saved.id,
          description: li.description,
          templateId: li.templateId,
          pageCount: li.pageCount,
          pricePerPage: li.pricePerPage,
          useDiscountedPrice: li.useDiscountedPrice,
          discountedPricePerPage: li.discountedPricePerPage,
          lineTotal: this.calculateLineTotal(li),
          sortOrder: i,
        }),
      );
      await this.lineItemRepository.save(items);
    }

    // Auto-create documents for non-simple templates
    if (dto.type !== 'freeform' && dto.lineItems?.length) {
      const templateIds = dto.lineItems
        .map((li) => li.templateId)
        .filter(Boolean) as string[];

      for (const templateId of templateIds) {
        const template = await this.templateRepository.findOne({ where: { id: templateId } });
        if (template && template.type !== 'simple') {
          await this.documentRepository.save(
            this.documentRepository.create({ jobId: saved.id, templateId }),
          );
        }
      }
    }

    // Recalculate total
    await this.recalculateTotal(saved.id);

    // Auto-assign creator
    await this.jobUserRepository.save(
      this.jobUserRepository.create({ jobId: saved.id, userId, permissionLevel: 'edit' }),
    );

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    const job = await this.findOne(id);

    if (this.isLocked(job) && !('status' in dto && Object.keys(dto).length === 1)) {
      throw new BadRequestException(`Cannot edit a job with status "${job.status}". Reopen it first.`);
    }

    Object.assign(job, dto);
    await this.jobRepository.save(job);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const job = await this.findOne(id);
    await this.jobRepository.remove(job);
  }

  // ── Line Items ──

  async addLineItem(jobId: string, item: {
    description: string; templateId?: string;
    pageCount: number; pricePerPage: number; useDiscountedPrice?: boolean; discountedPricePerPage?: number;
  }): Promise<JobLineItem> {
    const job = await this.findOne(jobId);
    if (this.isLocked(job)) throw new BadRequestException('Job is locked');

    const maxSort = await this.lineItemRepository
      .createQueryBuilder('li')
      .where('li.job_id = :jobId', { jobId })
      .select('MAX(li.sortOrder)', 'max')
      .getRawOne();

    const lineTotal = this.calculateLineTotal(item);
    const li = await this.lineItemRepository.save(
      this.lineItemRepository.create({
        jobId,
        ...item,
        lineTotal,
        sortOrder: (maxSort?.max ?? -1) + 1,
      }),
    );

    await this.recalculateTotal(jobId);
    return li;
  }

  async updateLineItem(jobId: string, itemId: string, updates: Partial<{
    description: string; pageCount: number; pricePerPage: number;
    useDiscountedPrice: boolean; discountedPricePerPage: number;
  }>): Promise<JobLineItem> {
    const job = await this.findOne(jobId);
    if (this.isLocked(job)) throw new BadRequestException('Job is locked');

    const li = await this.lineItemRepository.findOne({ where: { id: itemId, jobId } });
    if (!li) throw new NotFoundException('Line item not found');

    Object.assign(li, updates);
    li.lineTotal = this.calculateLineTotal(li);
    await this.lineItemRepository.save(li);
    await this.recalculateTotal(jobId);
    return li;
  }

  async removeLineItem(jobId: string, itemId: string): Promise<void> {
    const job = await this.findOne(jobId);
    if (this.isLocked(job)) throw new BadRequestException('Job is locked');

    const li = await this.lineItemRepository.findOne({ where: { id: itemId, jobId } });
    if (!li) throw new NotFoundException('Line item not found');
    await this.lineItemRepository.remove(li);
    await this.recalculateTotal(jobId);
  }

  private async recalculateTotal(jobId: string): Promise<void> {
    const items = await this.lineItemRepository.find({ where: { jobId } });
    const total = items.reduce((sum, li) => sum + Number(li.lineTotal), 0);
    await this.jobRepository.update(jobId, { calculatedTotal: total });
  }

  // ── Status ──

  async updateStatus(id: string, status: string): Promise<Job> {
    const job = await this.findOne(id);
    job.status = status;
    await this.jobRepository.save(job);
    return this.findOne(id);
  }

  async reopenJob(id: string): Promise<Job> {
    const job = await this.findOne(id);
    if (!this.isLocked(job)) {
      throw new BadRequestException('Job is not in a completed state');
    }
    job.status = 'in_progress';
    await this.jobRepository.save(job);
    return this.findOne(id);
  }

  // ── Job Users ──

  async assignUser(jobId: string, userId: string, permissionLevel: 'view' | 'edit' = 'edit'): Promise<JobUser> {
    await this.findOne(jobId);
    const existing = await this.jobUserRepository.findOne({ where: { jobId, userId } });
    if (existing) {
      existing.permissionLevel = permissionLevel;
      return this.jobUserRepository.save(existing);
    }
    return this.jobUserRepository.save(this.jobUserRepository.create({ jobId, userId, permissionLevel }));
  }

  async removeUser(jobId: string, userId: string): Promise<void> {
    const ju = await this.jobUserRepository.findOne({ where: { jobId, userId } });
    if (!ju) throw new NotFoundException('User assignment not found');
    await this.jobUserRepository.remove(ju);
  }

  // ── Files ──

  async uploadFile(jobId: string, category: 'source' | 'translated', file: Express.Multer.File, userId: string): Promise<JobFile> {
    await this.findOne(jobId);
    return this.jobFileRepository.save(this.jobFileRepository.create({
      jobId, category, fileName: file.originalname, filePath: file.path,
      fileSize: file.size, mimeType: file.mimetype, uploadedByUserId: userId,
    }));
  }

  async linkFile(jobId: string, sourceJobId: string, fileId: string): Promise<JobFile> {
    await this.findOne(jobId);
    const sourceFile = await this.jobFileRepository.findOne({ where: { id: fileId, jobId: sourceJobId } });
    if (!sourceFile) throw new NotFoundException('Source file not found');
    return this.jobFileRepository.save(this.jobFileRepository.create({
      jobId, category: sourceFile.category, fileName: sourceFile.fileName,
      filePath: sourceFile.filePath, fileSize: sourceFile.fileSize,
      mimeType: sourceFile.mimeType, linkedFromJobId: sourceJobId,
    }));
  }

  async removeFile(jobId: string, fileId: string): Promise<void> {
    const jf = await this.jobFileRepository.findOne({ where: { id: fileId, jobId } });
    if (!jf) throw new NotFoundException('File not found');
    await this.jobFileRepository.remove(jf);
  }
}
