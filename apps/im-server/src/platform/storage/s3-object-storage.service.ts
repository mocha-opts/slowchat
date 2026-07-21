import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
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

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
