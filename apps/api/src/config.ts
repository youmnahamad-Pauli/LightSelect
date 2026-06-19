import 'dotenv/config';
import path from 'path';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Storage
  storageDriver: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',
  uploadsDir: process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'),
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024,
};
