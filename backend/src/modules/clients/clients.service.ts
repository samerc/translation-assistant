import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity.js';
import { Contact } from './entities/contact.entity.js';
import { PassportCopy } from './entities/passport-copy.entity.js';
import { ClientEmail } from './entities/client-email.entity.js';
import { ClientPhone } from './entities/client-phone.entity.js';
import { ClientAddress } from './entities/client-address.entity.js';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto.js';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto.js';
import {
  CreateClientEmailDto,
  CreateClientPhoneDto,
  CreateClientAddressDto,
} from './dto/client-detail.dto.js';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(PassportCopy)
    private readonly passportCopyRepository: Repository<PassportCopy>,
    @InjectRepository(ClientEmail)
    private readonly emailRepository: Repository<ClientEmail>,
    @InjectRepository(ClientPhone)
    private readonly phoneRepository: Repository<ClientPhone>,
    @InjectRepository(ClientAddress)
    private readonly addressRepository: Repository<ClientAddress>,
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
      .leftJoinAndSelect('client.emails', 'emails')
      .leftJoinAndSelect('client.phones', 'phones')
      .loadRelationCountAndMap('client.contactsCount', 'client.contacts');

    if (search) {
      qb.andWhere(
        '(client.name LIKE :search OR emails.email LIKE :search OR phones.phone LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (type) {
      qb.andWhere('client.type = :type', { type });
    }

    const allowedSortFields = ['name', 'type', 'createdAt', 'updatedAt'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';
    qb.orderBy(`client.${safeSortBy}`, sortOrder === 'DESC' ? 'DESC' : 'ASC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['emails', 'phones', 'addresses', 'contacts', 'passportCopies'],
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

  // ── Emails ──

  async addEmail(clientId: number, dto: CreateClientEmailDto): Promise<ClientEmail> {
    await this.findOne(clientId);
    const email = this.emailRepository.create({ ...dto, clientId });
    return this.emailRepository.save(email);
  }

  async removeEmail(clientId: number, emailId: number): Promise<void> {
    const email = await this.emailRepository.findOne({ where: { id: emailId, clientId } });
    if (!email) throw new NotFoundException('Email not found');
    await this.emailRepository.remove(email);
  }

  // ── Phones ──

  async addPhone(clientId: number, dto: CreateClientPhoneDto): Promise<ClientPhone> {
    await this.findOne(clientId);
    const phone = this.phoneRepository.create({ ...dto, clientId });
    return this.phoneRepository.save(phone);
  }

  async removePhone(clientId: number, phoneId: number): Promise<void> {
    const phone = await this.phoneRepository.findOne({ where: { id: phoneId, clientId } });
    if (!phone) throw new NotFoundException('Phone not found');
    await this.phoneRepository.remove(phone);
  }

  // ── Addresses ──

  async addAddress(clientId: number, dto: CreateClientAddressDto): Promise<ClientAddress> {
    await this.findOne(clientId);
    const address = this.addressRepository.create({ ...dto, clientId });
    return this.addressRepository.save(address);
  }

  async removeAddress(clientId: number, addressId: number): Promise<void> {
    const address = await this.addressRepository.findOne({ where: { id: addressId, clientId } });
    if (!address) throw new NotFoundException('Address not found');
    await this.addressRepository.remove(address);
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
    await this.findOne(clientId);
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
  }
}
