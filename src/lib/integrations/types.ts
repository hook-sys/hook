export const INTEGRATION_PROVIDERS = [
  "google_drive",
  "meta",
  "claude",
  "openai",
  "gemini",
  "fal",
  "inworld",
  "tiktok",
  "youtube",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type ApiKeyProvider = Extract<IntegrationProvider, "claude" | "openai" | "gemini" | "fal">;

export type IntegrationStatus = "not_connected" | "configured" | "connected" | "error";

// Non-secret metadata only. Never put tokens or full keys here.
export interface IntegrationConfig {
  key_hint?: string;
  last_tested_at?: string;
  last_error?: string | null;
  account_email?: string;
  account_id?: string;
  account_name?: string;
  business_id?: string;
  business_name?: string;
  expires_at?: string;
  // OAuth scopes Google actually granted (space-separated), e.g. to detect drive.readonly.
  granted_scopes?: string;
}

export interface IntegrationRecord {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: IntegrationConfig;
  connected_at: string | null;
  updated_at: string | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

// Messages are shown to admins, so they must never contain credentials.
export class IntegrationError extends Error {}
