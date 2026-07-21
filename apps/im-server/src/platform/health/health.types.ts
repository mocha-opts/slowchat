export type DependencyStatus = "up" | "down";

export interface HealthResponse {
  readonly status: "ok" | "error";
  readonly service: string;
  readonly checks: Record<string, DependencyStatus>;
  readonly timestamp: string;
}
