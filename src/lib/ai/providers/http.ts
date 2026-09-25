import { AIGenerationError, httpErrorIsRetryable } from "@/lib/ai/providers/common";
import { IntegrationError } from "@/lib/integrations/types";
import { redactSecrets } from "@/lib/observability";

// Shared fetch for provider REST APIs. Keys go only in headers; error text is redacted.
// Only GET requests are retried (safe/idempotent); generation POSTs never are.
export async function providerFetch(
  label: string,
  url: string,
  init: { method?: "GET" | "POST"; headers: Record<string, string>; body?: unknown; timeoutMs: number }
): Promise<unknown> {
  const method = init.method ?? "GET";
  const attempts = method === "GET" ? 2 : 1;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { ...init.headers, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(init.timeoutMs),
      });
    } catch (error) {
      if (attempt < attempts) continue;
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new AIGenerationError(timedOut ? `${label} timed out. Try again.` : `Could not reach ${label}.`, null, true);
    }

    if (res.status === 401 || res.status === 403) {
      throw new IntegrationError(`${label} rejected the API key. Check Settings → Integrations.`);
    }
    const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } | string } | null;
    if (res.ok) return body;

    if (httpErrorIsRetryable(res.status) && attempt < attempts) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    const raw = typeof body?.error === "string" ? body.error : typeof body?.error?.message === "string" ? body.error.message : "";
    const detail = raw ? `: ${redactSecrets(raw).slice(0, 200)}` : ".";
    if (res.status === 429) throw new AIGenerationError(`${label} rate limit reached. Try again shortly.`, null, true);
    throw new AIGenerationError(`${label} API error (${res.status})${detail}`, null, httpErrorIsRetryable(res.status));
  }
}
