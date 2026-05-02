import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsService } from './clients.service.js';
import { ClientsController } from './clients.controller.js';
import { Client } from './entities/client.entity.js';
import { Contact } from './entities/contact.entity.js';
import { PassportCopy } from './entities/passport-copy.entity.js';
import { ClientEmail } from './entities/client-email.entity.js';
import { ClientPhone } from './entities/client-phone.entity.js';
import { ClientAddress } from './entities/client-address.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      Contact,
      PassportCopy,
      ClientEmail,
      ClientPhone,
      ClientAddress,
    ]),
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
