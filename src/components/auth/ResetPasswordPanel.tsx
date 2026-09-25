"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { updatePassword, type PasswordResetState } from "@/lib/actions/password-reset";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: PasswordResetState = { status: "idle" };

// Recovery links sent from the Supabase dashboard use the implicit flow: the session
// arrives as #access_token=...&refresh_token=... . The tokens are removed from the URL
// first, then exchanged for the cookie session the server uses.
function readUrlTokens(): { access: string | null; refresh: string | null; error: string | null } {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const get = (k: string) => hash.get(k) ?? query.get(k);
  return { access: get("access_token"), refresh: get("refresh_token"), error: get("error_code") ?? get("error") };
}

const INVALID_LINK = "This reset link is invalid or has expired.";

type RecoveryResult = { error: string | null; sessionSet: boolean };
// The URL tokens can only be consumed once (they are stripped), so every caller — including
// React's double-invoked effects in development — shares the same in-flight result.
let lastRecovery: Promise<RecoveryResult> | null = null;

// Strips tokens from the URL immediately (address bar/history), then establishes the session.
function processRecoveryUrl(): Promise<RecoveryResult> {
  const { access, refresh, error } = readUrlTokens();
  if (!access && !refresh && !error) return lastRecovery ?? Promise.resolve({ error: null, sessionSet: false });
  window.history.replaceState(null, "", "/auth/reset-password");
  lastRecovery = (async () => {
    if (error || !access || !refresh) return { error: INVALID_LINK, sessionSet: false };
    const { error: sessionError } = await createBrowserSupabaseClient().auth.setSession({ access_token: access, refresh_token: refresh });
    return sessionError ? { error: INVALID_LINK, sessionSet: false } : { error: null, sessionSet: true };
  })();
  return lastRecovery;
}

export function ResetPasswordPanel({ hasSession, email, linkError }: { hasSession: boolean; email: string | null; linkError: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updatePassword, initialState);
  const [phase, setPhase] = useState<"checking" | "ready">("checking");
  const [urlError, setUrlError] = useState<string | null>(null);
  // Session cookie set in the browser; waiting for the server render to pick it up.
  const [awaitingServer, setAwaitingServer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = () =>
      processRecoveryUrl().then((result) => {
        if (cancelled) return;
        setUrlError(result.error);
        setAwaitingServer(result.sessionSet);
        setPhase("ready");
        if (result.sessionSet) router.refresh();
      });
    run();
    window.addEventListener("hashchange", run);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", run);
    };
  }, [router]);

  if (phase === "checking" || (awaitingServer && !hasSession)) return <p className="text-center text-sm text-slate-500">Verifying reset link…</p>;

  if (!hasSession) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-red-600">{urlError ?? (linkError ? "This reset link is invalid or has expired." : "Open the reset link from your email to continue.")}</p>
        <Link href="/auth/forgot-password" className="font-medium text-brand-blue hover:underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {email && <p className="text-sm text-slate-600">Setting a new password for <strong>{email}</strong>.</p>}
      <input type="text" name="username" autoComplete="username" defaultValue={email ?? ""} hidden readOnly />
      <div>
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </div>
      <div>
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </div>
      <p className="text-xs text-slate-400">At least 8 characters; 12+ with a mix of words, numbers and symbols recommended.</p>
      {state.status === "error" && state.message && <p className="text-sm text-red-600">{state.message}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Set new password"}
      </Button>
    </form>
  );
}
