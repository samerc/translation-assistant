import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsService } from './clients.service.js';
import { ClientsController } from './clients.controller.js';
import { Client } from './entities/client.entity.js';
import { Contact } from './entities/contact.entity.js';
import { PassportCopy } from './entities/passport-copy.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Contact, PassportCopy])],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
