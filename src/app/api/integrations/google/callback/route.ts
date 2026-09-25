import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import { connectGoogleDrive } from "@/lib/integrations/google-drive";
import { completeOAuth, redirectToIntegrations } from "@/lib/integrations/oauth";

export async function GET(request: NextRequest) {
  const admin = await requireSuperAdmin();
  const params = request.nextUrl.searchParams;

  const oauth = await completeOAuth("google", params.get("state"));
  if (!oauth) return redirectToIntegrations(request, { error: "oauth_state" });
  if (params.get("error")) return redirectToIntegrations(request, { error: "google_denied" });

  const code = params.get("code");
  if (!code) return redirectToIntegrations(request, { error: "google_failed" });

  try {
    await connectGoogleDrive(code, oauth.verifier, admin.id);
  } catch (error) {
    console.error("Google Drive connection failed:", error instanceof Error ? error.message : "unknown error");
    return redirectToIntegrations(request, { error: "google_failed" });
  }

  return redirectToIntegrations(request, { connected: "google_drive" });
}
