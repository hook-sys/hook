import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { CreativeCard } from "@/components/admin/creative/CreativeCard";
import { CreativeGeneratorForm } from "@/components/admin/creative/CreativeGeneratorForm";
import { GeneratingPoller } from "@/components/admin/creative/GeneratingPoller";
import { ProviderBanner } from "@/components/admin/ProviderBanner";
import { generateCreative, previewCreativeRequest } from "@/lib/actions/creatives";
import { AI_HOURLY_CALL_LIMIT, getAiProviderReadiness, getClientUsageSummary } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/session";
import {
  CREATIVE_STATUSES,
  CREATIVE_STATUS_LABELS,
  CREATIVE_TYPE_LABELS,
  type CreativeType,
} from "@/lib/creative/options";
import { getClientById } from "@/lib/services/clients";
import { listCreatives, listGeneratingCreatives } from "@/lib/services/creatives";
import { isGoogleDriveConnected } from "@/lib/integrations/google-drive";
import { ActionButton } from "@/components/admin/ActionButton";
import { CampaignCreativePicker } from "@/components/admin/campaigns/CampaignCreativePicker";
import { uploadAllReadyToDriveAction, uploadSelectedToDriveAction } from "@/lib/actions/creatives";
import { listClientImageAssets, listProducts } from "@/lib/services/products";

const ALL_TYPES = Object.keys(CREATIVE_TYPE_LABELS) as CreativeType[];

// Brief generation + Drive uploads can exceed the default function timeout.
export const maxDuration = 300;

export default async function CreativeStudioPage({ params, searchParams }: PageProps<"/admin/clients/[id]/creative-studio">) {
  const profile = await requirePermission("content");
  const isSuperAdmin = profile.role === "admin";
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const query = await searchParams;
  const pick = (v: unknown, allowed: readonly string[]) => (typeof v === "string" && allowed.includes(v) ? v : "");

  const [products, images, readiness] = await Promise.all([
    listProducts(client.id),
    listClientImageAssets(client.id),
    getAiProviderReadiness(),
  ]);
  const productIds = products.map((p) => p.id);
  const filters = {
    productId: pick(query.product, productIds),
    creativeType: pick(query.type, ALL_TYPES),
    status: pick(query.status, CREATIVE_STATUSES),
  };
  const [creatives, allGenerating, usage, driveConnected, readyCreatives] = await Promise.all([
    listCreatives(client.id, filters),
    listGeneratingCreatives(client.id),
    isSuperAdmin ? getClientUsageSummary(client.id) : Promise.resolve(null),
    isSuperAdmin ? isGoogleDriveConnected() : Promise.resolve(false),
    isSuperAdmin ? listCreatives(client.id, { status: "ready" }) : Promise.resolve([]),
  ]);
  const notInDrive = readyCreatives.filter((c) => c.drive_upload_status !== "uploaded" && c.drive_upload_status !== "uploading");
  const productName = new Map(products.map((p) => [p.id, p.name]));

  const generatorProducts = products
    .filter((p) => p.status !== "archived")
    .map((p) => ({
      id: p.id,
      name: p.name,
      images: images
        .filter((a) => a.product_id === p.id)
        .map((a, i) => ({ id: a.id, label: a.label || `Image ${i + 1}` })),
    }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clients/${client.id}`} className="text-sm text-brand-blue hover:underline">
          &larr; {client.business_name}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Creative Studio</h1>
        <p className="mt-1 text-sm text-slate-500">
          The AI brain writes the creative brief from this client&apos;s AI context; Fal.ai generates the image or video.
        </p>
      </div>

      <ProviderBanner provider={readiness.brainLabel} state={readiness.brain} isSuperAdmin={isSuperAdmin} />
      <ProviderBanner provider="Fal.ai" state={readiness.fal} isSuperAdmin={isSuperAdmin} />
      <GeneratingPoller clientId={client.id} count={allGenerating.length} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>New Creative</CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <CreativeGeneratorForm
              products={generatorProducts}
              generateAction={generateCreative.bind(null, client.id)}
              previewAction={isSuperAdmin ? previewCreativeRequest.bind(null, client.id) : undefined}
              canGenerate={readiness.brain === "ready" && readiness.fal === "ready"}
            />
          </CardContent>
        </Card>

        {usage && (
          <Card>
            <CardHeader>
              <CardTitle>AI Usage (30 days)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 py-6 text-sm text-slate-700">
              <p>
                Claude: {usage.anthropic.calls} call{usage.anthropic.calls === 1 ? "" : "s"} · ~${usage.anthropic.costUsd.toFixed(2)}
              </p>
              {usage.openai.calls > 0 && (
                <p>
                  OpenAI: {usage.openai.calls} call{usage.openai.calls === 1 ? "" : "s"} · cost N/A
                </p>
              )}
              {usage.gemini.calls > 0 && (
                <p>
                  Gemini: {usage.gemini.calls} call{usage.gemini.calls === 1 ? "" : "s"} · cost N/A
                </p>
              )}
              <p>
                Fal.ai: {usage.fal.calls} job{usage.fal.calls === 1 ? "" : "s"} · ~${usage.fal.costUsd.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400">
                Estimates from token counts and Fal.ai list prices, not invoices. Limit: {AI_HOURLY_CALL_LIMIT} AI calls per client per hour.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Google Drive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 py-6">
            {!driveConnected ? (
              <ProviderBanner provider="Google Drive" state="not_connected" isSuperAdmin />
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Ready creatives are saved to <strong>{client.business_name} / Creatives / Images|Videos</strong>. Missing folders are created;
                  existing ones are reused.
                </p>
                {notInDrive.length > 0 && (
                  <ActionButton
                    action={uploadAllReadyToDriveAction.bind(null, client.id)}
                    label={`Upload All Ready (${notInDrive.length})`}
                    pendingLabel="Uploading..."
                    variant="primary"
                  />
                )}
                <CampaignCreativePicker
                  action={uploadSelectedToDriveAction.bind(null, client.id)}
                  creatives={notInDrive.map((c) => ({
                    id: c.id,
                    media: c.media,
                    previewUrl: c.asset_url,
                    label: `${c.brief.concept ?? CREATIVE_TYPE_LABELS[c.creative_type]} (${c.media}, ${c.format})`,
                  }))}
                  selectedIds={[]}
                  editable
                  submitLabel="Upload Selected"
                  pendingLabel="Uploading..."
                  emptyMessage="All ready creatives are in Drive."
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Creative Library</CardTitle>
        </CardHeader>
        <form method="get" className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-end">
          <div className="sm:w-56">
            <label htmlFor="product" className="mb-1.5 block text-sm font-medium text-slate-700">Product</label>
            <Select id="product" name="product" defaultValue={filters.productId}>
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:w-56">
            <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
            <Select id="type" name="type" defaultValue={filters.creativeType}>
              <option value="">All types</option>
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CREATIVE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:w-44">
            <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
            <Select id="status" name="status" defaultValue={filters.status}>
              <option value="">Active (not archived)</option>
              {CREATIVE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CREATIVE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>

        {creatives.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {filters.productId || filters.creativeType || filters.status ? "No creatives match these filters." : "No creatives yet."}
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {creatives.map((c) => (
              <CreativeCard
                key={c.id}
                creative={c}
                productName={productName.get(c.product_id) ?? "Product"}
                canUploadToDrive={isSuperAdmin && driveConnected}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
