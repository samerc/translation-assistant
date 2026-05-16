import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'mariadb',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'translation_user',
  password: process.env.DB_PASSWORD || 'translation_pass',
  database: process.env.DB_DATABASE || 'translation_assistant',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: true, // TODO: use migrations in production once schema is stable
  charset: 'utf8mb4',
  logging: process.env.NODE_ENV === 'development',
});
