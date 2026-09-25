import { requireSuperAdmin } from "@/lib/auth/session";
import { listHatogStages } from "@/lib/services/ai";
import { HatogStageForm } from "@/components/admin/ai/HatogStageForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HatogFunnelPage() {
  await requireSuperAdmin();
  const stages = await listHatogStages();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">HATOG Funnel</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          The global Hook Marketing framework — Hook, Feature, Trust, Offer, Gift — adapted to Bangladesh market
          psychology. It applies to every client; client-specific details live in each client&apos;s AI Knowledge.
          Disabled stages are left out of the AI context.
        </p>
      </div>

      {stages.map((stage) => (
        <Card key={stage.key}>
          <CardHeader className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-sm font-bold text-white">
                {stage.letter}
              </span>
              {stage.name}
            </CardTitle>
            <Badge variant={stage.enabled ? "green" : "slate"}>{stage.enabled ? "Enabled" : "Disabled"}</Badge>
          </CardHeader>
          <CardContent className="py-5">
            <HatogStageForm stage={stage} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
