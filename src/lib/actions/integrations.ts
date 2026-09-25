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
import { IntegrationError, type ApiKeyProvider, type ConnectionTestResult } from "@/lib/integrations/types";
import { refreshProviderModels } from "@/lib/ai/brain";
import { isAIProvider } from "@/lib/ai/providers/common";
import { testGeminiKey } from "@/lib/ai/providers/gemini";
import { testOpenAIKey } from "@/lib/ai/providers/openai";

const INTEGRATIONS_PATH = "/admin/settings/integrations";
const AI_SETTINGS_PATH = "/admin/settings/ai";

export interface IntegrationActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

function isApiKeyProvider(value: unknown): value is ApiKeyProvider {
  return value === "claude" || value === "openai" || value === "gemini" || value === "fal";
}

const KEY_TESTERS: Record<ApiKeyProvider, (apiKey: string) => Promise<ConnectionTestResult>> = {
  claude: testClaudeApiKey,
  openai: testOpenAIKey,
  gemini: testGeminiKey,
  fal: testFalApiKey,
};

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

  if (CONNECT_ON_SAVE.has(provider)) return connectApiKey(provider, apiKey, admin.id);

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

// OpenAI / Gemini "Connect": the key is validated against the provider's API first and is
// stored (Vault) only if the provider accepts it; it is then marked Connected and the
// available models are discovered. A rejected key is never stored and leaves any previously
// saved key untouched. (Claude and Fal.ai keep the save-then-test flow.)
const CONNECT_ON_SAVE = new Set<ApiKeyProvider>(["openai", "gemini"]);

async function connectApiKey(provider: ApiKeyProvider, apiKey: string, actorId: string): Promise<IntegrationActionState> {
  let result: ConnectionTestResult;
  try {
    result = await KEY_TESTERS[provider](apiKey);
  } catch (error) {
    return failure(error, "Could not reach the provider to verify the key.");
  }
  if (!result.ok) return { status: "error", message: `${result.message} The key was not saved.` };

  const now = new Date().toISOString();
  try {
    await setIntegrationSecret(provider, apiKey);
    await saveIntegration(
      provider,
      {
        status: "connected",
        config: { key_hint: maskSecret(apiKey), last_tested_at: now, last_error: null },
        connected_at: now,
      },
      actorId
    );
  } catch (error) {
    return failure(error, "Could not save the API key.");
  }

  const note = await discoverModelsNote(provider);
  revalidatePath(INTEGRATIONS_PATH);
  revalidatePath(AI_SETTINGS_PATH);
  return { status: "success", message: result.message + note };
}

async function discoverModelsNote(provider: ApiKeyProvider): Promise<string> {
  if (!isAIProvider(provider)) return "";
  try {
    const { total } = await refreshProviderModels(provider);
    return ` ${total} model(s) loaded for AI Brain settings.`;
  } catch {
    return " Model list could not be loaded yet — refresh it in Settings → AI Brain.";
  }
}

export async function testApiKey(provider: ApiKeyProvider): Promise<IntegrationActionState> {
  const admin = await requireSuperAdmin();
  if (!isApiKeyProvider(provider)) return { status: "error", message: "Unknown integration." };

  try {
    const apiKey = await getIntegrationSecret(provider);
    if (!apiKey) return { status: "error", message: "No API key is saved." };

    const result = await KEY_TESTERS[provider](apiKey);
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

    // A validated AI brain provider gets its model list discovered right away.
    const note = result.ok ? await discoverModelsNote(provider) : "";

    revalidatePath(INTEGRATIONS_PATH);
    revalidatePath(AI_SETTINGS_PATH);
    return { status: result.ok ? "success" : "error", message: result.message + note };
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
