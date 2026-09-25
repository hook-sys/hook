// Structured, secret-free server logs. Only allowlisted fields are emitted and error text is
// scrubbed of anything that looks like a credential.

export interface LogFields {
  provider?: string;
  operation: string;
  clientId?: string | null;
  userId?: string | null;
  status: string;
  durationMs?: number;
  errorCode?: string | number | null;
  requestId?: string | null;
  error?: string;
}

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /\b(?:EAA|EAAB)[A-Za-z0-9]{20,}\b/g, // Meta tokens
  /\bya29\.[A-Za-z0-9._-]+/g, // Google access tokens
  /\b1\/\/[A-Za-z0-9_-]{20,}/g, // Google refresh tokens
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
  /(Key|Bearer)\s+[A-Za-z0-9:._-]{12,}/gi,
  /(access_token|appsecret_proof|client_secret|refresh_token|api_key)=[^&\s]+/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[REDACTED]");
  return out;
}

export function logEvent(level: "info" | "warn" | "error", fields: LogFields): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    ...fields,
    ...(fields.error ? { error: redactSecrets(fields.error).slice(0, 500) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
