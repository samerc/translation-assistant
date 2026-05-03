import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from './entities/job.entity.js';
import { JobUser } from './entities/job-user.entity.js';
import { JobFile } from './entities/job-file.entity.js';
import { JobLineItem } from './entities/job-line-item.entity.js';
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
  ) {}

  private static readonly LOCKED_STATUSES = ['delivered', 'invoiced', 'paid'];

  private isLocked(job: Job): boolean {
    return JobsService.LOCKED_STATUSES.includes(job.status);
  }

  private async generateJobNumber(): Promise<string> {
    const result = await this.jobRepository
      .createQueryBuilder('job')
      .select('MAX(job.id)', 'maxId')
      .getRawOne();
    const nextNum = (result?.maxId || 0) + 1;
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
    clientId?: number;
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
      .leftJoinAndSelect('job.contact', 'contact')
      .leftJoinAndSelect('job.sourceLanguage', 'sourceLang')
      .leftJoinAndSelect('job.targetLanguage', 'targetLang')
      .leftJoinAndSelect('job.lineItems', 'lineItems')
      .leftJoinAndSelect('job.assignedUsers', 'assignedUsers')
      .leftJoinAndSelect('assignedUsers.user', 'assignedUser');

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

  async findOne(id: number): Promise<Job> {
    const job = await this.jobRepository.findOne({
      where: { id },
      relations: ['client', 'contact', 'sourceLanguage', 'targetLanguage', 'lineItems', 'assignedUsers', 'assignedUsers.user', 'files'],
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async create(dto: CreateJobDto, userId: number): Promise<Job> {
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

    // Create line items
    if (dto.lineItems?.length) {
      for (let i = 0; i < dto.lineItems.length; i++) {
        const li = dto.lineItems[i];
        const lineTotal = this.calculateLineTotal(li);
        await this.lineItemRepository.save(
          this.lineItemRepository.create({
            jobId: saved.id,
            description: li.description,
            templateId: li.templateId,
            freeformJobTypeId: li.freeformJobTypeId,
            pageCount: li.pageCount,
            pricePerPage: li.pricePerPage,
            useDiscountedPrice: li.useDiscountedPrice,
            discountedPricePerPage: li.discountedPricePerPage,
            lineTotal,
            sortOrder: i,
          }),
        );
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

  async update(id: number, dto: UpdateJobDto): Promise<Job> {
    const job = await this.findOne(id);

    if (this.isLocked(job) && !('status' in dto && Object.keys(dto).length === 1)) {
      throw new BadRequestException(`Cannot edit a job with status "${job.status}". Reopen it first.`);
    }

    Object.assign(job, dto);
    await this.jobRepository.save(job);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const job = await this.findOne(id);
    await this.jobRepository.remove(job);
  }

  // ── Line Items ──

  async addLineItem(jobId: number, item: {
    description: string; templateId?: number; freeformJobTypeId?: number;
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

  async updateLineItem(jobId: number, itemId: number, updates: Partial<{
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

  async removeLineItem(jobId: number, itemId: number): Promise<void> {
    const job = await this.findOne(jobId);
    if (this.isLocked(job)) throw new BadRequestException('Job is locked');

    const li = await this.lineItemRepository.findOne({ where: { id: itemId, jobId } });
    if (!li) throw new NotFoundException('Line item not found');
    await this.lineItemRepository.remove(li);
    await this.recalculateTotal(jobId);
  }

  private async recalculateTotal(jobId: number): Promise<void> {
    const items = await this.lineItemRepository.find({ where: { jobId } });
    const total = items.reduce((sum, li) => sum + Number(li.lineTotal), 0);
    await this.jobRepository.update(jobId, { calculatedTotal: total });
  }

  // ── Status ──

  async updateStatus(id: number, status: string): Promise<Job> {
    const job = await this.findOne(id);
    job.status = status;
    await this.jobRepository.save(job);
    return this.findOne(id);
  }

  async reopenJob(id: number): Promise<Job> {
    const job = await this.findOne(id);
    if (!this.isLocked(job)) {
      throw new BadRequestException('Job is not in a completed state');
    }
    job.status = 'in_progress';
    await this.jobRepository.save(job);
    return this.findOne(id);
  }

  // ── Job Users ──

  async assignUser(jobId: number, userId: number, permissionLevel: 'view' | 'edit' = 'edit'): Promise<JobUser> {
    await this.findOne(jobId);
    const existing = await this.jobUserRepository.findOne({ where: { jobId, userId } });
    if (existing) {
      existing.permissionLevel = permissionLevel;
      return this.jobUserRepository.save(existing);
    }
    return this.jobUserRepository.save(this.jobUserRepository.create({ jobId, userId, permissionLevel }));
  }

  async removeUser(jobId: number, userId: number): Promise<void> {
    const ju = await this.jobUserRepository.findOne({ where: { jobId, userId } });
    if (!ju) throw new NotFoundException('User assignment not found');
    await this.jobUserRepository.remove(ju);
  }

  // ── Files ──

  async uploadFile(jobId: number, category: 'source' | 'translated', file: Express.Multer.File, userId: number): Promise<JobFile> {
    await this.findOne(jobId);
    return this.jobFileRepository.save(this.jobFileRepository.create({
      jobId, category, fileName: file.originalname, filePath: file.path,
      fileSize: file.size, mimeType: file.mimetype, uploadedByUserId: userId,
    }));
  }

  async linkFile(jobId: number, sourceJobId: number, fileId: number): Promise<JobFile> {
    await this.findOne(jobId);
    const sourceFile = await this.jobFileRepository.findOne({ where: { id: fileId, jobId: sourceJobId } });
    if (!sourceFile) throw new NotFoundException('Source file not found');
    return this.jobFileRepository.save(this.jobFileRepository.create({
      jobId, category: sourceFile.category, fileName: sourceFile.fileName,
      filePath: sourceFile.filePath, fileSize: sourceFile.fileSize,
      mimeType: sourceFile.mimeType, linkedFromJobId: sourceJobId,
    }));
  }

  async removeFile(jobId: number, fileId: number): Promise<void> {
    const jf = await this.jobFileRepository.findOne({ where: { id: fileId, jobId } });
    if (!jf) throw new NotFoundException('File not found');
    await this.jobFileRepository.remove(jf);
  }
}
