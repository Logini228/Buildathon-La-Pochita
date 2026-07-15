import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getServerSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new SupabaseRepositoryError("CONFIGURATION", "Supabase server credentials are missing");
  client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export type SupabaseFailureKind = "CONFIGURATION" | "QUERY" | "WRITE" | "CONFLICT" | "NOT_FOUND";

export class SupabaseRepositoryError extends Error {
  readonly status = 503;
  constructor(readonly kind: SupabaseFailureKind, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SupabaseRepositoryError";
  }
}

