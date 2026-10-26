import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
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
import { InvoiceItem } from '../invoices/entities/invoice-item.entity.js';
import { attachRelationCount } from '../../common/utils/relation-count.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateJobDto, UpdateJobDto } from './dto/job.dto.js';
import { clientVisibleSql } from '../clients/client-access.js';

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

  // Allowed manual status transitions (PATCH /:id/status). Invoice automation moves
  // jobs via direct batch updates and is intentionally not constrained here.
  // Backward moves out of a locked state go through reopenJob() instead.
  private static readonly STATUS_TRANSITIONS: Record<string, string[]> = {
    quote: ['accepted', 'in_progress', 'lost', 'cancelled'],
    accepted: ['in_progress', 'lost', 'cancelled'],
    in_progress: ['delivered', 'lost', 'cancelled'],
    delivered: ['invoiced', 'cancelled'],
    invoiced: ['paid', 'cancelled'],
    paid: [],
    lost: ['quote', 'in_progress'],
    cancelled: ['quote', 'in_progress'],
  };

  private isLocked(job: Job): boolean {
    return JobsService.LOCKED_STATUSES.includes(job.status);
  }

  // Files of a delivered/invoiced/paid job are frozen like the rest of the job.
  private async assertUnlocked(jobId: string): Promise<void> {
    if (this.isLocked(await this.findOneBasic(jobId))) {
      throw new BadRequestException(
        'This job is locked (delivered, invoiced or paid). Reopen it to change its files.',
      );
    }
  }

  private async generateJobNumber(): Promise<string> {
    // MAX(existing) + 1, not COUNT(*), so numbers aren't reused after deletion.
    // Concurrent creates are still caught by the unique constraint on jobNumber.
    const result = await this.jobRepository
      .createQueryBuilder('job')
      .select('MAX(CAST(SUBSTRING(job.jobNumber, 5) AS UNSIGNED))', 'maxNum')
      .getRawOne<{ maxNum: string | number | null }>();
    const nextNum = Number(result?.maxNum ?? 0) + 1;
    return `JOB-${String(nextNum).padStart(4, '0')}`;
  }

  private calculateLineTotal(item: {
    pageCount: number;
    pricePerPage: number;
    useDiscountedPrice?: boolean;
    discountedPricePerPage?: number | null;
  }): number {
    const price =
      item.useDiscountedPrice &&
      item.discountedPricePerPage !== null &&
      item.discountedPricePerPage !== undefined
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
    const {
      search,
      status,
      clientId,
      type,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(Math.max(1, query.limit || 25), 100);

    const qb = this.jobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.client', 'client')
      .leftJoinAndSelect('job.sourceLanguage', 'sourceLang')
      .leftJoinAndSelect('job.targetLanguage', 'targetLang');

    // Non-admin users can only see jobs they are assigned to
    if (query.userId && !query.isAdmin) {
      qb.innerJoin(
        'job.assignedUsers',
        'jobUser',
        'jobUser.user_id = :userId',
        { userId: query.userId },
      );
    }

    if (search) {
      qb.andWhere(
        '(job.title LIKE :search OR job.jobNumber LIKE :search OR client.name LIKE :search)',
        { search: `%${search}%` },
      );
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

    const allowedSortFields = [
      'title',
      'status',
      'createdAt',
      'deadline',
      'calculatedTotal',
      'jobNumber',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'createdAt';
    qb.orderBy(`job.${safeSortBy}`, sortOrder === 'ASC' ? 'ASC' : 'DESC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    await attachRelationCount(
      data,
      this.lineItemRepository,
      'jobId',
      'lineItemCount',
    );
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobRepository.findOne({
      where: { id },
      relations: {
        client: true,
        contact: true,
        sourceLanguage: true,
        targetLanguage: true,
        lineItems: true,

        assignedUsers: {
          user: true,
        },

        files: true,
      },
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

  async create(
    dto: CreateJobDto,
    userId: string,
    isAdmin = false,
  ): Promise<Job> {
    // Validate referenced entities in parallel
    const templateIds = (dto.lineItems || [])
      .map((li) => li.templateId)
      .filter(Boolean) as string[];

    const [client, sourceLang, targetLang, templates] = await Promise.all([
      this.clientRepository.findOne({ where: { id: dto.clientId } }),
      this.languageRepository.findOne({ where: { id: dto.sourceLanguageId } }),
      dto.targetLanguageId
        ? this.languageRepository.findOne({
            where: { id: dto.targetLanguageId },
          })
        : Promise.resolve(null),
      templateIds.length > 0
        ? this.templateRepository.find({ where: { id: In(templateIds) } })
        : Promise.resolve([]),
    ]);

    if (!client) throw new BadRequestException('Client not found');
    // A non-admin can only open jobs for clients they can already see —
    // otherwise any client id would grant access to that client.
    if (!isAdmin) {
      const visible = await this.clientRepository
        .createQueryBuilder('client')
        .where('client.id = :clientId', { clientId: dto.clientId })
        .andWhere(clientVisibleSql('client'), { accessUserId: userId })
        .getCount();
      if (!visible) throw new BadRequestException('Client not found');
    }
    if (!sourceLang) throw new BadRequestException('Source language not found');
    if (!sourceLang.isActive)
      throw new BadRequestException('Source language is not active');
    if (dto.targetLanguageId && !targetLang)
      throw new BadRequestException('Target language not found');
    if (targetLang && !targetLang.isActive)
      throw new BadRequestException('Target language is not active');

    // Validate all templates exist
    const templateMap = new Map(templates.map((t) => [t.id, t]));
    for (const li of dto.lineItems || []) {
      if (li.templateId && !templateMap.has(li.templateId)) {
        throw new BadRequestException(
          'Template not found for one of the line items',
        );
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
          .map((t) =>
            manager.create(Document, { jobId: saved.id, templateId: t.id }),
          );
        if (docsToCreate.length > 0) {
          await manager.save(docsToCreate);
        }
      }

      // Auto-assign creator
      await manager.save(
        manager.create(JobUser, {
          jobId: saved.id,
          userId,
          permissionLevel: 'edit',
        }),
      );

      return saved.id;
    });

    // Recalculate total (outside transaction — reads committed data)
    await this.recalculateTotal(savedId);

    return this.findOne(savedId);
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    const job = await this.findOneBasic(id);

    if (this.isLocked(job)) {
      throw new BadRequestException(
        'Cannot edit a locked job. Reopen it first.',
      );
    }

    // Route status changes through updateStatus() so transition rules + notifications apply.
    const { status, ...rest } = dto as UpdateJobDto & { status?: string };
    Object.assign(job, rest);
    await this.jobRepository.save(job);
    if (status && status !== job.status) {
      return this.updateStatus(id, status);
    }
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const job = await this.findOne(id);
    // invoice_items.job_id has no cascade — say why instead of a generic FK error.
    const invoiced = await this.dataSource
      .getRepository(InvoiceItem)
      .count({ where: { jobId: id } });
    if (invoiced > 0) {
      throw new BadRequestException(
        'This job is on an invoice. Remove it from the invoice before deleting the job.',
      );
    }
    const paths = (job.files || []).map((f) => f.filePath);
    await this.jobRepository.remove(job);
    // Files go only after the DB delete succeeded, and only if no other job links them.
    await this.unlinkUnreferencedFiles(paths);
  }

  /** Delete physical files that no JobFile row points at any more (linked
   *  copies share the original's path, so a file lives while any row uses it). */
  private async unlinkUnreferencedFiles(paths: string[]): Promise<void> {
    const candidates = [...new Set(paths.filter(Boolean))];
    if (candidates.length === 0) return;
    const stillUsed = await this.jobFileRepository.find({
      where: { filePath: In(candidates) },
      select: { id: true, filePath: true },
    });
    const used = new Set(stillUsed.map((f) => f.filePath));
    for (const p of candidates) {
      if (!used.has(p) && existsSync(p)) unlinkSync(p);
    }
  }

  // ── Line Items ──

  async addLineItem(
    jobId: string,
    item: {
      description: string;
      templateId?: string;
      pageCount: number;
      pricePerPage: number;
      useDiscountedPrice?: boolean;
      discountedPricePerPage?: number;
    },
  ): Promise<JobLineItem> {
    const job = await this.findOneBasic(jobId);
    if (this.isLocked(job)) throw new BadRequestException('Job is locked');

    const maxSort = await this.lineItemRepository
      .createQueryBuilder('li')
      .where('li.job_id = :jobId', { jobId })
      .select('MAX(li.sortOrder)', 'max')
      .getRawOne<{ max: string | number | null }>();

    const lineTotal = this.calculateLineTotal(item);
    const li = await this.lineItemRepository.save(
      this.lineItemRepository.create({
        jobId,
        ...item,
        lineTotal,
        sortOrder: Number(maxSort?.max ?? -1) + 1,
      }),
    );

    await this.recalculateTotal(jobId);
    return li;
  }

  async updateLineItem(
    jobId: string,
    itemId: string,
    updates: Partial<{
      description: string;
      pageCount: number;
      pricePerPage: number;
      useDiscountedPrice: boolean;
      discountedPricePerPage: number;
    }>,
  ): Promise<JobLineItem> {
    const job = await this.findOneBasic(jobId);
    if (this.isLocked(job)) throw new BadRequestException('Job is locked');

    const li = await this.lineItemRepository.findOne({
      where: { id: itemId, jobId },
    });
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

    const li = await this.lineItemRepository.findOne({
      where: { id: itemId, jobId },
    });
    if (!li) throw new NotFoundException('Line item not found');
    await this.lineItemRepository.remove(li);
    await this.recalculateTotal(jobId);
  }

  private async recalculateTotal(jobId: string): Promise<void> {
    const result = await this.lineItemRepository
      .createQueryBuilder('li')
      .select('COALESCE(SUM(li.lineTotal), 0)', 'total')
      .where('li.job_id = :jobId', { jobId })
      .getRawOne<{ total: string | number | null }>();
    await this.jobRepository.update(jobId, {
      calculatedTotal: Number(result?.total || 0),
    });
  }

  // ── Status ──

  async updateStatus(
    id: string,
    status: string,
    changedByUserId?: string,
  ): Promise<Job> {
    const job = await this.findOne(id);
    const oldStatus = job.status;

    if (status !== oldStatus) {
      const allowed = JobsService.STATUS_TRANSITIONS[oldStatus] ?? [];
      if (!allowed.includes(status)) {
        throw new BadRequestException(
          `Invalid status change from '${oldStatus}' to '${status}'.`,
        );
      }
    }

    job.status = status;
    await this.jobRepository.save(job);

    // Notify assigned users about status change
    if (changedByUserId && oldStatus !== status) {
      this.notificationsService
        .notifyJobStatusChange(
          { id: job.id, jobNumber: job.jobNumber, title: job.title },
          oldStatus,
          status,
          changedByUserId,
        )
        .catch(() => {});
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

  async checkUserAssignment(
    jobId: string,
    userId: string,
  ): Promise<JobUser | null> {
    return this.jobUserRepository.findOne({ where: { jobId, userId } });
  }

  async assignUser(
    jobId: string,
    userId: string,
    permissionLevel: 'view' | 'edit' = 'edit',
  ): Promise<JobUser> {
    // Validate both exist in parallel
    const [job, user] = await Promise.all([
      this.findOneBasic(jobId),
      this.userRepository.findOne({ where: { id: userId } }),
    ]);
    if (!user) throw new BadRequestException('User not found');

    const existing = await this.jobUserRepository.findOne({
      where: { jobId, userId },
    });
    if (existing) {
      existing.permissionLevel = permissionLevel;
      return this.jobUserRepository.save(existing);
    }
    const result = await this.jobUserRepository.save(
      this.jobUserRepository.create({ jobId, userId, permissionLevel }),
    );

    // Notify the assigned user
    this.notificationsService
      .notifyJobAssigned(jobId, job.jobNumber, job.title, userId)
      .catch(() => {});

    return result;
  }

  async removeUser(jobId: string, userId: string): Promise<void> {
    const ju = await this.jobUserRepository.findOne({
      where: { jobId, userId },
    });
    if (!ju) throw new NotFoundException('User assignment not found');
    await this.jobUserRepository.remove(ju);
  }

  // ── Files ──

  async uploadFile(
    jobId: string,
    category: 'source' | 'translated',
    file: Express.Multer.File,
    userId: string,
  ): Promise<JobFile> {
    await this.assertUnlocked(jobId);
    return this.jobFileRepository.save(
      this.jobFileRepository.create({
        jobId,
        category,
        fileName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedByUserId: userId,
      }),
    );
  }

  async linkFile(
    jobId: string,
    sourceJobId: string,
    fileId: string,
  ): Promise<JobFile> {
    await this.assertUnlocked(jobId);
    const sourceFile = await this.jobFileRepository.findOne({
      where: { id: fileId, jobId: sourceJobId },
    });
    if (!sourceFile) throw new NotFoundException('Source file not found');
    return this.jobFileRepository.save(
      this.jobFileRepository.create({
        jobId,
        category: sourceFile.category,
        fileName: sourceFile.fileName,
        filePath: sourceFile.filePath,
        fileSize: sourceFile.fileSize,
        mimeType: sourceFile.mimeType,
        linkedFromJobId: sourceJobId,
      }),
    );
  }

  async getFileForDownload(jobId: string, fileId: string): Promise<JobFile> {
    const jf = await this.jobFileRepository.findOne({
      where: { id: fileId, jobId },
    });
    if (!jf || !jf.filePath || !existsSync(jf.filePath)) {
      throw new NotFoundException('File not found');
    }
    return jf;
  }

  async removeFile(jobId: string, fileId: string): Promise<void> {
    await this.assertUnlocked(jobId);
    const jf = await this.jobFileRepository.findOne({
      where: { id: fileId, jobId },
    });
    if (!jf) throw new NotFoundException('File not found');
    const { filePath } = jf;
    await this.jobFileRepository.remove(jf);
    await this.unlinkUnreferencedFiles([filePath]);
  }
}
