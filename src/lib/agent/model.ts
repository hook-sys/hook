import type Anthropic from "@anthropic-ai/sdk";
import type { ModelRequest, ModelResponse } from "@/lib/agent/runner";
import { CLAUDE_MODEL, UNTRUSTED_DATA_RULE, mapClaudeError } from "@/lib/ai/claude-json";
import { getClaudeClient } from "@/lib/integrations/claude";

// Server-only: one agent turn via the Anthropic SDK (manual tool loop lives in runner.ts).
export async function callAgentModel(req: ModelRequest): Promise<ModelResponse> {
  const client = await getClaudeClient();
  try {
    const message = await client.beta.messages
      .stream(
        {
          model: CLAUDE_MODEL,
          max_tokens: req.maxTokens,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          system: `${req.system}\n\n${UNTRUSTED_DATA_RULE}`,
          tools: req.tools as Anthropic.Beta.BetaTool[],
          messages: req.messages as Anthropic.Beta.BetaMessageParam[],
        },
        { timeout: req.timeoutMs, maxRetries: 1 }
      )
      .finalMessage();
    return {
      content: message.content as unknown as ModelResponse["content"],
      stop_reason: message.stop_reason,
      usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
      model: message.model,
    };
  } catch (error) {
    mapClaudeError(error);
  }
}
