import fs from 'fs';
import path from 'path';
import type { StorageAdapter, StoreParams, StoreResult } from './adapter';

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(uploadsDir: string) {
    this.root = uploadsDir;
    fs.mkdirSync(this.root, { recursive: true });
  }

  async store(params: StoreParams): Promise<StoreResult> {
    const { orgId, fileId, originalName, buffer } = params;
    const storedFileName = sanitize(originalName);
    const dir = path.join(this.root, orgId, fileId);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, storedFileName), buffer);

    const storagePath = `orgs/${orgId}/files/${fileId}/${storedFileName}`;
    return { storagePath, storedFileName };
  }

  async delete(storagePath: string): Promise<void> {
    // storagePath format: orgs/<orgId>/files/<fileId>/<filename>
    const parts = storagePath.split('/');
    if (parts.length < 5) return;
    const [, orgId, , fileId] = parts;
    const dir = path.join(this.root, orgId, fileId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  getPublicUrl(_storagePath: string): null {
    // Local files are served via the API download endpoint
    return null;
  }

  /** Resolve an absolute filesystem path from a storagePath. */
  resolvePath(storagePath: string): string | null {
    const parts = storagePath.split('/');
    if (parts.length < 5) return null;
    const [, orgId, , fileId, ...rest] = parts;
    return path.join(this.root, orgId, fileId, rest.join('/'));
  }
}
