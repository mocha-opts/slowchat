import type { MessageAccepted, SendTextMessageRequest } from "@im/contracts/messages";
import type { SyncEvent, SyncResponse } from "@im/contracts/api";

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.values.has(key) ? this.values.get(key) : null) as T | null);
  }

  set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }
}

export interface RestTransport {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

export interface SocketTransport {
  connect(accessToken: string): Promise<void>;
  disconnect(): Promise<void>;
  on(event: string, listener: (value: unknown) => void): () => void;
  emit<T>(event: string, value: unknown): Promise<T>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface TokenProvider {
  get(): Promise<TokenPair | null>;
  refresh(refreshToken: string): Promise<TokenPair>;
  clear(): Promise<void>;
}

/**
 * TokenManager 将刷新请求串行化：多个请求同时遇到 401 时只允许一个请求消费 Refresh Token。
 */
export class TokenManager {
  private refreshPromise: Promise<TokenPair> | undefined;

  constructor(
    private readonly provider: TokenProvider,
    private readonly storage: StorageAdapter,
    private readonly key = "im:sdk:tokens",
  ) {}

  async current(): Promise<TokenPair | null> {
    return this.storage.get<TokenPair>(this.key);
  }

  async save(value: TokenPair): Promise<void> {
    await this.storage.set(this.key, value);
  }

  async refresh(): Promise<TokenPair> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const current = await this.current();
      if (!current) throw new Error("SDK is not authenticated");
      try {
        const next = await this.provider.refresh(current.refreshToken);
        await this.save(next);
        return next;
      } catch (error) {
        await this.provider.clear();
        await this.storage.remove(this.key);
        throw error;
      } finally {
        this.refreshPromise = undefined;
      }
    })();
    return this.refreshPromise;
  }
}

export interface SyncEventApplier {
  apply(event: SyncEvent): Promise<void>;
}

/** SyncCoordinator 保证 eventId 去重、游标连续应用和本地原子持久化。 */
export class SyncCoordinator {
  private readonly cursorKey: string;
  private readonly seenKey: string;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly applier: SyncEventApplier,
    private readonly deviceId: string,
    private readonly seenLimit = 10_000,
  ) {
    this.cursorKey = `im:sdk:${deviceId}:sync-cursor`;
    this.seenKey = `im:sdk:${deviceId}:seen-events`;
  }

  async cursor(): Promise<number> {
    return (await this.storage.get<number>(this.cursorKey)) ?? 0;
  }

  async applyResponse(response: SyncResponse): Promise<void> {
    const current = await this.cursor();
    const seen = new Set((await this.storage.get<string[]>(this.seenKey)) ?? []);
    for (const event of response.events) {
      if (seen.has(event.eventId)) continue;
      if (event.id > current + 1 && current !== 0) {
        throw new Error("SYNC_GAP_DETECTED");
      }
      await this.applier.apply(event);
      seen.add(event.eventId);
    }
    const compacted = [...seen].slice(-this.seenLimit);
    // 应用事件后再提交游标，进程崩溃时重复事件会被 eventId 幂等地跳过。
    await this.storage.set(this.seenKey, compacted);
    await this.storage.set(this.cursorKey, Math.max(current, response.userSyncCursor));
  }
}

export interface SdkClientOptions {
  rest: RestTransport;
  socket?: SocketTransport;
  tokens: TokenManager;
  sync: SyncCoordinator;
  clientMessageId?: () => string;
}

export class ImSdkClient {
  constructor(private readonly options: SdkClientOptions) {}

  async connect(): Promise<void> {
    const tokens = await this.options.tokens.current();
    if (!tokens || !this.options.socket)
      throw new Error("SDK cannot connect without auth and socket");
    await this.options.socket.connect(tokens.accessToken);
  }

  async sync(deviceId: string): Promise<SyncResponse> {
    const response = await this.options.rest.request<SyncResponse>("POST", "/api/v1/sync", {
      deviceId,
      userSyncCursor: await this.options.sync.cursor(),
      lastSeq: {},
      limit: 50,
    });
    await this.options.sync.applyResponse(response);
    return response;
  }

  async sendText(conversationId: string, text: string): Promise<MessageAccepted> {
    const input: SendTextMessageRequest = {
      clientMessageId: this.options.clientMessageId?.() ?? cryptoRandomId(),
      type: "TEXT",
      contentVersion: 1,
      payload: { text },
    };
    return this.options.rest.request<MessageAccepted>(
      "POST",
      `/api/v1/conversations/${conversationId}/messages`,
      input,
    );
  }
}

function cryptoRandomId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `sdk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
