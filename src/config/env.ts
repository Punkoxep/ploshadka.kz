import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || '3000',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sharing_ploshadka_db?schema=public',
  JWT_SECRET: process.env.JWT_SECRET || 'super-secret-jwt-key-sharing-ploshadka-2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  TTLOCK_CLIENT_ID: process.env.TTLOCK_CLIENT_ID || 'mock_client_id',
  TTLOCK_CLIENT_SECRET: process.env.TTLOCK_CLIENT_SECRET || 'mock_client_secret',
  TTLOCK_USERNAME: process.env.TTLOCK_USERNAME || 'admin_ttlock',
  TTLOCK_PASSWORD_MD5: process.env.TTLOCK_PASSWORD_MD5 || 'e10adc3949ba59abbe56e057f20f883e',
  TTLOCK_API_URL: process.env.TTLOCK_API_URL || 'https://euapi.ttlock.com',
  CRON_GATEWAY_MONITOR: process.env.CRON_GATEWAY_MONITOR || '*/3 * * * *',
};
