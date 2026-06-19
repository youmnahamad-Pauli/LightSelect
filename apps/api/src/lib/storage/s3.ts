import type { StorageAdapter, StoreParams, StoreResult } from './adapter';

/**
 * S3StorageAdapter — not yet implemented.
 *
 * To activate:
 * 1. Set STORAGE_DRIVER=s3 in .env
 * 2. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * 3. Install: pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 * 4. Replace the TODOs below with real S3Client calls
 */
export class S3StorageAdapter implements StorageAdapter {
  async store(_params: StoreParams): Promise<StoreResult> {
    // TODO: const s3 = new S3Client({ region: process.env.AWS_REGION });
    // TODO: const key = `orgs/${orgId}/files/${fileId}/${sanitize(originalName)}`;
    // TODO: await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: buffer, ContentType: mimetype }));
    throw new Error('S3 adapter is not yet configured. Use STORAGE_DRIVER=local for development.');
  }

  async delete(_storagePath: string): Promise<void> {
    // TODO: await s3.send(new DeleteObjectCommand({ Bucket, Key: storagePath }));
    throw new Error('S3 adapter is not yet configured.');
  }

  getPublicUrl(_storagePath: string): string | null {
    // TODO: return a presigned GET URL or CloudFront URL
    return null;
  }
}
