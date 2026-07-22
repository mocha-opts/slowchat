export interface ObjectStoragePort {
  ensureBucket(): Promise<void>;
  isReady(): Promise<boolean>;
  createPresignedPutUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
  headObject(objectKey: string): Promise<{
    sizeBytes: number;
    contentType: string | null;
    etag: string | null;
  }>;
  deleteObject(objectKey: string): Promise<void>;
  createPresignedGetUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
  readObject(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
