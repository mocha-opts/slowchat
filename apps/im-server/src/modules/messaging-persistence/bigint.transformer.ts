import type { ValueTransformer } from "typeorm";

export const safeBigintTransformer: ValueTransformer = {
  to(value: number | null | undefined): number | null | undefined {
    return value;
  },
  from(value: string | number | null): number | null {
    if (value === null) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(parsed))
      throw new Error("Database bigint exceeds JavaScript safe range");
    return parsed;
  },
};
