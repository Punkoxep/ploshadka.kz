import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || '3000',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'super-secret-jwt-key-sharing-ploshadka-2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  TTLOCK_CLIENT_ID: process.env.TTLOCK_CLIENT_ID || '4ff25d12b645422e96321c854c9f56a2',
  TTLOCK_CLIENT_SECRET: process.env.TTLOCK_CLIENT_SECRET || 'c84465e4a4b15d8cc39fb83eb5a51f88',
  TTLOCK_API_BASE_URL: process.env.TTLOCK_API_BASE_URL || 'https://euapi.ttlock.com',
  TTLOCK_API_URL: process.env.TTLOCK_API_URL || 'https://euapi.ttlock.com',
  TTLOCK_USERNAME: process.env.TTLOCK_USERNAME || 'admin_ttlock',
  TTLOCK_PASSWORD_MD5: process.env.TTLOCK_PASSWORD_MD5 || 'e10adc3949ba59abbe56e057f20f883e',
  TTLOCK_MODE: process.env.TTLOCK_MODE || 'mock',
  CRON_GATEWAY_MONITOR: process.env.CRON_GATEWAY_MONITOR || '*/3 * * * *',
};
