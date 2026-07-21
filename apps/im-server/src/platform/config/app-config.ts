export const PROCESS_KINDS = ["api", "realtime", "event-worker", "job-worker"] as const;

export type ProcessKind = (typeof PROCESS_KINDS)[number];

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly serviceName: ProcessKind;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly shutdownGraceMs: number;
  readonly ports: Readonly<Record<ProcessKind, number>>;
  readonly databaseUrl: string;
  readonly redis: {
    readonly realtimeUrl: string;
    readonly realtimePrefix: string;
    readonly jobsUrl: string;
    readonly jobsPrefix: string;
  };
  readonly rabbitMqUrl: string;
  readonly s3: {
    readonly endpoint: string;
    readonly region: string;
    readonly accessKey: string;
    readonly secretKey: string;
    readonly bucket: string;
    readonly forcePathStyle: boolean;
    readonly autoCreateBucket: boolean;
  };
}

export const APP_CONFIG = Symbol("APP_CONFIG");
export const PROCESS_KIND = Symbol("PROCESS_KIND");
