import { getIntegrationSecret } from "@/lib/integrations/store";
import { IntegrationError, type ConnectionTestResult } from "@/lib/integrations/types";

const FAL_API_BASE_URL = "https://api.fal.ai/v1";
const FAL_QUEUE_ORIGIN = "https://queue.fal.run";
const MODEL_ID = /^[a-z0-9-]+(\/[a-z0-9._-]+)+$/;

async function falFetch(apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${FAL_API_BASE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Key ${apiKey}` },
    signal: init.signal ?? AbortSignal.timeout(10_000),
    cache: "no-store",
  });
}

async function requireFalKey(): Promise<string> {
  const apiKey = await getIntegrationSecret("fal");
  if (!apiKey) throw new IntegrationError("Fal.ai is not configured.");
  return apiKey;
}

// Service entry point for later phases (image/video generation).
export async function falRequest(path: string, init?: RequestInit): Promise<Response> {
  return falFetch(await requireFalKey(), path, init);
}

// Pricing lookup is an authenticated read-only Platform API call: it validates the key
// without running (or paying for) a model. Auth is checked before request validation, so
// any non-401/403 client response still proves the key was accepted.
export async function testFalApiKey(apiKey: string): Promise<ConnectionTestResult> {
  try {
    const res = await falFetch(apiKey, "/models/pricing?endpoint_id=fal-ai/flux/dev");
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Fal.ai rejected the API key (invalid or revoked)." };
    }
    if (res.status === 429) {
      return { ok: false, message: "Fal.ai rate limit reached. Try again shortly." };
    }
    if (res.status >= 500) {
      return { ok: false, message: `Fal.ai service error (${res.status}).` };
    }
    return { ok: true, message: "Connected to the Fal.ai API." };
  } catch {
    return { ok: false, message: "Could not reach the Fal.ai API." };
  }
}

// ---------------------------------------------------------------------------
// Queue API (async generation). Status/result URLs are stored in the database, so the
// key is only ever sent to https://queue.fal.run — never to an arbitrary stored URL.
// ---------------------------------------------------------------------------

function queueUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new IntegrationError("Invalid Fal.ai queue URL.");
  }
  if (parsed.origin !== FAL_QUEUE_ORIGIN) throw new IntegrationError("Unexpected Fal.ai queue URL.");
  return parsed.toString();
}

async function queueFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = await requireFalKey();
  const res = await fetch(queueUrl(url), {
    ...init,
    headers: { ...init.headers, Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new IntegrationError("Fal.ai rejected the API key.");
  return res;
}

function falErrorDetail(body: unknown): string {
  const detail = (body as { detail?: unknown; error?: unknown })?.detail ?? (body as { error?: unknown })?.error;
  const text = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "";
  return text.slice(0, 300);
}

export interface FalSubmission {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

export async function submitFalJob(modelId: string, input: Record<string, unknown>): Promise<FalSubmission> {
  if (!MODEL_ID.test(modelId)) throw new IntegrationError("Invalid Fal.ai model ID.");
  const res = await queueFetch(`${FAL_QUEUE_ORIGIN}/${modelId}`, { method: "POST", body: JSON.stringify(input) });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body || typeof body.request_id !== "string") {
    throw new IntegrationError(`Fal.ai did not accept the job (${res.status}). ${falErrorDetail(body)}`.trim());
  }
  return {
    requestId: body.request_id,
    statusUrl: queueUrl(String(body.status_url)),
    responseUrl: queueUrl(String(body.response_url)),
  };
}

export type FalJobState = { state: "pending" } | { state: "completed" } | { state: "failed"; error: string };

export async function getFalJobState(statusUrl: string): Promise<FalJobState> {
  const res = await queueFetch(statusUrl);
  const body = (await res.json().catch(() => null)) as { status?: string; error?: unknown } | null;
  if (!res.ok || !body) return { state: "failed", error: `Fal.ai status check failed (${res.status}).` };
  if (body.status === "IN_QUEUE" || body.status === "IN_PROGRESS") return { state: "pending" };
  if (body.status === "COMPLETED") {
    return body.error ? { state: "failed", error: falErrorDetail(body) || "Generation failed." } : { state: "completed" };
  }
  return { state: "failed", error: `Unexpected Fal.ai status "${String(body.status)}".` };
}

export async function getFalJobResult(responseUrl: string): Promise<unknown> {
  const res = await queueFetch(responseUrl);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new IntegrationError(`Fal.ai result unavailable (${res.status}). ${falErrorDetail(body)}`.trim());
  return body;
}

// Published unit price for an endpoint, for usage estimates (not billing).
export async function getFalUnitPrice(modelId: string): Promise<{ unitPrice: number; unit: string } | null> {
  try {
    const res = await falRequest(`/models/pricing?endpoint_id=${encodeURIComponent(modelId)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { prices?: { endpoint_id: string; unit_price: number; unit: string; currency: string }[] };
    const price = body.prices?.find((p) => p.endpoint_id === modelId && p.currency === "USD");
    return price ? { unitPrice: price.unit_price, unit: price.unit } : null;
  } catch {
    return null;
  }
}
