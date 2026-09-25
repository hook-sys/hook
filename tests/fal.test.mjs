import test from "node:test";
import assert from "node:assert/strict";
import { submitFalJob, getFalJobState, getFalJobResult, getFalUnitPrice } from "@/lib/integrations/fal";

const calls = [];
function fakeFetch(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status });
  };
}
const Q = "https://queue.fal.run";

test("missing key → Connect-style error, no network", async () => {
  globalThis.__fakeSecret = null;
  calls.length = 0;
  fakeFetch(() => ({ body: {} }));
  await assert.rejects(() => submitFalJob("fal-ai/flux/dev", {}), /not configured/);
  assert.equal(calls.length, 0);
});

test("submit sends key only to queue.fal.run and validates returned URLs", async () => {
  globalThis.__fakeSecret = "fal-test-key";
  calls.length = 0;
  fakeFetch(() => ({ body: { request_id: "r1", status_url: `${Q}/fal-ai/flux/requests/r1/status`, response_url: `${Q}/fal-ai/flux/requests/r1` } }));
  const s = await submitFalJob("fal-ai/flux/dev", { prompt: "p" });
  assert.equal(s.requestId, "r1");
  assert.equal(calls[0].url, `${Q}/fal-ai/flux/dev`);
  assert.equal(calls[0].init.headers.Authorization, "Key fal-test-key");
  assert.equal(calls[0].init.method, "POST");

  fakeFetch(() => ({ body: { request_id: "r1", status_url: "https://evil.example/steal", response_url: `${Q}/x` } }));
  await assert.rejects(() => submitFalJob("fal-ai/flux/dev", {}), /Unexpected Fal.ai queue URL/);
  await assert.rejects(() => submitFalJob("../../etc", {}), /Invalid Fal.ai model ID/);
  await assert.rejects(() => submitFalJob("https://evil.example/x", {}), /Invalid Fal.ai model ID/);
});

test("stored URLs pointing elsewhere are refused before sending the key", async () => {
  calls.length = 0;
  fakeFetch(() => ({ body: {} }));
  await assert.rejects(() => getFalJobState("https://evil.example/status"), /Unexpected/);
  await assert.rejects(() => getFalJobResult("https://queue.fal.run.evil.example/x"), /Unexpected/);
  await assert.rejects(() => getFalJobState("not a url"), /Invalid/);
  assert.equal(calls.length, 0);
});

test("status mapping", async () => {
  fakeFetch(() => ({ status: 202, body: { status: "IN_QUEUE" } }));
  assert.deepEqual(await getFalJobState(`${Q}/s`), { state: "pending" });
  fakeFetch(() => ({ body: { status: "IN_PROGRESS" } }));
  assert.deepEqual(await getFalJobState(`${Q}/s`), { state: "pending" });
  fakeFetch(() => ({ body: { status: "COMPLETED" } }));
  assert.deepEqual(await getFalJobState(`${Q}/s`), { state: "completed" });
  fakeFetch(() => ({ body: { status: "COMPLETED", error: "NSFW content detected" } }));
  assert.equal((await getFalJobState(`${Q}/s`)).state, "failed");
  fakeFetch(() => ({ status: 401, body: {} }));
  await assert.rejects(() => getFalJobState(`${Q}/s`), /rejected the API key/);
});

test("pricing lookup", async () => {
  fakeFetch(() => ({ body: { prices: [{ endpoint_id: "fal-ai/flux/dev", unit_price: 0.025, unit: "megapixels", currency: "USD" }] } }));
  assert.deepEqual(await getFalUnitPrice("fal-ai/flux/dev"), { unitPrice: 0.025, unit: "megapixels" });
  fakeFetch(() => ({ status: 500, body: {} }));
  assert.equal(await getFalUnitPrice("fal-ai/flux/dev"), null);
});
