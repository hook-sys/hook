// Test double for @/lib/auth/session: the caller's role comes from globalThis.__fakeRole.
const profile = () => ({
  id: "22222222-2222-4222-8222-222222222222",
  role: globalThis.__fakeRole ?? "admin",
  permissions: globalThis.__fakePermissions ?? [],
});
export async function getAdminProfile() {
  return profile();
}
export function hasPermission(p, permission) {
  return p.role === "admin" || p.permissions.includes(permission);
}
export async function requireAdmin() {
  return profile();
}
export async function requirePermission(permission) {
  const p = profile();
  if (!hasPermission(p, permission)) throw new Error("NEXT_REDIRECT access denied");
  return p;
}
export async function requireSuperAdmin() {
  const p = profile();
  if (p.role !== "admin") throw new Error("NEXT_REDIRECT access denied");
  return p;
}
