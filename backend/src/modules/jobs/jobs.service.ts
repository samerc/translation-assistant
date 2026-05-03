import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from './entities/job.entity.js';
import { JobUser } from './entities/job-user.entity.js';
import { JobFile } from './entities/job-file.entity.js';
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
  ) {}

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
    const { search, status, clientId, type, sortBy = 'createdAt', sortOrder = 'DESC', page = 1, limit = 25 } = query;

    const qb = this.jobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.client', 'client')
      .leftJoinAndSelect('job.contact', 'contact')
      .leftJoinAndSelect('job.sourceLanguage', 'sourceLang')
      .leftJoinAndSelect('job.targetLanguage', 'targetLang')
      .leftJoinAndSelect('job.assignedUsers', 'assignedUsers')
      .leftJoinAndSelect('assignedUsers.user', 'assignedUser');

    if (search) {
      qb.andWhere('(job.title LIKE :search OR client.name LIKE :search)', { search: `%${search}%` });
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

    const allowedSortFields = ['title', 'status', 'createdAt', 'deadline', 'calculatedTotal'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    qb.orderBy(`job.${safeSortBy}`, sortOrder === 'ASC' ? 'ASC' : 'DESC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<Job> {
    const job = await this.jobRepository.findOne({
      where: { id },
      relations: ['client', 'contact', 'sourceLanguage', 'targetLanguage', 'assignedUsers', 'assignedUsers.user', 'files'],
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async create(dto: CreateJobDto, userId: number): Promise<Job> {
    const price = dto.useDiscountedPrice && dto.discountedPricePerPage
      ? dto.discountedPricePerPage
      : (dto.pricePerPage || 0);
    const calculatedTotal = (dto.pageCount || 1) * price;

    const job = this.jobRepository.create({
      ...dto,
      calculatedTotal,
      createdByUserId: userId,
    });

    const saved = await this.jobRepository.save(job);

    // Auto-assign creator
    const jobUser = this.jobUserRepository.create({
      jobId: saved.id,
      userId,
      permissionLevel: 'edit',
    });
    await this.jobUserRepository.save(jobUser);

    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateJobDto): Promise<Job> {
    const job = await this.findOne(id);
    Object.assign(job, dto);

    // Recalculate total if pricing fields changed
    const price = job.useDiscountedPrice && job.discountedPricePerPage
      ? Number(job.discountedPricePerPage)
      : Number(job.pricePerPage);
    job.calculatedTotal = job.pageCount * price;

    await this.jobRepository.save(job);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const job = await this.findOne(id);
    await this.jobRepository.remove(job);
  }

  // ── Status ──

  async updateStatus(id: number, status: string): Promise<Job> {
    return this.update(id, { status } as UpdateJobDto);
  }

  // ── Job Users ──

  async assignUser(jobId: number, userId: number, permissionLevel: 'view' | 'edit' = 'edit'): Promise<JobUser> {
    await this.findOne(jobId);
    const existing = await this.jobUserRepository.findOne({ where: { jobId, userId } });
    if (existing) {
      existing.permissionLevel = permissionLevel;
      return this.jobUserRepository.save(existing);
    }
    const ju = this.jobUserRepository.create({ jobId, userId, permissionLevel });
    return this.jobUserRepository.save(ju);
  }

  async removeUser(jobId: number, userId: number): Promise<void> {
    const ju = await this.jobUserRepository.findOne({ where: { jobId, userId } });
    if (!ju) throw new NotFoundException('User assignment not found');
    await this.jobUserRepository.remove(ju);
  }

  // ── Files ──

  async uploadFile(
    jobId: number,
    category: 'source' | 'translated',
    file: Express.Multer.File,
    userId: number,
  ): Promise<JobFile> {
    await this.findOne(jobId);
    const jf = this.jobFileRepository.create({
      jobId,
      category,
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadedByUserId: userId,
    });
    return this.jobFileRepository.save(jf);
  }

  async linkFile(jobId: number, sourceJobId: number, fileId: number): Promise<JobFile> {
    await this.findOne(jobId);
    const sourceFile = await this.jobFileRepository.findOne({
      where: { id: fileId, jobId: sourceJobId },
    });
    if (!sourceFile) throw new NotFoundException('Source file not found');

    const linked = this.jobFileRepository.create({
      jobId,
      category: sourceFile.category,
      fileName: sourceFile.fileName,
      filePath: sourceFile.filePath,
      fileSize: sourceFile.fileSize,
      mimeType: sourceFile.mimeType,
      linkedFromJobId: sourceJobId,
    });
    return this.jobFileRepository.save(linked);
  }

  async removeFile(jobId: number, fileId: number): Promise<void> {
    const jf = await this.jobFileRepository.findOne({ where: { id: fileId, jobId } });
    if (!jf) throw new NotFoundException('File not found');
    await this.jobFileRepository.remove(jf);
  }
}
