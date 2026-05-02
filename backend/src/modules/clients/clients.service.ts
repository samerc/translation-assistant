import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { Client } from './entities/client.entity.js';
import { Contact } from './entities/contact.entity.js';
import { PassportCopy } from './entities/passport-copy.entity.js';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto.js';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto.js';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(PassportCopy)
    private readonly passportCopyRepository: Repository<PassportCopy>,
  ) {}

  // ── Clients ──

  async findAll(query: {
    search?: string;
    type?: 'company' | 'person';
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    page?: number;
    limit?: number;
  }) {
    const {
      search,
      type,
      sortBy = 'name',
      sortOrder = 'ASC',
      page = 1,
      limit = 25,
    } = query;

    const qb = this.clientRepository
      .createQueryBuilder('client')
      .loadRelationCountAndMap('client.contactsCount', 'client.contacts')
      .loadRelationCountAndMap('client.passportCopiesCount', 'client.passportCopies');

    if (search) {
      qb.andWhere(
        '(client.name LIKE :search OR client.email LIKE :search OR client.phone LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (type) {
      qb.andWhere('client.type = :type', { type });
    }

    const allowedSortFields = ['name', 'type', 'email', 'createdAt', 'updatedAt'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';
    qb.orderBy(`client.${safeSortBy}`, sortOrder === 'DESC' ? 'DESC' : 'ASC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['contacts', 'passportCopies'],
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(dto: CreateClientDto): Promise<Client> {
    const client = this.clientRepository.create(dto);
    const saved = await this.clientRepository.save(client);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateClientDto): Promise<Client> {
    const client = await this.findOne(id);
    Object.assign(client, dto);
    await this.clientRepository.save(client);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const client = await this.findOne(id);
    await this.clientRepository.remove(client);
  }

  // ── Contacts ──

  async findContacts(clientId: number): Promise<Contact[]> {
    const client = await this.findOne(clientId);
    if (client.type !== 'company') {
      throw new BadRequestException('Only company clients can have contacts');
    }
    return this.contactRepository.find({
      where: { clientId },
      order: { firstName: 'ASC' },
    });
  }

  async createContact(clientId: number, dto: CreateContactDto): Promise<Contact> {
    const client = await this.findOne(clientId);
    if (client.type !== 'company') {
      throw new BadRequestException('Only company clients can have contacts');
    }
    const contact = this.contactRepository.create({ ...dto, clientId });
    return this.contactRepository.save(contact);
  }

  async updateContact(clientId: number, contactId: number, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, clientId },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    Object.assign(contact, dto);
    return this.contactRepository.save(contact);
  }

  async removeContact(clientId: number, contactId: number): Promise<void> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, clientId },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    await this.contactRepository.remove(contact);
  }

  // ── Passport Copies ──

  async findPassportCopies(clientId: number): Promise<PassportCopy[]> {
    await this.findOne(clientId); // verify client exists
    return this.passportCopyRepository.find({
      where: { clientId },
      order: { uploadedAt: 'DESC' },
    });
  }

  async createPassportCopy(
    clientId: number,
    label: string,
    file: { path: string; originalname: string; mimetype: string; size: number },
  ): Promise<PassportCopy> {
    await this.findOne(clientId);
    const pc = this.passportCopyRepository.create({
      clientId,
      label,
      filePath: file.path,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    });
    return this.passportCopyRepository.save(pc);
  }

  async removePassportCopy(clientId: number, copyId: number): Promise<void> {
    const pc = await this.passportCopyRepository.findOne({
      where: { id: copyId, clientId },
    });
    if (!pc) throw new NotFoundException('Passport copy not found');
    await this.passportCopyRepository.remove(pc);
    // File deletion from disk would be handled here
  }
}
