export interface StoreParams {
  orgId: string;
  fileId: string;
  originalName: string;
  mimetype: string;
  buffer: Buffer;
}

export interface StoreResult {
  /** Path persisted to the database — stable identifier, adapter-specific format. */
  storagePath: string;
  /** Sanitized filename as stored (spaces removed, safe characters only). */
  storedFileName: string;
}

export interface StorageAdapter {
  /** Persist a file binary. Returns stable path and stored name. */
  store(params: StoreParams): Promise<StoreResult>;

  /** Delete a stored file by its persisted storagePath. */
  delete(storagePath: string): Promise<void>;

  /**
   * Return a URL the API can redirect to, or null if the adapter serves
   * files via a dedicated download endpoint (e.g. local disk).
   * When null, the route handler should stream the file itself.
   */
  getPublicUrl(storagePath: string): string | null;
}
