import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { PlaceholderPage } from "@/components/admin/PlaceholderPage";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminSettingsPage() {
  const profile = await requirePermission("settings");
  return (
    <div className="space-y-6">
      {profile.role === "admin" && (
        <Link href="/admin/settings/integrations" className="block">
          <Card className="transition-colors hover:border-brand-blue">
            <CardContent className="py-5">
              <p className="font-semibold text-slate-900">Integrations</p>
              <p className="mt-1 text-sm text-slate-500">
                Google Drive, Meta, Claude, OpenAI, Gemini, Fal.ai and upcoming platforms.
              </p>
            </CardContent>
          </Card>
        </Link>
      )}
      {profile.role === "admin" && (
        <Link href="/admin/settings/ai" className="block">
          <Card className="transition-colors hover:border-brand-blue">
            <CardContent className="py-5">
              <p className="font-semibold text-slate-900">AI Brain</p>
              <p className="mt-1 text-sm text-slate-500">
                Default AI provider and model, task-specific models and optional fallback.
              </p>
            </CardContent>
          </Card>
        </Link>
      )}
      <PlaceholderPage title="Settings" description="Command Center configuration." />
    </div>
  );
}
