import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

type OAuthProvider = "google" | "meta";

const STATE_MAX_AGE_SECONDS = 600;

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function cookieOptions(provider: OAuthProvider, maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: `/api/integrations/${provider}`,
    maxAge,
  };
}

// Stores a one-time state (CSRF) + PKCE verifier in a short-lived httpOnly cookie
// scoped to this provider's routes.
export async function beginOAuth(provider: OAuthProvider) {
  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(48));
  const codeChallenge = base64url(createHash("sha256").update(verifier).digest());

  (await cookies()).set(
    `oauth_${provider}`,
    JSON.stringify({ state, verifier }),
    cookieOptions(provider, STATE_MAX_AGE_SECONDS)
  );

  return { state, codeChallenge };
}

// Consumes the cookie and returns the PKCE verifier if the returned state matches.
export async function completeOAuth(
  provider: OAuthProvider,
  returnedState: string | null
): Promise<{ verifier: string } | null> {
  const store = await cookies();
  const raw = store.get(`oauth_${provider}`)?.value;
  store.set(`oauth_${provider}`, "", cookieOptions(provider, 0));

  if (!raw || !returnedState) return null;

  try {
    const { state, verifier } = JSON.parse(raw) as { state: string; verifier: string };
    const expected = Buffer.from(state);
    const actual = Buffer.from(returnedState);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return { verifier };
  } catch {
    return null;
  }
}

export function redirectToIntegrations(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/settings/integrations", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}
