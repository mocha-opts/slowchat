import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";

import { APP_CONFIG, type AppConfig } from "../../platform/config/app-config.js";

export const MEDIA_QUEUE_NAME = "im-media";

@Injectable()
export class MediaQueueService implements OnApplicationShutdown {
  readonly queue: Queue;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.queue = new Queue(MEDIA_QUEUE_NAME, {
      connection: { url: config.redis.jobsUrl, maxRetriesPerRequest: 1 },
      prefix: config.redis.jobsPrefix,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000, jitter: 0.25 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    });
  }

  async enqueue(attachmentId: string): Promise<void> {
    await this.queue.add(
      "process",
      { attachmentId, version: 1 },
      { jobId: `media:${attachmentId}:v1` },
    );
  }

  /** 上传会话到期后由同一 Jobs Redis 执行清理；Job ID 稳定，重复创建不会重复清理。 */
  async enqueueExpiration(uploadId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      "expire",
      { uploadId, version: 1 },
      { jobId: `media-expire:${uploadId}:v1`, delay: Math.max(0, delayMs) },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
