import { config } from '../../config';
import type { StorageAdapter } from './adapter';
import { LocalStorageAdapter } from './local';
import { S3StorageAdapter } from './s3';

let _adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (_adapter) return _adapter;

  const driver = config.storageDriver;
  if (driver === 's3') {
    _adapter = new S3StorageAdapter();
  } else {
    _adapter = new LocalStorageAdapter(config.uploadsDir);
  }
  return _adapter;
}

export type { StorageAdapter } from './adapter';
export { LocalStorageAdapter } from './local';
