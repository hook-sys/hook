import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { AiKnowledgeForm } from "@/components/admin/ai/AiKnowledgeForm";
import { buildAiContext, AiContextError, type AiContext } from "@/lib/ai/context";
import { saveClientAiKnowledge } from "@/lib/actions/ai";
import { requirePermission } from "@/lib/auth/session";
import { getClientAiKnowledge } from "@/lib/services/ai";
import { getClientById } from "@/lib/services/clients";
import { listProducts } from "@/lib/services/products";
import { AI_KNOWLEDGE_FIELDS } from "@/types/ai";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ClientKnowledgePage({ params, searchParams }: PageProps<"/admin/clients/[id]/knowledge">) {
  const profile = await requirePermission("clients");
  const isSuperAdmin = profile.role === "admin";
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const knowledge = await getClientAiKnowledge(client.id);

  let products: Awaited<ReturnType<typeof listProducts>> = [];
  let context: AiContext | null = null;
  let contextError: string | null = null;
  let selectedProduct = "";
  if (isSuperAdmin) {
    products = await listProducts(client.id);
    const query = await searchParams;
    const requested = typeof query.product === "string" ? query.product : "";
    selectedProduct = products.some((p) => p.id === requested) ? requested : "";
    try {
      context = await buildAiContext({ clientId: client.id, productId: selectedProduct || null });
    } catch (error) {
      contextError = error instanceof AiContextError ? error.message : "Could not build the AI context.";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clients/${client.id}`} className="text-sm text-brand-blue hover:underline">
          &larr; {client.business_name}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">AI Knowledge</h1>
        <p className="mt-1 text-sm text-slate-500">
          Client-specific context future AI features will use, alongside product data, the global HATOG framework and
          negative prompts.
        </p>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <CardTitle>Knowledge</CardTitle>
          {knowledge && <span className="text-xs text-slate-400">Updated {formatDateTime(knowledge.updated_at)}</span>}
        </CardHeader>
        <CardContent className="py-6">
          {isSuperAdmin ? (
            <AiKnowledgeForm action={saveClientAiKnowledge.bind(null, client.id)} knowledge={knowledge} />
          ) : (
            <dl className="space-y-5">
              {AI_KNOWLEDGE_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                    {knowledge?.[key] || <span className="text-slate-400">Not provided</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card id="ai-context" className="scroll-mt-24">
          <CardHeader>
            <CardTitle>AI Context Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              The structured context the AI context builder produces for this client. Nothing is sent to any AI provider or
              Fal.ai — this is a read-only preview.
            </p>
            <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:w-80">
                <label htmlFor="product" className="mb-1.5 block text-sm font-medium text-slate-700">Product</label>
                <Select id="product" name="product" defaultValue={selectedProduct}>
                  <option value="">Client only (no product)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="secondary">Build Context</Button>
            </form>
            {contextError ? (
              <p className="text-sm text-red-600">{contextError}</p>
            ) : (
              <pre className="max-h-[32rem] overflow-auto rounded-md bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
                {JSON.stringify(context, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
