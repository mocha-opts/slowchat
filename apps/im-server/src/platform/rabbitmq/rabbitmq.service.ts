import { randomUUID } from "node:crypto";
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import amqp, {
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type Options,
} from "amqplib";
import { PinoLogger } from "nestjs-pino";

import { APP_CONFIG, type AppConfig } from "../config/app-config.js";

export const RABBIT_TOPOLOGY = {
  domainExchange: "im.domain.events",
  integrationExchange: "im.integration.events",
  retryExchange: "im.retry",
  deadLetterExchange: "im.dead-letter",
  realtimeQueue: "im.realtime-dispatch.q",
  realtimeDeadLetterQueue: "im.realtime-dispatch.dlq",
} as const;

type ReturnedMessage = ConsumeMessage & {
  readonly fields: ConsumeMessage["fields"] & {
    readonly replyCode: number;
    readonly replyText: string;
  };
};

export class PermanentRabbitMessageError extends Error {}

@Injectable()
export class RabbitMqService implements OnModuleInit, OnApplicationShutdown {
  private connection: ChannelModel | undefined;
  private publisher: ConfirmChannel | undefined;
  private consumer: Channel | undefined;
  private consumerTag: string | undefined;
  private realtimeHandler: ((message: ConsumeMessage) => Promise<void>) | undefined;
  private topologyReady = false;
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
    return Boolean(
      this.connection &&
      this.publisher &&
      this.topologyReady &&
      (!this.realtimeHandler || (this.consumer && this.consumerTag)),
    );
  }

  isPublisherReady(): boolean {
    return Boolean(this.publisher && this.topologyReady);
  }

  async publish(
    exchange: string,
    routingKey: string,
    body: Buffer,
    options: Options.Publish = {},
  ): Promise<void> {
    const channel = this.publisher;
    if (!channel) throw new Error("RabbitMQ confirm channel is not ready");
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
        {
          mandatory: true,
          persistent: true,
          contentType: "application/json",
          ...options,
          messageId,
        },
        (error) => {
          channel.off("return", onReturn);
          if (error) {
            reject(
              error instanceof Error ? error : new Error("RabbitMQ publish was not confirmed"),
            );
            return;
          }
          if (returned) reject(returned);
          else resolve();
        },
      );
    });
  }

  async consumeRealtime(handler: (message: ConsumeMessage) => Promise<void>): Promise<void> {
    this.realtimeHandler = handler;
    if (this.consumer && !this.consumerTag) await this.startRealtimeConsumer();
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const consumer = this.consumer;
    if (consumer && this.consumerTag) {
      await consumer.cancel(this.consumerTag).catch(() => undefined);
    }
    const publisher = this.publisher;
    const connection = this.connection;
    this.consumerTag = undefined;
    this.consumer = undefined;
    this.publisher = undefined;
    this.connection = undefined;
    this.topologyReady = false;
    await consumer?.close().catch(() => undefined);
    await publisher?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const connection = await amqp.connect(this.config.rabbitMqUrl, { timeout: 5_000 });
    const publisher = await connection.createConfirmChannel();
    const consumer = await connection.createChannel();
    this.connection = connection;
    this.publisher = publisher;
    this.consumer = consumer;
    await this.assertTopology(publisher);
    await consumer.prefetch(this.config.messaging.rabbitMqPrefetch);
    this.topologyReady = true;
    if (this.realtimeHandler) await this.startRealtimeConsumer();

    connection.on("error", (error) => {
      this.logger.error({ err: error }, "RabbitMQ connection error");
    });
    connection.on("close", () => this.connectionClosed());
    publisher.on("error", (error) => this.logger.error({ err: error }, "RabbitMQ publisher error"));
    consumer.on("error", (error) => this.logger.error({ err: error }, "RabbitMQ consumer error"));
  }

  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    await Promise.all([
      channel.assertExchange(RABBIT_TOPOLOGY.domainExchange, "topic", { durable: true }),
      channel.assertExchange(RABBIT_TOPOLOGY.integrationExchange, "topic", { durable: true }),
      channel.assertExchange(RABBIT_TOPOLOGY.retryExchange, "topic", { durable: true }),
      channel.assertExchange(RABBIT_TOPOLOGY.deadLetterExchange, "topic", { durable: true }),
    ]);
    await channel.assertQueue(RABBIT_TOPOLOGY.realtimeQueue, {
      durable: true,
      arguments: { "x-queue-type": "quorum" },
    });
    await channel.bindQueue(RABBIT_TOPOLOGY.realtimeQueue, RABBIT_TOPOLOGY.domainExchange, "#");
    for (const [index, delay] of this.config.messaging.rabbitMqRetryDelaysMs.entries()) {
      const queue = `${RABBIT_TOPOLOGY.realtimeQueue}.retry.${index}`;
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          "x-queue-type": "quorum",
          "x-message-ttl": delay,
          "x-dead-letter-exchange": RABBIT_TOPOLOGY.domainExchange,
        },
      });
      await channel.bindQueue(queue, RABBIT_TOPOLOGY.retryExchange, `realtime.${index}.#`);
    }
    await channel.assertQueue(RABBIT_TOPOLOGY.realtimeDeadLetterQueue, {
      durable: true,
      arguments: { "x-queue-type": "quorum" },
    });
    await channel.bindQueue(
      RABBIT_TOPOLOGY.realtimeDeadLetterQueue,
      RABBIT_TOPOLOGY.deadLetterExchange,
      "realtime.#",
    );
    await channel.waitForConfirms();
  }

  private async startRealtimeConsumer(): Promise<void> {
    const channel = this.consumer;
    const handler = this.realtimeHandler;
    if (!channel || !handler || this.consumerTag) return;
    const result = await channel.consume(
      RABBIT_TOPOLOGY.realtimeQueue,
      (message) => {
        if (!message) return;
        void this.handleDelivery(channel, message, handler);
      },
      { noAck: false },
    );
    this.consumerTag = result.consumerTag;
  }

  private async handleDelivery(
    channel: Channel,
    message: ConsumeMessage,
    handler: (message: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    try {
      await handler(message);
      channel.ack(message);
    } catch (error) {
      try {
        const permanent = error instanceof PermanentRabbitMessageError;
        const attempt = Number(message.properties.headers?.["x-retry-attempt"] ?? 0);
        if (permanent || attempt >= this.config.messaging.rabbitMqRetryDelaysMs.length) {
          await this.publish(
            RABBIT_TOPOLOGY.deadLetterExchange,
            `realtime.${message.fields.routingKey}`,
            message.content,
            {
              ...messageIdentifiers(message),
              headers: {
                ...message.properties.headers,
                "x-retry-attempt": attempt,
                "x-error": safeError(error),
              },
            },
          );
        } else {
          await this.publish(
            RABBIT_TOPOLOGY.retryExchange,
            `realtime.${attempt}.${message.fields.routingKey}`,
            message.content,
            {
              ...messageIdentifiers(message),
              headers: { ...message.properties.headers, "x-retry-attempt": attempt + 1 },
            },
          );
        }
        channel.ack(message);
      } catch (publishError) {
        this.logger.error({ err: publishError }, "RabbitMQ retry publish failed");
        await this.connection?.close().catch(() => undefined);
      }
    }
  }

  private connectionClosed(): void {
    this.connection = undefined;
    this.publisher = undefined;
    this.consumer = undefined;
    this.consumerTag = undefined;
    this.topologyReady = false;
    if (!this.shuttingDown) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.shuttingDown) return;
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

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown consumer error").slice(0, 500);
}

function stringProperty(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function messageIdentifiers(
  message: ConsumeMessage,
): Pick<Options.Publish, "messageId" | "correlationId"> {
  const messageId = stringProperty(message.properties.messageId);
  const correlationId = stringProperty(message.properties.correlationId);
  return {
    ...(messageId ? { messageId } : {}),
    ...(correlationId ? { correlationId } : {}),
  };
}
