// Test double for @/lib/integrations/store.
export const saved = [];
export async function getIntegrationSecret(provider) {
  const s = globalThis.__fakeSecrets?.[provider];
  return s ?? globalThis.__fakeSecret ?? null;
}
export async function setIntegrationSecret(provider, secret) {
  (globalThis.__storedSecrets ??= {})[provider] = secret;
}
export async function getIntegration(provider) {
  const status = globalThis.__fakeStatuses?.[provider] ?? "connected";
  const config = globalThis.__fakeConfigs?.[provider] ?? {};
  return { provider, status, config, connected_at: null, updated_at: null };
}
export async function saveIntegration(provider, values) {
  saved.push([provider, values.status]);
  (globalThis.__savedIntegrations ??= []).push([provider, values]);
}
export async function clearIntegration() {}
export async function listIntegrations() {
  return {};
}
export function maskSecret() {
  return "••••";
}
