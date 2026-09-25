import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import { connectMeta } from "@/lib/integrations/meta";
import { completeOAuth, redirectToIntegrations } from "@/lib/integrations/oauth";

export async function GET(request: NextRequest) {
  const admin = await requireSuperAdmin();
  const params = request.nextUrl.searchParams;

  const oauth = await completeOAuth("meta", params.get("state"));
  if (!oauth) return redirectToIntegrations(request, { error: "oauth_state" });
  if (params.get("error")) return redirectToIntegrations(request, { error: "meta_denied" });

  const code = params.get("code");
  if (!code) return redirectToIntegrations(request, { error: "meta_failed" });

  try {
    await connectMeta(code, admin.id);
  } catch (error) {
    console.error("Meta connection failed:", error instanceof Error ? error.message : "unknown error");
    return redirectToIntegrations(request, { error: "meta_failed" });
  }

  return redirectToIntegrations(request, { connected: "meta" });
}
