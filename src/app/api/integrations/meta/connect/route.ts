import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getMetaOAuthConfig } from "@/lib/integrations/env";
import { buildMetaAuthUrl } from "@/lib/integrations/meta";
import { beginOAuth, redirectToIntegrations } from "@/lib/integrations/oauth";

export async function GET(request: NextRequest) {
  await requireSuperAdmin();

  const config = getMetaOAuthConfig();
  if (!config) return redirectToIntegrations(request, { error: "meta_not_configured" });

  const { state } = await beginOAuth("meta");
  return NextResponse.redirect(buildMetaAuthUrl(config, state));
}
