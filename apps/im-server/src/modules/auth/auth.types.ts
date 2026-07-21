export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly deviceId: string;
}

export interface RequestMetadata {
  readonly ip: string | null;
  readonly userAgent: string | null;
}
