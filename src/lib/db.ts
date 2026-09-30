import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type Sql = NeonQueryFunction<false, false>;

const QUERY_TIMEOUT_MS = 8000;

/** Shared Neon URL: pooled first, then direct. Empty when neither is set. */
export function databaseUrl(): string {
  const pooled = process.env.DATABASE_URL_POOLED?.trim() ?? "";
  const direct = process.env.DATABASE_URL?.trim() ?? "";
  return pooled || direct;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl());
}

export function getSql(): Sql {
  const url = databaseUrl();
  if (!url) {
    throw new Error("Database is not configured");
  }
  return neon(url, {
    fetchOptions: {
      cache: "no-store",
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    },
  });
}

export function safeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : "error";
  if (/postgres(ql)?:\/\//i.test(message)) return "database error";
  return message;
}
