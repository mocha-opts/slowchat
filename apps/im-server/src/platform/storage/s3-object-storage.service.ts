import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import type { ObjectStoragePort } from "./object-storage.port.js";

@Injectable()
export class S3ObjectStorageService
  implements ObjectStoragePort, OnModuleInit, OnApplicationShutdown
{
  private readonly client: S3Client;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.config.s3.autoCreateBucket) await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    if (await this.isReady()) return;
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.s3.bucket }));
    } catch (error) {
      if (!(await this.isReady())) throw error;
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.s3.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  createPresignedPutUrl(objectKey: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.config.s3.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  async headObject(objectKey: string) {
    try {
      const value = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.s3.bucket, Key: objectKey }),
      );
      return {
        sizeBytes: Number(value.ContentLength ?? 0),
        contentType: value.ContentType ?? null,
        etag: value.ETag ?? null,
      };
    } catch {
      throw new Error("Object was not found");
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.s3.bucket, Key: objectKey }),
    );
  }

  createPresignedGetUrl(objectKey: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.s3.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  async readObject(objectKey: string): Promise<AsyncIterable<Uint8Array>> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.s3.bucket, Key: objectKey }),
    );
    if (!response.Body) throw new Error("Object body was empty");
    return response.Body as AsyncIterable<Uint8Array>;
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
