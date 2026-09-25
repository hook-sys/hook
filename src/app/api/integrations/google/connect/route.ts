import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getGoogleOAuthConfig } from "@/lib/integrations/env";
import { buildGoogleAuthUrl } from "@/lib/integrations/google-drive";
import { beginOAuth, redirectToIntegrations } from "@/lib/integrations/oauth";

export async function GET(request: NextRequest) {
  await requireSuperAdmin();

  const config = getGoogleOAuthConfig();
  if (!config) return redirectToIntegrations(request, { error: "google_not_configured" });

  const { state, codeChallenge } = await beginOAuth("google");
  return NextResponse.redirect(buildGoogleAuthUrl(config, state, codeChallenge));
}
