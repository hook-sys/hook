import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Supabase email-link callback (password recovery). Supports:
// - PKCE:        /auth/callback?code=...                      (links sent by the app)
// - Token hash:  /auth/callback?token_hash=...&type=recovery  (recommended email template)
// The session is written to httpOnly cookies; tokens are never logged or passed on.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"), "/auth/reset-password");
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const supabase = await createClient();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type === "recovery") {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  if (!ok) return redirectTo("/auth/reset-password?error=link_invalid");
  return redirectTo(next);
}
