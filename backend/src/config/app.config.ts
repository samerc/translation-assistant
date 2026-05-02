export const appConfig = () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
    accessTokenTtl: parseInt(process.env.JWT_ACCESS_TTL || '900', 10), // 15 minutes
    refreshTokenTtl: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10), // 7 days
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  upload: {
    maxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5', 10),
    destination: process.env.UPLOAD_DEST || './uploads',
  },
});
