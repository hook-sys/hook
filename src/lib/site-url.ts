// Absolute base URL for links in auth emails. Production uses SITE_URL (set in Vercel);
// Vercel's system URLs are fallbacks; localhost is only used in local development.
export function getSiteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit && /^https?:\/\/[^/]+$/.test(explicit.replace(/\/$/, ""))) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// Only same-site paths inside the app may be used as post-auth redirects (no open redirect).
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value.startsWith("/admin") || value.startsWith("/auth/reset-password") ? value : fallback;
}
