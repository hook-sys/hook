import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientAiKnowledge } from "@/lib/services/ai";
import { AI_KNOWLEDGE_FIELDS } from "@/types/ai";

export async function ClientAiKnowledgeCard({ clientId, isSuperAdmin }: { clientId: string; isSuperAdmin: boolean }) {
  const knowledge = await getClientAiKnowledge(clientId);
  const filled = AI_KNOWLEDGE_FIELDS.filter(({ key }) => knowledge?.[key]);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle>AI Knowledge</CardTitle>
        <Link href={`/admin/clients/${clientId}/knowledge`} className="text-sm font-medium text-brand-blue hover:underline">
          {isSuperAdmin ? "Edit" : "View"}
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-slate-500">
          {filled.length} of {AI_KNOWLEDGE_FIELDS.length} sections filled
        </p>
        <div className="flex flex-wrap gap-1.5">
          {AI_KNOWLEDGE_FIELDS.map(({ key, label }) => (
            <span
              key={key}
              className={
                knowledge?.[key]
                  ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                  : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400"
              }
            >
              {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
