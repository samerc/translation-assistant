import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';

loadEnv();

/**
 * Standalone DataSource used by the TypeORM CLI (migration generate/run/revert).
 * The NestJS runtime uses databaseConfig() in database.config.ts — this file mirrors
 * the same connection settings so migrations run against the same database.
 *
 * Globs point at COMPILED output (dist/**), so build first (`npm run build`) before
 * running any migration command. Migration source files live in src/migrations/*.ts.
 */
export default new DataSource({
  type: 'mariadb',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'translation_user',
  password: process.env.DB_PASSWORD || 'translation_pass',
  database: process.env.DB_DATABASE || 'translation_assistant',
  charset: 'utf8mb4',
  entities: [__dirname + '/../**/*.entity.js'],
  migrations: [__dirname + '/../migrations/*.js'],
});
