import { createAdminClient } from "@/lib/supabase/admin";
import {
  INTEGRATION_PROVIDERS,
  IntegrationError,
  type IntegrationConfig,
  type IntegrationProvider,
  type IntegrationRecord,
  type IntegrationStatus,
} from "@/lib/integrations/types";

// All reads/writes here use the service role and must only be called after an
// app-level super-admin check (or from server code acting on the agency's behalf).

function emptyRecord(provider: IntegrationProvider): IntegrationRecord {
  return { provider, status: "not_connected", config: {}, connected_at: null, updated_at: null };
}

export async function getIntegration(provider: IntegrationProvider): Promise<IntegrationRecord> {
  const { data, error } = await createAdminClient()
    .from("integrations")
    .select("provider, status, config, connected_at, updated_at")
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new IntegrationError("Could not load integration state.");
  return (data as IntegrationRecord | null) ?? emptyRecord(provider);
}

export async function listIntegrations(): Promise<Record<IntegrationProvider, IntegrationRecord>> {
  const { data, error } = await createAdminClient()
    .from("integrations")
    .select("provider, status, config, connected_at, updated_at");

  if (error) throw new IntegrationError("Could not load integration state.");

  const rows = new Map((data as IntegrationRecord[]).map((row) => [row.provider, row]));
  return Object.fromEntries(
    INTEGRATION_PROVIDERS.map((p) => [p, rows.get(p) ?? emptyRecord(p)])
  ) as Record<IntegrationProvider, IntegrationRecord>;
}

export async function saveIntegration(
  provider: IntegrationProvider,
  values: { status: IntegrationStatus; config: IntegrationConfig; connected_at: string | null },
  actorId: string | null
): Promise<void> {
  const { error } = await createAdminClient()
    .from("integrations")
    .upsert({ provider, ...values, updated_by: actorId });

  if (error) throw new IntegrationError("Could not save integration state.");
}

export async function setIntegrationSecret(provider: IntegrationProvider, secret: string): Promise<void> {
  const { error } = await createAdminClient().rpc("integration_secret_set", {
    p_provider: provider,
    p_secret: secret,
  });
  if (error) throw new IntegrationError("Could not store the credential securely.");
}

export async function getIntegrationSecret(provider: IntegrationProvider): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc("integration_secret_get", {
    p_provider: provider,
  });
  if (error) throw new IntegrationError("Could not read the stored credential.");
  return (data as string | null) ?? null;
}

export async function clearIntegration(provider: IntegrationProvider, actorId: string | null): Promise<void> {
  const { error } = await createAdminClient().rpc("integration_secret_delete", { p_provider: provider });
  if (error) throw new IntegrationError("Could not remove the stored credential.");
  await saveIntegration(provider, { status: "not_connected", config: {}, connected_at: null }, actorId);
}

export function maskSecret(secret: string): string {
  if (secret.length <= 12) return "••••";
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}
