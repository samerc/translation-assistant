import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { appConfig } from './config/app.config.js';
import { databaseConfig } from './config/database.config.js';
import { HoneypotGuard } from './common/guards/honeypot.guard.js';
import { AbuseDetectionGuard } from './common/guards/abuse-detection.guard.js';
import { WriteThrottleGuard } from './common/guards/write-throttle.guard.js';
// AdminGuard is imported per-controller, not globally
import { MailModule } from './modules/mail/mail.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { TranslateModule } from './modules/translate/translate.module.js';
import { InvoicesModule } from './modules/invoices/invoices.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { CalendarModule } from './modules/calendar/calendar.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SearchModule } from './modules/search/search.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    TypeOrmModule.forRoot(databaseConfig()),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 300,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    MailModule,
    AuthModule,
    UsersModule,
    RolesModule,
    SettingsModule,
    ClientsModule,
    TemplatesModule,
    JobsModule,
    DocumentsModule,
    TranslateModule,
    InvoicesModule,
    NotificationsModule,
    CalendarModule,
    ReportsModule,
    SearchModule,
  ],
  controllers: [],
  providers: [
    // Guards execute in registration order.
    // 1. Honeypot — reject bots before anything else
    { provide: APP_GUARD, useClass: HoneypotGuard },
    // 2. Abuse detection — block SQL/XSS payloads
    { provide: APP_GUARD, useClass: AbuseDetectionGuard },
    // 3. Global rate limit — 100 req/min total
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 4. Write throttle — 120 writes/min per user/IP
    { provide: APP_GUARD, useClass: WriteThrottleGuard },
    // AdminGuard is NOT global — it's added per-controller via @UseGuards()
    // because it needs req.user which is set by AuthGuard('jwt') at controller level
  ],
})
export class AppModule {}
