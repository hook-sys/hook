import Anthropic from "@anthropic-ai/sdk";
import { getIntegrationSecret } from "@/lib/integrations/store";
import { IntegrationError, type ConnectionTestResult } from "@/lib/integrations/types";

// Pinned so an ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN in the server environment can
// never redirect the stored admin-managed key to another host.
const ANTHROPIC_API_BASE_URL = "https://api.anthropic.com";

export function createClaudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, authToken: null, baseURL: ANTHROPIC_API_BASE_URL });
}

// Service entry point for later phases (strategy/content generation).
export async function getClaudeClient(): Promise<Anthropic> {
  const apiKey = await getIntegrationSecret("claude");
  if (!apiKey) throw new IntegrationError("Claude is not configured.");
  return createClaudeClient(apiKey);
}

// Lists one model: authenticates the key without consuming tokens.
export async function testClaudeApiKey(apiKey: string): Promise<ConnectionTestResult> {
  try {
    await createClaudeClient(apiKey).models.list({ limit: 1 }, { timeout: 10_000, maxRetries: 0 });
    return { ok: true, message: "Connected to the Anthropic API." };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, message: "Anthropic rejected the API key (invalid or revoked)." };
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, message: "The API key does not have permission to access the API." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "Anthropic rate limit reached. Try again shortly." };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, message: "Could not reach the Anthropic API." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, message: `Anthropic API error (${error.status ?? "unknown"}).` };
    }
    return { ok: false, message: "Unexpected error while testing the connection." };
  }
}
