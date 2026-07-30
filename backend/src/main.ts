import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { seed } from './config/seed.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust the reverse proxy (IIS/ARR on the same host) so `req.ip` and rate-limit
  // keys reflect the real client, not the proxy's loopback address. 'loopback'
  // trusts only 127.0.0.1/::1 hops — safe in dev (direct clients aren't trusted).
  // Override with TRUST_PROXY (e.g. a hop count) if fronted differently.
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

  // Fail fast in production if the browser origin isn't pinned (avoid silently
  // falling back to localhost, which breaks auth cookies).
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN must be set in production');
  }

  // Security
  app.use(helmet());
  app.use(cookieParser());
  // Explicit request body-size limits (don't rely on the framework default).
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
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
