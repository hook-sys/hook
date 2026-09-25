import type { ModelRequest, ModelResponse } from "@/lib/agent/runner";
import { brainAgentTurn } from "@/lib/ai/brain";
import type { AIProviderId } from "@/lib/ai/providers/common";

// Server-only: one agent turn on the provider/model the Super Admin configured for the
// "Campaign Intelligence" task (Claude by default). Tools, limits and the loop itself are
// unchanged (lib/agent/runner.ts); only the model call is routed.
export function createAgentModelCaller() {
  let provider: AIProviderId | null = null;
  return {
    get provider() {
      return provider;
    },
    async callModel(req: ModelRequest): Promise<ModelResponse> {
      const turn = await brainAgentTurn({
        system: req.system,
        tools: req.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
        messages: req.messages,
        maxTokens: req.maxTokens,
        timeoutMs: req.timeoutMs,
      });
      provider = turn.provider;
      return { content: turn.content, stop_reason: turn.stop_reason, usage: turn.usage, model: turn.model };
    },
  };
}
