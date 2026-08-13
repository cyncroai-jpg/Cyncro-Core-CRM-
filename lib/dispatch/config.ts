import { DispatchError } from "./errors";

export type DispatchConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey?: string;
  smsWebhookSecret?: string;
  smsEncryptionKey?: string;
};

export function config(requireServiceRole = false): DispatchConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    (requireServiceRole && !supabaseServiceRoleKey)
  ) {
    throw new DispatchError(
      503,
      "UPSTREAM_UNAVAILABLE",
      "Dispatch is not connected yet. No customer data was changed.",
    );
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabaseAnonKey,
    supabaseServiceRoleKey,
    smsWebhookSecret: process.env.SMS_WEBHOOK_SECRET,
    smsEncryptionKey: process.env.SMS_ENCRYPTION_KEY,
  };
}
