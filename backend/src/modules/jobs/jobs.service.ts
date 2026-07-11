import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { existsSync, unlinkSync } from 'fs';
import { Job } from './entities/job.entity.js';
import { JobUser } from './entities/job-user.entity.js';
import { JobFile } from './entities/job-file.entity.js';
import { JobLineItem } from './entities/job-line-item.entity.js';
import { Document } from '../documents/entities/document.entity.js';
import { Template } from '../templates/entities/template.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { Language } from '../settings/entities/language.entity.js';
import { User } from '../users/entities/user.entity.js';
import { NotificationsService } from '../notifications/notifications.service.js';
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
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Language)
    private readonly languageRepository: Repository<Language>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
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
    userId?: string;
    isAdmin?: boolean;
  }) {
    const { search, status, clientId, type, sortBy = 'createdAt', sortOrder = 'DESC' } = query;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(Math.max(1, query.limit || 25), 100);

    const qb = this.jobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.client', 'client')
      .leftJoinAndSelect('job.sourceLanguage', 'sourceLang')
      .leftJoinAndSelect('job.targetLanguage', 'targetLang')
      .loadRelationCountAndMap('job.lineItemCount', 'job.lineItems');

    // Non-admin users can only see jobs they are assigned to
    if (query.userId && !query.isAdmin) {
      qb.innerJoin('job.assignedUsers', 'jobUser', 'jobUser.user_id = :userId', { userId: query.userId });
    }

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

  // Lightweight find for internal use (status checks, etc.)
  private async findOneBasic(id: string): Promise<Job> {
    const job = await this.jobRepository.findOne({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async create(dto: CreateJobDto, userId: string): Promise<Job> {
    // Validate referenced entities in parallel
    const templateIds = (dto.lineItems || []).map((li) => li.templateId).filter(Boolean) as string[];

    const [client, sourceLang, targetLang, templates] = await Promise.all([
      this.clientRepository.findOne({ where: { id: dto.clientId } }),
      this.languageRepository.findOne({ where: { id: dto.sourceLanguageId } }),
      dto.targetLanguageId ? this.languageRepository.findOne({ where: { id: dto.targetLanguageId } }) : Promise.resolve(null),
      templateIds.length > 0 ? this.templateRepository.find({ where: { id: In(templateIds) } }) : Promise.resolve([]),
    ]);

    if (!client) throw new BadRequestException('Client not found');
    if (!sourceLang) throw new BadRequestException('Source language not found');
    if (dto.targetLanguageId && !targetLang) throw new BadRequestException('Target language not found');

    // Validate all templates exist
    const templateMap = new Map(templates.map((t) => [t.id, t]));
    for (const li of dto.lineItems || []) {
      if (li.templateId && !templateMap.has(li.templateId)) {
        throw new BadRequestException('Template not found for one of the line items');
      }
    }

    const jobNumber = await this.generateJobNumber();

    // Wrap all writes in a transaction
    const savedId = await this.dataSource.transaction(async (manager) => {
      const job = manager.create(Job, {
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

      const saved = await manager.save(job);

      // Create line items (batch save)
      if (dto.lineItems?.length) {
        const items = dto.lineItems.map((li, i) =>
          manager.create(JobLineItem, {
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
        await manager.save(items);
      }

      // Auto-create documents for non-simple templates
      if (dto.type !== 'freeform' && templateIds.length > 0) {
        const docsToCreate = templates
          .filter((t) => t.type !== 'simple')
          .map((t) => manager.create(Document, { jobId: saved.id, templateId: t.id }));
        if (docsToCreate.length > 0) {
          await manager.save(docsToCreate);
        }
      }

      // Auto-assign creator
      await manager.save(
        manager.create(JobUser, { jobId: saved.id, userId, permissionLevel: 'edit' }),
      );

      return saved.id;
    });

    // Recalculate total (outside transaction — reads committed data)
    await this.recalculateTotal(savedId);

    return this.findOne(savedId);
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    const job = await this.findOneBasic(id);

    if (this.isLocked(job) && !('status' in dto && Object.keys(dto).length === 1)) {
      throw new BadRequestException('Cannot edit a locked job. Reopen it first.');
    }

    Object.assign(job, dto);
    await this.jobRepository.save(job);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const job = await this.findOne(id);
    // Delete physical files before cascade-deleting DB records
    // Skip linked files — the physical file belongs to the source job
    for (const file of job.files || []) {
      if (!file.linkedFromJobId && file.filePath && existsSync(file.filePath)) unlinkSync(file.filePath);
    }
    await this.jobRepository.remove(job);
  }

  // ── Line Items ──

  async addLineItem(jobId: string, item: {
    description: string; templateId?: string;
    pageCount: number; pricePerPage: number; useDiscountedPrice?: boolean; discountedPricePerPage?: number;
  }): Promise<JobLineItem> {
    const job = await this.findOneBasic(jobId);
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
    const job = await this.findOneBasic(jobId);
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
    const job = await this.findOneBasic(jobId);
    if (this.isLocked(job)) throw new BadRequestException('Job is locked');

    const li = await this.lineItemRepository.findOne({ where: { id: itemId, jobId } });
    if (!li) throw new NotFoundException('Line item not found');
    await this.lineItemRepository.remove(li);
    await this.recalculateTotal(jobId);
  }

  private async recalculateTotal(jobId: string): Promise<void> {
    const result = await this.lineItemRepository
      .createQueryBuilder('li')
      .select('COALESCE(SUM(li.lineTotal), 0)', 'total')
      .where('li.job_id = :jobId', { jobId })
      .getRawOne();
    await this.jobRepository.update(jobId, { calculatedTotal: Number(result?.total || 0) });
  }

  // ── Status ──

  async updateStatus(id: string, status: string, changedByUserId?: string): Promise<Job> {
    const job = await this.findOne(id);
    const oldStatus = job.status;
    job.status = status;
    await this.jobRepository.save(job);

    // Notify assigned users about status change
    if (changedByUserId && oldStatus !== status) {
      this.notificationsService.notifyJobStatusChange(
        { id: job.id, jobNumber: job.jobNumber, title: job.title },
        oldStatus, status, changedByUserId,
      ).catch(() => {});
    }

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

  async checkUserAssignment(jobId: string, userId: string): Promise<JobUser | null> {
    return this.jobUserRepository.findOne({ where: { jobId, userId } });
  }

  async assignUser(jobId: string, userId: string, permissionLevel: 'view' | 'edit' = 'edit'): Promise<JobUser> {
    // Validate both exist in parallel
    const [job, user] = await Promise.all([
      this.findOneBasic(jobId),
      this.userRepository.findOne({ where: { id: userId } }),
    ]);
    if (!user) throw new BadRequestException('User not found');

    const existing = await this.jobUserRepository.findOne({ where: { jobId, userId } });
    if (existing) {
      existing.permissionLevel = permissionLevel;
      return this.jobUserRepository.save(existing);
    }
    const result = await this.jobUserRepository.save(this.jobUserRepository.create({ jobId, userId, permissionLevel }));

    // Notify the assigned user
    this.notificationsService.notifyJobAssigned(jobId, job.jobNumber, job.title, userId).catch(() => {});

    return result;
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
    // Only delete physical file if it's not linked from another job
    if (!jf.linkedFromJobId && jf.filePath && existsSync(jf.filePath)) unlinkSync(jf.filePath);
    await this.jobFileRepository.remove(jf);
  }
}
