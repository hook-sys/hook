"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { testClaudeApiKey } from "@/lib/integrations/claude";
import { testFalApiKey } from "@/lib/integrations/fal";
import { disconnectGoogleDrive } from "@/lib/integrations/google-drive";
import { disconnectMeta, syncMetaAssetPool } from "@/lib/integrations/meta";
import {
  clearIntegration,
  getIntegration,
  getIntegrationSecret,
  maskSecret,
  saveIntegration,
  setIntegrationSecret,
} from "@/lib/integrations/store";
import { IntegrationError, type ApiKeyProvider } from "@/lib/integrations/types";

const INTEGRATIONS_PATH = "/admin/settings/integrations";

export interface IntegrationActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

function isApiKeyProvider(value: unknown): value is ApiKeyProvider {
  return value === "claude" || value === "fal";
}

function failure(error: unknown, fallback: string): IntegrationActionState {
  if (error instanceof IntegrationError) return { status: "error", message: error.message };
  console.error(fallback, error instanceof Error ? error.message : "unknown error");
  return { status: "error", message: fallback };
}

export async function saveApiKey(
  provider: ApiKeyProvider,
  _prev: IntegrationActionState,
  formData: FormData
): Promise<IntegrationActionState> {
  const admin = await requireSuperAdmin();
  if (!isApiKeyProvider(provider)) return { status: "error", message: "Unknown integration." };

  const apiKey = String(formData.get("api_key") ?? "").trim();
  if (apiKey.length < 20 || apiKey.length > 500 || /\s/.test(apiKey)) {
    return { status: "error", message: "Enter a valid API key." };
  }

  try {
    await setIntegrationSecret(provider, apiKey);
    await saveIntegration(
      provider,
      { status: "configured", config: { key_hint: maskSecret(apiKey) }, connected_at: null },
      admin.id
    );
  } catch (error) {
    return failure(error, "Could not save the API key.");
  }

  revalidatePath(INTEGRATIONS_PATH);
  return { status: "success", message: "API key saved. Run Test Connection to verify it." };
}

export async function testApiKey(provider: ApiKeyProvider): Promise<IntegrationActionState> {
  const admin = await requireSuperAdmin();
  if (!isApiKeyProvider(provider)) return { status: "error", message: "Unknown integration." };

  try {
    const apiKey = await getIntegrationSecret(provider);
    if (!apiKey) return { status: "error", message: "No API key is saved." };

    const result = provider === "claude" ? await testClaudeApiKey(apiKey) : await testFalApiKey(apiKey);
    const current = await getIntegration(provider);
    const now = new Date().toISOString();

    await saveIntegration(
      provider,
      {
        status: result.ok ? "connected" : "error",
        config: { ...current.config, last_tested_at: now, last_error: result.ok ? null : result.message },
        connected_at: result.ok ? (current.connected_at ?? now) : null,
      },
      admin.id
    );

    revalidatePath(INTEGRATIONS_PATH);
    return { status: result.ok ? "success" : "error", message: result.message };
  } catch (error) {
    return failure(error, "Could not test the connection.");
  }
}

export async function removeApiKey(provider: ApiKeyProvider): Promise<IntegrationActionState> {
  const admin = await requireSuperAdmin();
  if (!isApiKeyProvider(provider)) return { status: "error", message: "Unknown integration." };

  try {
    await clearIntegration(provider, admin.id);
  } catch (error) {
    return failure(error, "Could not remove the API key.");
  }

  revalidatePath(INTEGRATIONS_PATH);
  return { status: "success", message: "API key removed." };
}

export async function disconnectGoogleDriveAction(): Promise<IntegrationActionState> {
  const admin = await requireSuperAdmin();
  try {
    await disconnectGoogleDrive(admin.id);
  } catch (error) {
    return failure(error, "Could not disconnect Google Drive.");
  }
  revalidatePath(INTEGRATIONS_PATH);
  return { status: "success", message: "Google Drive disconnected." };
}

export async function disconnectMetaAction(): Promise<IntegrationActionState> {
  const admin = await requireSuperAdmin();
  try {
    await disconnectMeta(admin.id);
  } catch (error) {
    return failure(error, "Could not disconnect Meta.");
  }
  revalidatePath(INTEGRATIONS_PATH);
  return { status: "success", message: "Meta disconnected." };
}

// Refreshes the central Meta asset pool (Business Managers, ad accounts, Pages) from the
// connected Meta account. Super admin only.
export async function syncMetaAssetPoolAction(): Promise<IntegrationActionState> {
  await requireSuperAdmin();
  try {
    const r = await syncMetaAssetPool();
    revalidatePath(INTEGRATIONS_PATH);
    const summary = `Synced ${r.businesses} Business Manager(s), ${r.adAccounts} ad account(s), ${r.pages} Page(s).`;
    return r.errors.length
      ? { status: "error", message: `${summary} Some assets could not be loaded: ${r.errors[0]}` }
      : { status: "success", message: summary };
  } catch (error) {
    return failure(error, "Could not sync Meta assets.");
  }
}
