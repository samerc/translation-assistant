import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { seed } from './config/seed.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3080',
    credentials: true,
  });

  // Global exception filter — sanitizes all error responses, logs details server-side
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  // Graceful shutdown — drains connection pool on SIGTERM/SIGINT
  app.enableShutdownHooks();

  // Run seed on first startup
  const dataSource = app.get(DataSource);
  await seed(dataSource);

  const port = process.env.PORT || 3005;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}/api`);
}
bootstrap();
