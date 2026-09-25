import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordPanel } from "@/components/auth/ResetPasswordPanel";
import { createClient } from "@/lib/supabase/server";

// Recovery sessions are short-lived and per-request; never cache this page.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/auth/reset-password">) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AuthCard subtitle="Set a new admin password">
      <ResetPasswordPanel hasSession={Boolean(user)} email={user?.email ?? null} linkError={params.error === "link_invalid"} />
    </AuthCard>
  );
}
