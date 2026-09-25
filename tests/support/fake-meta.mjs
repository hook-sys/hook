// Test double for @/lib/integrations/meta: records Graph calls, never touches the network.
export const log = [];
export function isMetaPublishingEnabled() {
  return globalThis.__metaFlag === true;
}
export async function metaGraphPost(path, params) {
  log.push(["POST", path, params]);
  if (globalThis.__metaFailOn && path.endsWith(globalThis.__metaFailOn)) throw new Error("graph failure");
  if (path.endsWith("/adimages")) return { images: { bytes: { hash: `hash-${log.length}` } } };
  return { id: `${path.split("/").pop()}-${log.length}` };
}
export async function metaGraphDelete(path) {
  log.push(["DELETE", path]);
}
export async function getMetaConnectionState() {
  return { connected: globalThis.__metaConnected !== false, status: "connected" };
}
