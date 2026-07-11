import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Invoice } from './entities/invoice.entity.js';
import { InvoiceItem } from './entities/invoice-item.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { AppSettings } from '../settings/entities/app-settings.entity.js';
import { CreateInvoiceDto, UpdateInvoiceDto, RecordPaymentDto } from './dto/invoice.dto.js';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly itemRepository: Repository<InvoiceItem>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(JobUser)
    private readonly jobUserRepository: Repository<JobUser>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
    private readonly dataSource: DataSource,
  ) {}

  // Verify user has access to this invoice (created it or has access to a linked job)
  async verifyInvoiceAccess(invoiceId: string, userId: string, isAdmin: boolean): Promise<Invoice> {
    const invoice = await this.findOne(invoiceId);
    if (isAdmin) return invoice;

    // Check if user created the invoice
    if (invoice.createdByUserId === userId) return invoice;

    // Check if user has access to any linked job (batch lookup)
    const jobIds = invoice.items.filter((i) => i.jobId).map((i) => i.jobId);
    if (jobIds.length > 0) {
      const assignment = await this.jobUserRepository.findOne({
        where: { jobId: In(jobIds), userId },
      });
      if (assignment) return invoice;
    }

    throw new ForbiddenException('You do not have access to this invoice');
  }

  async verifyJobAccess(jobId: string, userId: string, isAdmin: boolean): Promise<void> {
    if (isAdmin) return;
    const assignment = await this.jobUserRepository.findOne({
      where: { jobId, userId },
    });
    if (!assignment) {
      throw new ForbiddenException('You do not have access to this job');
    }
  }

  private static readonly VALID_TRANSITIONS: Record<string, string[]> = {
    draft: ['sent', 'cancelled'],
    sent: ['paid', 'overdue', 'cancelled'],
    overdue: ['paid', 'cancelled'],
    paid: [],
    cancelled: ['draft'],
  };

  private async generateInvoiceNumber(): Promise<string> {
    const settings = await this.settingsRepository.find();
    const prefix = settings[0]?.invoicePrefix || 'INV-';
    // Use MAX of existing invoice numbers to avoid race conditions
    // Even with concurrent requests, the unique constraint will catch duplicates
    const result = await this.invoiceRepository
      .createQueryBuilder('inv')
      .select('MAX(CAST(SUBSTRING(inv.invoiceNumber, :prefixLen + 1) AS UNSIGNED))', 'maxNum')
      .setParameter('prefixLen', prefix.length)
      .getRawOne();
    const nextNum = (parseInt(result?.maxNum || '0', 10)) + 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  private calculateTotals(items: { quantity: number; unitPrice: number }[], taxRate: number) {
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
    const taxAmount = Math.round(subtotal * taxRate) / 100;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }

  async findAll(query: {
    search?: string;
    status?: string;
    clientId?: string;
    from?: string;
    to?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    page?: number;
    limit?: number;
    userId?: string;
    isAdmin?: boolean;
  }) {
    const { search, status, clientId, from, to, sortBy = 'createdAt', sortOrder = 'DESC' } = query;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(Math.max(1, query.limit || 25), 100);

    const qb = this.invoiceRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .loadRelationCountAndMap('inv.itemCount', 'inv.items');

    // Non-admins: only see invoices they created or where they have access to linked jobs
    if (query.userId && !query.isAdmin) {
      qb.andWhere(
        `(inv.created_by_user_id = :userId OR EXISTS (
          SELECT 1 FROM invoice_items ii
          INNER JOIN job_users ju ON ju.job_id = ii.job_id AND ju.user_id = :userId
          WHERE ii.invoice_id = inv.id
        ))`,
        { userId: query.userId },
      );
    }

    if (search) {
      qb.andWhere('(inv.invoiceNumber LIKE :search OR client.name LIKE :search)', { search: `%${search}%` });
    }
    if (status) {
      qb.andWhere('inv.status = :status', { status });
    }
    if (clientId) {
      qb.andWhere('inv.client_id = :clientId', { clientId });
    }
    if (from) {
      qb.andWhere('inv.issueDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('inv.issueDate <= :to', { to });
    }

    const allowedSortFields = ['invoiceNumber', 'status', 'issueDate', 'dueDate', 'total', 'createdAt'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    qb.orderBy(`inv.${safeSortBy}`, sortOrder === 'ASC' ? 'ASC' : 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByJob(jobId: string): Promise<Invoice[]> {
    return this.invoiceRepository
      .createQueryBuilder('inv')
      .innerJoin('inv.items', 'item', 'item.job_id = :jobId', { jobId })
      .leftJoinAndSelect('inv.client', 'client')
      .getMany();
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .leftJoinAndSelect('inv.items', 'items')
      .leftJoin('items.job', 'job')
      .addSelect(['job.id', 'job.jobNumber', 'job.title'])
      .where('inv.id = :id', { id })
      .orderBy('items.sortOrder', 'ASC')
      .getOne();
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async create(dto: CreateInvoiceDto, userId: string): Promise<Invoice> {
    // Validate all entities in parallel
    const jobIds = dto.items.filter((i) => i.jobId).map((i) => i.jobId!);
    const [client, jobs, settings] = await Promise.all([
      this.clientRepository.findOne({ where: { id: dto.clientId } }),
      jobIds.length > 0 ? this.jobRepository.find({ where: { id: In(jobIds) } }) : Promise.resolve([]),
      this.settingsRepository.find(),
    ]);

    if (!client) throw new BadRequestException('Client not found');

    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    for (const item of dto.items) {
      if (item.jobId) {
        const job = jobMap.get(item.jobId);
        if (!job) throw new BadRequestException('One of the linked jobs was not found');
        if (job.clientId !== dto.clientId) {
          throw new BadRequestException('One of the linked jobs does not belong to this client');
        }
      }
    }
    const currency = dto.currency || settings[0]?.baseCurrency || 'USD';
    const taxRate = dto.taxRate || 0;
    const { subtotal, taxAmount, total } = this.calculateTotals(dto.items, taxRate);

    const invoiceNumber = await this.generateInvoiceNumber();

    // Wrap invoice + items creation in a transaction
    const savedId = await this.dataSource.transaction(async (manager) => {
      const invoice = manager.create(Invoice, {
        invoiceNumber,
        clientId: dto.clientId,
        status: 'draft',
        issueDate: dto.issueDate,
        dueDate: dto.dueDate,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: dto.notes,
        currency,
        createdByUserId: userId,
      });

      const saved = await manager.save(invoice);

      const items = dto.items.map((item, i) =>
        manager.create(InvoiceItem, {
          invoiceId: saved.id,
          jobId: item.jobId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: Number(item.quantity) * Number(item.unitPrice),
          sortOrder: i,
        }),
      );
      await manager.save(items);

      return saved.id;
    });

    return this.findOne(savedId);
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be edited');
    }

    if (dto.issueDate) invoice.issueDate = dto.issueDate;
    if (dto.dueDate) invoice.dueDate = dto.dueDate;
    if (dto.notes !== undefined) invoice.notes = dto.notes;
    if (dto.currency) invoice.currency = dto.currency;
    if (dto.taxRate !== undefined) invoice.taxRate = dto.taxRate;

    // Replace items if provided
    if (dto.items) {
      await this.itemRepository.delete({ invoiceId: id });
      const items = dto.items.map((item, i) =>
        this.itemRepository.create({
          invoiceId: id,
          jobId: item.jobId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: Number(item.quantity) * Number(item.unitPrice),
          sortOrder: i,
        }),
      );
      await this.itemRepository.save(items);
    }

    // Recalculate totals
    const allItems = dto.items || invoice.items;
    const { subtotal, taxAmount, total } = this.calculateTotals(
      allItems.map((i) => ({ quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
      Number(invoice.taxRate),
    );
    invoice.subtotal = subtotal;
    invoice.taxAmount = taxAmount;
    invoice.total = total;

    await this.invoiceRepository.save(invoice);
    return this.findOne(id);
  }

  async updateStatus(id: string, status: string): Promise<Invoice> {
    const invoice = await this.findOne(id);
    const validNext = InvoicesService.VALID_TRANSITIONS[invoice.status] || [];
    if (!validNext.includes(status)) {
      throw new BadRequestException('This status transition is not allowed');
    }

    const oldStatus = invoice.status;
    invoice.status = status;

    // Batch update linked jobs
    const jobIds = invoice.items.filter((i) => i.jobId).map((i) => i.jobId);
    if (jobIds.length > 0) {
      if (status === 'sent') {
        await this.jobRepository.update(
          { id: In(jobIds), status: 'delivered' },
          { status: 'invoiced' },
        );
      }
      if (status === 'cancelled' && ['sent', 'overdue'].includes(oldStatus)) {
        await this.jobRepository.update(
          { id: In(jobIds), status: 'invoiced' },
          { status: 'delivered' },
        );
      }
    }

    await this.invoiceRepository.save(invoice);
    return this.findOne(id);
  }

  async recordPayment(id: string, dto: RecordPaymentDto): Promise<Invoice> {
    const invoice = await this.findOne(id);
    if (!['sent', 'overdue'].includes(invoice.status)) {
      throw new BadRequestException('Can only record payment for sent or overdue invoices');
    }

    invoice.status = 'paid';
    invoice.paidAmount = dto.paidAmount;
    invoice.paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    // Batch transition linked jobs to 'paid'
    const jobIds = invoice.items.filter((i) => i.jobId).map((i) => i.jobId);
    if (jobIds.length > 0) {
      await this.jobRepository.update(
        { id: In(jobIds), status: In(['invoiced', 'delivered']) },
        { status: 'paid' },
      );
    }

    await this.invoiceRepository.save(invoice);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be deleted');
    }
    await this.invoiceRepository.remove(invoice);
  }
}
