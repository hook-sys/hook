"use server";

import { redirect } from "next/navigation";
import { logEvent } from "@/lib/observability";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export interface PasswordResetState {
  status: "idle" | "error" | "success";
  message?: string;
}

const GENERIC_SENT =
  "If that email belongs to an admin account, a reset link is on its way. Open it in this same browser.";

// Sends a recovery email whose link returns to this deployment's /auth/callback (PKCE).
// The response is identical whether or not the account exists (no account enumeration).
export async function requestPasswordReset(_prev: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/auth/reset-password`,
  });
  if (error) {
    // Supabase rate limits recovery emails; surface that, hide everything else.
    logEvent("warn", { provider: "supabase", operation: "password_reset_request", status: "failed", errorCode: error.status ?? null });
    if (error.status === 429) return { status: "error", message: "Too many reset requests. Please wait a few minutes and try again." };
  }
  return { status: "success", message: GENERIC_SENT };
}

// Requires the recovery session established by /auth/callback or the recovery page.
export async function updatePassword(_prev: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { status: "error", message: "Use at least 8 characters (12+ recommended)." };
  if (password.length > 72) return { status: "error", message: "Use at most 72 characters." };
  if (password !== confirm) return { status: "error", message: "The passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    logEvent("warn", { provider: "supabase", operation: "password_update", userId: user.id, status: "failed", errorCode: error.code ?? error.status ?? null });
    const weak = error.code === "weak_password" || /password/i.test(error.message);
    return {
      status: "error",
      message: weak ? `Password rejected: ${error.message}` : "Could not update the password. Request a new reset link and try again.",
    };
  }

  // Sign out every session (including other devices) so only the new password works.
  await supabase.auth.signOut({ scope: "global" });
  logEvent("info", { provider: "supabase", operation: "password_update", userId: user.id, status: "succeeded" });
  redirect("/admin/login?reset=success");
}
