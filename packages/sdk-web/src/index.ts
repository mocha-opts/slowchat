import type { StorageAdapter } from "@im/sdk-core";

/** IndexedDB 只保存 SDK 状态，不保存服务端唯一消息事实。 */
export class IndexedDbStorage implements StorageAdapter {
  private readonly database: Promise<IDBDatabase>;

  constructor(
    private readonly name = "im-sdk",
    private readonly storeName = "state",
  ) {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const database = await this.database;
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const database = await this.database;
    await new Promise<void>((resolve, reject) => {
      const request = database
        .transaction(this.storeName, "readwrite")
        .objectStore(this.storeName)
        .put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("IndexedDB write failed"));
    });
  }

  async remove(key: string): Promise<void> {
    const database = await this.database;
    await new Promise<void>((resolve, reject) => {
      const request = database
        .transaction(this.storeName, "readwrite")
        .objectStore(this.storeName)
        .delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("IndexedDB delete failed"));
    });
  }
}

export type WebChannelMessage =
  | { type: "refresh.request"; requestId: string }
  | { type: "refresh.result"; requestId: string; tokens: unknown }
  | { type: "sync.event"; event: unknown };

/**
 * BroadcastChannelCoordinator 让同一浏览器的多个标签页共享刷新结果。
 * 它不传输 Refresh Token 到 URL 或日志，只在同源内存消息中传递短期状态。
 */
export class BroadcastChannelCoordinator {
  private readonly channel: BroadcastChannel;
  private readonly listeners = new Set<(message: WebChannelMessage) => void>();

  constructor(name = "im-sdk") {
    this.channel = new BroadcastChannel(name);
    this.channel.addEventListener("message", (event: MessageEvent<WebChannelMessage>) => {
      for (const listener of this.listeners) listener(event.data);
    });
  }

  publish(message: WebChannelMessage): void {
    this.channel.postMessage(message);
  }

  subscribe(listener: (message: WebChannelMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.channel.close();
    this.listeners.clear();
  }
}
