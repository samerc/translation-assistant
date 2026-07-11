import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Controller,
  Post,
  Body,
  Get,
} from '@nestjs/common';
import { IsString, IsInt } from 'class-validator';
import request from 'supertest';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter.js';

/**
 * HTTP-level e2e coverage for the cross-cutting security layer that wraps every
 * endpoint: the GlobalExceptionFilter (sanitizes error responses) and the global
 * ValidationPipe (rejects malformed input). Deliberately DB-free so it runs in CI
 * without MariaDB — full endpoint coverage lives in test-all.sh against a live server.
 */
class SampleDto {
  @IsString()
  name!: string;

  @IsInt()
  count!: number;
}

@Controller()
class ProbeController {
  @Post('validate')
  validate(@Body() _dto: SampleDto) {
    return { ok: true };
  }

  @Get('boom')
  boom() {
    // Simulate an unexpected server-side failure with a sensitive message.
    throw new Error('sensitive: connection string password=super-secret');
  }
}

describe('Security layer (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects invalid input with a 400 and field messages', async () => {
    const res = await request(app.getHttpServer())
      .post('/validate')
      .send({ name: 123 })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('accepts valid input', async () => {
    await request(app.getHttpServer())
      .post('/validate')
      .send({ name: 'Alice', count: 3 })
      .expect(201);
  });

  it('sanitizes unexpected errors — no stack trace or secrets leak to the client', async () => {
    const res = await request(app.getHttpServer()).get('/boom').expect(500);

    expect(res.body).toEqual({
      statusCode: 500,
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
    });
    expect(JSON.stringify(res.body)).not.toContain('super-secret');
    expect(res.body.stack).toBeUndefined();
  });
});
