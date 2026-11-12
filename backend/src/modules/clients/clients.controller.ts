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
import { pipeline } from 'stream';
import { FileInterceptor } from '@nestjs/platform-express';
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
import {
  FileValidationPipe,
  UPLOAD_HARD_LIMIT_BYTES,
} from '../../common/pipes/file-validation.pipe.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { tenantDiskStorage } from '../../common/tenancy/tenant-upload-storage.js';
import { contentDisposition } from '../../common/utils/content-disposition.js';

const uploadStorage = tenantDiskStorage('passports');

@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly authService: AuthService,
  ) {}

  // ── Clients ──

  @Get()
  @RequirePermissions('clients:read')
  findAll(
    @CurrentActor() actor: Actor,
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
      actor,
    });
  }

  @Get(':id')
  @RequirePermissions('clients:read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.findOne(id);
  }

  @Post()
  @RequirePermissions('clients:create')
  create(@Body() dto: CreateClientDto, @CurrentActor() actor: Actor) {
    return this.clientsService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('clients:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('clients:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.remove(id);
  }

  // ── Emails ──

  @Post(':id/emails')
  @RequirePermissions('clients:update')
  async addEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientEmailDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.addEmail(id, dto);
  }

  @Patch(':id/emails/:emailId')
  @RequirePermissions('clients:update')
  async updateEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emailId', ParseUUIDPipe) emailId: string,
    @Body() dto: CreateClientEmailDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.updateEmail(id, emailId, dto);
  }

  @Delete(':id/emails/:emailId')
  @RequirePermissions('clients:update')
  async removeEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emailId', ParseUUIDPipe) emailId: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.removeEmail(id, emailId);
  }

  // ── Phones ──

  @Post(':id/phones')
  @RequirePermissions('clients:update')
  async addPhone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientPhoneDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.addPhone(id, dto);
  }

  @Patch(':id/phones/:phoneId')
  @RequirePermissions('clients:update')
  async updatePhone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('phoneId', ParseUUIDPipe) phoneId: string,
    @Body() dto: CreateClientPhoneDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.updatePhone(id, phoneId, dto);
  }

  @Delete(':id/phones/:phoneId')
  @RequirePermissions('clients:update')
  async removePhone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('phoneId', ParseUUIDPipe) phoneId: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.removePhone(id, phoneId);
  }

  // ── Addresses ──

  @Post(':id/addresses')
  @RequirePermissions('clients:update')
  async addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientAddressDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.addAddress(id, dto);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions('clients:update')
  async updateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: CreateClientAddressDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.updateAddress(id, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions('clients:update')
  async removeAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.removeAddress(id, addressId);
  }

  // ── Contacts ──

  @Get(':id/contacts')
  @RequirePermissions('clients:read')
  async findContacts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.findContacts(id);
  }

  @Post(':id/contacts')
  @RequirePermissions('clients:create')
  async createContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContactDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.createContact(id, dto);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermissions('clients:update')
  async updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateContactDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.updateContact(id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('clients:delete')
  async removeContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.removeContact(id, contactId);
  }

  // ── Passport Copies ──

  @Get(':id/passports')
  @RequirePermissions('clients:read')
  async findPassportCopies(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.findPassportCopies(id);
  }

  @Post(':id/passports')
  @RequirePermissions('clients:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: uploadStorage,
      limits: { fileSize: UPLOAD_HARD_LIMIT_BYTES },
    }),
  )
  async createPassportCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('label') label: string,
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    const safeLabel =
      typeof label === 'string' ? label.slice(0, 255) : 'Passport';
    return this.clientsService.createPassportCopy(
      id,
      safeLabel || 'Passport',
      file,
    );
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

    let actor: Actor;
    try {
      actor = await this.authService.actorForFileToken(token);
    } catch {
      res.status(401).json({ message: 'Invalid or expired file token' });
      return;
    }

    // The file token proves identity but is not resource-bound — enforce that the
    // token's owner actually has access to this client (same tenant, visible to
    // them) before serving the PII image.
    try {
      await this.clientsService.verifyClientAccess(id, actor);
    } catch {
      res.status(403).json({ message: 'You do not have access to this file' });
      return;
    }

    const pc = await this.clientsService.getPassportCopy(id, copyId);
    if (!existsSync(pc.filePath)) {
      throw new NotFoundException('File not found on disk');
    }
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'application/pdf',
    ];
    const safeMimeType = allowedMimeTypes.includes(pc.mimeType)
      ? pc.mimeType
      : 'application/octet-stream';
    res.setHeader('Content-Type', safeMimeType);
    res.setHeader(
      'Content-Disposition',
      contentDisposition(basename(pc.originalName), 'inline'),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // pipeline handles a read error or client abort instead of an unhandled 'error'
    pipeline(createReadStream(pc.filePath), res, () => {
      /* nothing to clean up — the file stays */
    });
  }

  @Delete(':id/passports/:copyId')
  @RequirePermissions('clients:delete')
  async removePassportCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('copyId', ParseUUIDPipe) copyId: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.clientsService.verifyClientAccess(id, actor);
    return this.clientsService.removePassportCopy(id, copyId);
  }
}
