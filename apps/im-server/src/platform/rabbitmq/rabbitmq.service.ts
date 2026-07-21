import { randomUUID } from "node:crypto";
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import amqp, {
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type Options,
} from "amqplib";
import { PinoLogger } from "nestjs-pino";

import { APP_CONFIG, type AppConfig } from "../config/app-config.js";

type ReturnedMessage = ConsumeMessage & {
  readonly fields: ConsumeMessage["fields"] & {
    readonly replyCode: number;
    readonly replyText: string;
  };
};

@Injectable()
export class RabbitMqService implements OnModuleInit, OnApplicationShutdown {
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private shuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RabbitMqService.name);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      this.logger.error({ err: error }, "Initial RabbitMQ connection failed");
      this.scheduleReconnect();
    }
  }

  isReady(): boolean {
    return Boolean(this.connection && this.channel);
  }

  async publish(
    exchange: string,
    routingKey: string,
    body: Buffer,
    options: Options.Publish = {},
  ): Promise<void> {
    const channel = this.channel;
    if (!channel) {
      throw new Error("RabbitMQ confirm channel is not ready");
    }
    await new Promise<void>((resolve, reject) => {
      const messageId = options.messageId ?? randomUUID();
      let returned: Error | undefined;
      const onReturn = (message: ReturnedMessage): void => {
        if (message.properties.messageId === messageId) {
          returned = new Error(
            `RabbitMQ message was unroutable (${message.fields.replyCode} ${message.fields.replyText})`,
          );
        }
      };
      channel.on("return", onReturn);
      channel.publish(
        exchange,
        routingKey,
        body,
        { mandatory: true, persistent: true, ...options, messageId },
        (error) => {
          channel.off("return", onReturn);
          if (error) {
            reject(
              error instanceof Error ? error : new Error("RabbitMQ publish was not confirmed"),
            );
            return;
          }
          if (returned) {
            reject(returned);
            return;
          }
          resolve();
        },
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const channel = this.channel;
    const connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const connection = await amqp.connect(this.config.rabbitMqUrl, { timeout: 5_000 });
    const channel = await connection.createConfirmChannel();
    this.connection = connection;
    this.channel = channel;

    connection.on("error", (error) => {
      this.logger.error({ err: error }, "RabbitMQ connection error");
    });
    connection.on("close", () => {
      this.connection = undefined;
      this.channel = undefined;
      if (!this.shuttingDown) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error: unknown) => {
        this.logger.error({ err: error }, "RabbitMQ reconnect failed");
        this.scheduleReconnect();
      });
    }, 1_000);
    this.reconnectTimer.unref();
  }
}
