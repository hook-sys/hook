"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type PasswordResetState } from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: PasswordResetState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "success") {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-emerald-700">{state.message}</p>
        <Link href="/admin/login" className="font-medium text-brand-blue hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.status === "error" && state.message && <p className="text-sm text-red-600">{state.message}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending..." : "Send reset link"}
      </Button>
      <Link href="/admin/login" className="block text-center text-sm text-brand-blue hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
