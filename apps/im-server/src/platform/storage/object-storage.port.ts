export interface ObjectStoragePort {
  ensureBucket(): Promise<void>;
  isReady(): Promise<boolean>;
  createPresignedPutUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
