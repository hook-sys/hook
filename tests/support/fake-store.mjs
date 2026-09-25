// Test double for @/lib/integrations/store.
export const saved = [];
export async function getIntegrationSecret(provider) {
  const s = globalThis.__fakeSecrets?.[provider];
  return s ?? globalThis.__fakeSecret ?? null;
}
export async function setIntegrationSecret() {}
export async function getIntegration(provider) {
  return { provider, status: "connected", config: {}, connected_at: null, updated_at: null };
}
export async function saveIntegration(provider, values) {
  saved.push([provider, values.status]);
}
export async function clearIntegration() {}
export async function listIntegrations() {
  return {};
}
export function maskSecret() {
  return "••••";
}
