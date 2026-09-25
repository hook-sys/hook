import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { generateStructured, ClaudeGenerationError } from "@/lib/ai/claude-json";
import { IntegrationError } from "@/lib/integrations/types";
import { validateCreativeBrief, CREATIVE_BRIEF_SCHEMA } from "@/lib/ai/creative-brief";

let lastRequest;
function respond(message) {
  globalThis.__fakeClaude = {
    beta: {
      messages: {
        stream: (body, opts) => ({
          finalMessage: async () => {
            lastRequest = { body, opts };
            if (message instanceof Error) throw message;
            return message;
          },
        }),
      },
    },
  };
}
const msg = (text, stop_reason = "end_turn") => ({
  model: "claude-opus-5",
  stop_reason,
  usage: { input_tokens: 1000, output_tokens: 200 },
  content: [{ type: "text", text }],
});
const brief = {
  concept: "c", hook: "h", scene_plan: [{ order: 1, duration_seconds: 0, description: "d" }], visual_direction: "v",
  product_presentation: "p", text_overlay: "t", cta: "x", generation_prompt: "g", negative_prompt: "n",
};
const call = () =>
  generateStructured({
    system: "s", user: "u", schema: CREATIVE_BRIEF_SCHEMA, maxTokens: 8000,
    validate: (v) => { const r = validateCreativeBrief(v, { media: "image" }); return r.ok ? { ok: true, value: r.brief } : r; },
  });

test("valid structured reply is parsed, validated and usage returned", async () => {
  respond(msg(JSON.stringify(brief)));
  const r = await call();
  assert.equal(r.data.concept, "c");
  assert.deepEqual([r.model, r.inputTokens, r.outputTokens], ["claude-opus-5", 1000, 200]);
  assert.equal(lastRequest.body.model, "claude-opus-5");
  assert.equal(lastRequest.body.output_config.format.type, "json_schema");
  assert.deepEqual(lastRequest.body.betas, ["server-side-fallback-2026-07-01"]);
  assert.match(lastRequest.body.system, /untrusted reference material/, "prompt-injection rule always appended");
});

test("schema-violating reply is rejected (with usage for cost logging)", async () => {
  respond(msg(JSON.stringify({ ...brief, hook: "" })));
  await assert.rejects(call, (e) => e instanceof ClaudeGenerationError && /validation/.test(e.message) && e.usage.inputTokens === 1000);
});

test("invalid JSON, refusal and max_tokens are errors", async () => {
  respond(msg("not json"));
  await assert.rejects(call, /invalid JSON/);
  respond(msg("", "refusal"));
  await assert.rejects(call, /declined/);
  respond(msg('{"concept":', "max_tokens"));
  await assert.rejects(call, /cut off/);
});

test("SDK errors map to admin-safe errors", async () => {
  const headers = new Headers();
  respond(new Anthropic.AuthenticationError(401, { error: { message: "bad key sk-ant-XYZ" } }, "bad key", headers));
  await assert.rejects(call, (e) => e instanceof IntegrationError && !/sk-ant/.test(e.message));
  respond(new Anthropic.RateLimitError(429, {}, "rl", headers));
  await assert.rejects(call, /rate limit/);
  respond(new Anthropic.InternalServerError(500, {}, "boom", headers));
  await assert.rejects(call, /Claude API error \(500\)/);
});
