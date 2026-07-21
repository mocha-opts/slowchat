import { AppError } from "../errors/app-error.js";

export interface PageCursor {
  readonly createdAt: string;
  readonly id: string;
  readonly version: 1;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ version: 1, createdAt: createdAt.toISOString(), id }),
  ).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): PageCursor | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as PageCursor;
    if (
      value.version !== 1 ||
      !value.createdAt ||
      !value.id ||
      Number.isNaN(Date.parse(value.createdAt))
    ) {
      throw new Error("Invalid cursor");
    }
    return value;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Cursor is invalid", 400);
  }
}
