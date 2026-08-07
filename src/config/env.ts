import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || '3000',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'super-secret-jwt-key-sharing-ploshadka-2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  TTLOCK_CLIENT_ID: process.env.TTLOCK_CLIENT_ID || '',
  TTLOCK_CLIENT_SECRET: process.env.TTLOCK_CLIENT_SECRET || '',
  TTLOCK_API_BASE_URL: process.env.TTLOCK_API_BASE_URL || 'https://euapi.ttlock.com',
  TTLOCK_API_URL: process.env.TTLOCK_API_URL || 'https://euapi.ttlock.com',
  TTLOCK_MASTER_USERNAME: process.env.TTLOCK_MASTER_USERNAME || '',
  TTLOCK_MASTER_PASSWORD: process.env.TTLOCK_MASTER_PASSWORD || '',
  TTLOCK_MODE: process.env.TTLOCK_MODE || 'mock',
  CRON_GATEWAY_MONITOR: process.env.CRON_GATEWAY_MONITOR || '*/3 * * * *',
};
