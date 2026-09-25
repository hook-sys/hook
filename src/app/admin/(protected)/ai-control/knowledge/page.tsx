import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";
import { createClient } from "@/lib/supabase/server";
import { ClientStatusBadge } from "@/components/admin/ClientStatusBadge";
import { Card } from "@/components/ui/card";
import { AI_KNOWLEDGE_FIELDS, type ClientAiKnowledge } from "@/types/ai";

export default async function AiKnowledgePage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [clients, { data }] = await Promise.all([
    listClients(),
    supabase.from("client_ai_knowledge").select("*"),
  ]);
  const knowledgeByClient = new Map((data as ClientAiKnowledge[] | null ?? []).map((k) => [k.client_id, k]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI Knowledge</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Each client has its own knowledge base, kept separate by client. Open a client to edit its business context,
          customer profile, brand voice and more.
        </p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Knowledge</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((client) => {
                const knowledge = knowledgeByClient.get(client.id);
                const filled = knowledge ? AI_KNOWLEDGE_FIELDS.filter(({ key }) => knowledge[key]).length : 0;
                return (
                  <tr key={client.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{client.business_name}</td>
                    <td className="px-5 py-3">
                      <ClientStatusBadge status={client.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {filled} / {AI_KNOWLEDGE_FIELDS.length} sections
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/admin/clients/${client.id}/knowledge`} className="font-medium text-brand-blue hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
