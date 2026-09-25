// Server-only OAuth app configuration. None of these may use the NEXT_PUBLIC_ prefix.

export const GOOGLE_ENV_VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"] as const;
export const META_ENV_VARS = ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI"] as const;

export interface OAuthAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function missingEnvVars(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

export function getGoogleOAuthConfig(): OAuthAppConfig | null {
  if (missingEnvVars(GOOGLE_ENV_VARS).length > 0) return null;
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  };
}

export function getMetaOAuthConfig(): OAuthAppConfig | null {
  if (missingEnvVars(META_ENV_VARS).length > 0) return null;
  return {
    clientId: process.env.META_APP_ID!,
    clientSecret: process.env.META_APP_SECRET!,
    redirectUri: process.env.META_REDIRECT_URI!,
  };
}
