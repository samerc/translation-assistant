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
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { basename } from 'path';
import { ClientsService } from './clients.service.js';
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
import { Public } from '../../common/decorators/public.decorator.js';

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
    private readonly jwtService: JwtService,
  ) {}

  // ── Clients ──

  @Get()
  @RequirePermissions('clients:read')
  findAll(
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
    });
  }

  @Get(':id')
  @RequirePermissions('clients:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.findOne(id);
  }

  @Post()
  @RequirePermissions('clients:create')
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('clients:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('clients:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.remove(id);
  }

  // ── Emails ──

  @Post(':id/emails')
  @RequirePermissions('clients:update')
  addEmail(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateClientEmailDto) {
    return this.clientsService.addEmail(id, dto);
  }

  @Patch(':id/emails/:emailId')
  @RequirePermissions('clients:update')
  updateEmail(@Param('id', ParseIntPipe) id: number, @Param('emailId', ParseIntPipe) emailId: number, @Body() dto: CreateClientEmailDto) {
    return this.clientsService.updateEmail(id, emailId, dto);
  }

  @Delete(':id/emails/:emailId')
  @RequirePermissions('clients:update')
  removeEmail(@Param('id', ParseIntPipe) id: number, @Param('emailId', ParseIntPipe) emailId: number) {
    return this.clientsService.removeEmail(id, emailId);
  }

  // ── Phones ──

  @Post(':id/phones')
  @RequirePermissions('clients:update')
  addPhone(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateClientPhoneDto) {
    return this.clientsService.addPhone(id, dto);
  }

  @Patch(':id/phones/:phoneId')
  @RequirePermissions('clients:update')
  updatePhone(@Param('id', ParseIntPipe) id: number, @Param('phoneId', ParseIntPipe) phoneId: number, @Body() dto: CreateClientPhoneDto) {
    return this.clientsService.updatePhone(id, phoneId, dto);
  }

  @Delete(':id/phones/:phoneId')
  @RequirePermissions('clients:update')
  removePhone(@Param('id', ParseIntPipe) id: number, @Param('phoneId', ParseIntPipe) phoneId: number) {
    return this.clientsService.removePhone(id, phoneId);
  }

  // ── Addresses ──

  @Post(':id/addresses')
  @RequirePermissions('clients:update')
  addAddress(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateClientAddressDto) {
    return this.clientsService.addAddress(id, dto);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions('clients:update')
  updateAddress(@Param('id', ParseIntPipe) id: number, @Param('addressId', ParseIntPipe) addressId: number, @Body() dto: CreateClientAddressDto) {
    return this.clientsService.updateAddress(id, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions('clients:update')
  removeAddress(@Param('id', ParseIntPipe) id: number, @Param('addressId', ParseIntPipe) addressId: number) {
    return this.clientsService.removeAddress(id, addressId);
  }

  // ── Contacts ──

  @Get(':id/contacts')
  @RequirePermissions('clients:read')
  findContacts(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.findContacts(id);
  }

  @Post(':id/contacts')
  @RequirePermissions('clients:create')
  createContact(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateContactDto) {
    return this.clientsService.createContact(id, dto);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermissions('clients:update')
  updateContact(
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body() dto: UpdateContactDto,
  ) {
    return this.clientsService.updateContact(id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('clients:delete')
  removeContact(
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
  ) {
    return this.clientsService.removeContact(id, contactId);
  }

  // ── Passport Copies ──

  @Get(':id/passports')
  @RequirePermissions('clients:read')
  findPassportCopies(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.findPassportCopies(id);
  }

  @Post(':id/passports')
  @RequirePermissions('clients:create')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  createPassportCopy(
    @Param('id', ParseIntPipe) id: number,
    @Body('label') label: string,
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
  ) {
    return this.clientsService.createPassportCopy(id, label || 'Passport', file);
  }

  @Get(':id/passports/:copyId/file')
  @Public()
  async viewPassportCopy(
    @Param('id', ParseIntPipe) id: number,
    @Param('copyId', ParseIntPipe) copyId: number,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      res.status(401).json({ message: 'Token required' });
      return;
    }

    try {
      this.jwtService.verify(token);
    } catch {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }

    const pc = await this.clientsService.getPassportCopy(id, copyId);
    if (!existsSync(pc.filePath)) {
      throw new NotFoundException('File not found on disk');
    }
    const safeName = basename(pc.originalName).replace(/[^\w.\-]/g, '_');
    res.setHeader('Content-Type', pc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    const stream = createReadStream(pc.filePath);
    stream.pipe(res);
  }

  @Delete(':id/passports/:copyId')
  @RequirePermissions('clients:delete')
  removePassportCopy(
    @Param('id', ParseIntPipe) id: number,
    @Param('copyId', ParseIntPipe) copyId: number,
  ) {
    return this.clientsService.removePassportCopy(id, copyId);
  }
}
