// Read env inside the factory, never at module load: ConfigModule calls this
// after it has loaded .env, while this file is imported before that happens.
// (Reading at import time silently ignored JWT_SECRET / NODE_ENV from .env.)
function jwtSecret(): string {
  const secret =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'dev-only-secret-not-for-production');
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is required in production',
    );
  }
  return secret;
}

export const appConfig = () => ({
  port: parseInt(process.env.PORT || '3005', 10),
  jwt: {
    secret: jwtSecret(),
    accessTokenTtl: parseInt(process.env.JWT_ACCESS_TTL || '900', 10), // 15 minutes
    refreshTokenTtl: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10), // 7 days
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3080',
  },
  upload: {
    maxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5', 10),
    destination: process.env.UPLOAD_DEST || './uploads',
  },
});
