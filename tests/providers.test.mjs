import test from "node:test";
import assert from "node:assert/strict";

process.env.META_APP_ID = "1";
process.env.META_APP_SECRET = "test-app-secret";
process.env.META_REDIRECT_URI = "https://example.test/cb";
globalThis.__fakeSecrets = {
  meta: JSON.stringify({ access_token: "EAAtesttoken", expires_at: null }),
  google_drive: JSON.stringify({ access_token: "ya29.test", refresh_token: "r", expires_at: Date.now() + 3600_000 }),
};

const { metaGraphGet, metaGraphPost } = await import("@/lib/integrations/meta");
const { uploadFileToDrive, getDriveFile } = await import("@/lib/integrations/google-drive");
const { saved } = await import("@/lib/integrations/store");

let calls = [];
function stub(handler) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("Meta GET: retries transient 5xx/rate limits with backoff, then succeeds", async () => {
  stub((url, init, n) => (n < 3 ? json(500, { error: { code: 2, message: "temp" } }) : json(200, { data: [1] })));
  const res = await metaGraphGet("/act_1/insights", { level: "account" });
  assert.deepEqual(res, { data: [1] });
  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.includes("appsecret_proof="), "appsecret_proof sent");
  assert.ok(!calls[0].url.includes("EAAtesttoken"), "token not in URL");
});

test("Meta GET: gives up after 3 attempts with a rate-limit message; 404 not retried", async () => {
  stub(() => json(400, { error: { code: 17, message: "User request limit reached" } }));
  await assert.rejects(() => metaGraphGet("/x"), /rate limit/);
  assert.equal(calls.length, 3);
  stub(() => json(404, { error: { code: 100, message: "nope" } }));
  await assert.rejects(() => metaGraphGet("/x"), /Meta API error \(100\)/);
  assert.equal(calls.length, 1);
});

test("Meta POST: never retried; expired token (190) marks integration error", async () => {
  stub(() => json(500, { error: { code: 1, message: "unknown" } }));
  await assert.rejects(() => metaGraphPost("/act_1/customaudiences", { name: "x" }));
  assert.equal(calls.length, 1, "writes are not retried");
  saved.length = 0;
  stub(() => json(400, { error: { code: 190, message: "expired" } }));
  await assert.rejects(() => metaGraphPost("/act_1/campaigns", {}), /expired|Reconnect/);
  assert.deepEqual(saved[0], ["meta", "error"]);
  stub(() => {
    throw new TypeError("network down");
  });
  await assert.rejects(() => metaGraphPost("/act_1/campaigns", {}), /Check Ads Manager before retrying/);
});

test("Drive: resumable upload returns a real file ID only on success", async () => {
  const session = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc";
  stub((url, init) => {
    if (init.method === "POST") return new Response(null, { status: 200, headers: { location: session } });
    return json(200, { id: "1AbCdEfGhIjKlMnOp", name: "x.jpg", mimeType: "image/jpeg", webViewLink: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", trashed: false });
  });
  const file = await uploadFileToDrive({ name: "x.jpg", folderId: "folder123456", mimeType: "image/jpeg", bytes: new ArrayBuffer(10), appProperties: { hookCreativeId: "c" } });
  assert.equal(file.id, "1AbCdEfGhIjKlMnOp");
  assert.equal(calls[0].init.headers["X-Upload-Content-Length"], "10");
  assert.equal(calls[1].url, session);

  stub((url, init) => (init.method === "POST" ? new Response(null, { status: 200, headers: { location: "https://evil.example/upload" } }) : json(200, {})));
  await assert.rejects(() => uploadFileToDrive({ name: "x", folderId: "f", mimeType: "image/jpeg", bytes: new ArrayBuffer(1), appProperties: {} }), /did not start/);
  assert.equal(calls.length, 1, "bytes never sent to an unexpected session host");

  stub(() => new Response("{}", { status: 403 }));
  await assert.rejects(() => uploadFileToDrive({ name: "x", folderId: "f", mimeType: "image/jpeg", bytes: new ArrayBuffer(1), appProperties: {} }), /insufficient permission/);

  stub((url, init) => (init.method === "POST" ? new Response(null, { status: 200, headers: { location: session } }) : json(500, {})));
  await assert.rejects(() => uploadFileToDrive({ name: "x", folderId: "f", mimeType: "image/jpeg", bytes: new ArrayBuffer(1), appProperties: {} }), /upload failed/);
});

test("Drive: deleted/trashed file detected; reads retried on 5xx", async () => {
  stub(() => json(404, {}));
  assert.equal(await getDriveFile("1AbCdEfGhIjKlMnOp"), null);
  stub(() => json(200, { id: "1AbCdEfGhIjKlMnOp", trashed: true, name: "x", mimeType: "image/jpeg", webViewLink: null }));
  assert.equal(await getDriveFile("1AbCdEfGhIjKlMnOp"), null);
  stub((url, init, n) => (n < 2 ? json(503, {}) : json(200, { id: "1AbCdEfGhIjKlMnOp", trashed: false, name: "renamed.jpg", mimeType: "image/jpeg", webViewLink: null })));
  assert.equal((await getDriveFile("1AbCdEfGhIjKlMnOp")).name, "renamed.jpg");
  assert.equal(calls.length, 2);
});
