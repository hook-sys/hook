import { requireSuperAdmin } from "@/lib/auth/session";
import { listNegativePrompts } from "@/lib/services/ai";
import { NegativePromptRow, NewNegativePromptForm } from "@/components/admin/ai/NegativePromptForms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NegativePromptsPage() {
  await requireSuperAdmin();
  const rules = await listNegativePrompts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Negative Prompts</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Global rules every AI generation must respect. Categories let future image, video, and copy generators pick
          the relevant rules; General applies to all. Disabled rules are left out of the AI context.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Rule</CardTitle>
        </CardHeader>
        <CardContent>
          <NewNegativePromptForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules ({rules.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-slate-500">No rules yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rules.map((rule) => (
                <NegativePromptRow key={`${rule.id}-${rule.updated_at}`} rule={rule} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
