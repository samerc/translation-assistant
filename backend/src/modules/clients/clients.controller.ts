import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { basename } from 'path';
import { ClientsService } from './clients.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto.js';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto.js';
import {
  CreateClientEmailDto,
  CreateClientPhoneDto,
  CreateClientAddressDto,
} from './dto/client-detail.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { FileValidationPipe } from '../../common/pipes/file-validation.pipe.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { User } from '../users/entities/user.entity.js';

const uploadStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'passports'),
  filename: (_req, file, cb) => {
    const uniqueName = `${randomUUID()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly authService: AuthService,
  ) {}

  private isAdmin(user: User): boolean {
    return user.role?.name === 'Admin';
  }

  // ── Clients ──

  @Get()
  @RequirePermissions('clients:read')
  findAll(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('type') type?: 'company' | 'person',
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.clientsService.findAll({
      search,
      type,
      sortBy,
      sortOrder,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      userId: user.id,
      isAdmin: this.isAdmin(user),
    });
  }

  @Get(':id')
  @RequirePermissions('clients:read')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.findOne(id);
  }

  @Post()
  @RequirePermissions('clients:create')
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('clients:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('clients:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.remove(id);
  }

  // ── Emails ──

  @Post(':id/emails')
  @RequirePermissions('clients:update')
  async addEmail(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateClientEmailDto, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.addEmail(id, dto);
  }

  @Patch(':id/emails/:emailId')
  @RequirePermissions('clients:update')
  async updateEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emailId', ParseUUIDPipe) emailId: string,
    @Body() dto: CreateClientEmailDto,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.updateEmail(id, emailId, dto);
  }

  @Delete(':id/emails/:emailId')
  @RequirePermissions('clients:update')
  async removeEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emailId', ParseUUIDPipe) emailId: string,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.removeEmail(id, emailId);
  }

  // ── Phones ──

  @Post(':id/phones')
  @RequirePermissions('clients:update')
  async addPhone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateClientPhoneDto, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.addPhone(id, dto);
  }

  @Patch(':id/phones/:phoneId')
  @RequirePermissions('clients:update')
  async updatePhone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('phoneId', ParseUUIDPipe) phoneId: string,
    @Body() dto: CreateClientPhoneDto,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.updatePhone(id, phoneId, dto);
  }

  @Delete(':id/phones/:phoneId')
  @RequirePermissions('clients:update')
  async removePhone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('phoneId', ParseUUIDPipe) phoneId: string,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.removePhone(id, phoneId);
  }

  // ── Addresses ──

  @Post(':id/addresses')
  @RequirePermissions('clients:update')
  async addAddress(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateClientAddressDto, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.addAddress(id, dto);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions('clients:update')
  async updateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: CreateClientAddressDto,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.updateAddress(id, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions('clients:update')
  async removeAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.removeAddress(id, addressId);
  }

  // ── Contacts ──

  @Get(':id/contacts')
  @RequirePermissions('clients:read')
  async findContacts(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.findContacts(id);
  }

  @Post(':id/contacts')
  @RequirePermissions('clients:create')
  async createContact(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateContactDto, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.createContact(id, dto);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermissions('clients:update')
  async updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.updateContact(id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('clients:delete')
  async removeContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.removeContact(id, contactId);
  }

  // ── Passport Copies ──

  @Get(':id/passports')
  @RequirePermissions('clients:read')
  async findPassportCopies(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.findPassportCopies(id);
  }

  @Post(':id/passports')
  @RequirePermissions('clients:create')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async createPassportCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('label') label: string,
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    const safeLabel = typeof label === 'string' ? label.slice(0, 255) : 'Passport';
    return this.clientsService.createPassportCopy(id, safeLabel || 'Passport', file);
  }

  @Get(':id/passports/:copyId/file')
  @Public()
  async viewPassportCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('copyId', ParseUUIDPipe) copyId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      res.status(401).json({ message: 'Token required' });
      return;
    }

    let tokenUserId: string;
    try {
      tokenUserId = this.authService.verifyFileToken(token);
    } catch {
      res.status(401).json({ message: 'Invalid or expired file token' });
      return;
    }

    // The file token proves identity but is not resource-bound — enforce that the
    // token's owner actually has access to this client before serving the PII image.
    try {
      const profile = await this.authService.getProfile(tokenUserId);
      const isAdmin = profile.role?.name === 'Admin';
      await this.clientsService.verifyClientAccess(id, tokenUserId, isAdmin);
    } catch {
      res.status(403).json({ message: 'You do not have access to this file' });
      return;
    }

    const pc = await this.clientsService.getPassportCopy(id, copyId);
    if (!existsSync(pc.filePath)) {
      throw new NotFoundException('File not found on disk');
    }
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
      'application/pdf',
    ];
    const safeMimeType = allowedMimeTypes.includes(pc.mimeType)
      ? pc.mimeType
      : 'application/octet-stream';
    const safeName = basename(pc.originalName).replace(/[^\w.\-]/g, '_');
    res.setHeader('Content-Type', safeMimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = createReadStream(pc.filePath);
    stream.pipe(res);
  }

  @Delete(':id/passports/:copyId')
  @RequirePermissions('clients:delete')
  async removePassportCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('copyId', ParseUUIDPipe) copyId: string,
    @CurrentUser() user: User,
  ) {
    await this.clientsService.verifyClientAccess(id, user.id, this.isAdmin(user));
    return this.clientsService.removePassportCopy(id, copyId);
  }
}
