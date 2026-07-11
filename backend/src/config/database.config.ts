import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const isProduction = process.env.NODE_ENV === 'production';

// Schema management strategy:
//  - Dev: `synchronize` auto-syncs entities → schema for fast iteration.
//  - Prod: `synchronize` OFF, migrations run on boot (`migrationsRun`).
// Override explicitly with DB_SYNCHRONIZE=true|false if needed (e.g. to disable
// sync in a staging env). See src/migrations and the "Database & Performance" notes
// in CLAUDE.md for the baseline-migration cutover.
const synchronize =
  process.env.DB_SYNCHRONIZE !== undefined
    ? process.env.DB_SYNCHRONIZE === 'true'
    : !isProduction;

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'mariadb',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'translation_user',
  password: process.env.DB_PASSWORD || 'translation_pass',
  database: process.env.DB_DATABASE || 'translation_assistant',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize,
  migrationsRun: !synchronize, // run pending migrations on boot when not syncing
  charset: 'utf8mb4',
  logging: process.env.NODE_ENV === 'development',
  extra: {
    connectionLimit: parseInt(process.env.DB_POOL_SIZE || '20', 10),
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 10000,
    idleTimeout: 30000,
  },
});
