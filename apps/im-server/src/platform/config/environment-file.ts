import { resolve } from "node:path";

export function loadEnvironmentFile(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), ".env.example"),
    resolve(process.cwd(), "../../.env.example"),
  ];
  for (const candidate of candidates) {
    try {
      process.loadEnvFile(candidate);
      return;
    } catch {
      // Environment variables supplied by the process remain authoritative.
    }
  }
}
