import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/admin/ActionButton";
import { InlineActionForm } from "@/components/admin/InlineActionForm";
import { ContentStatusBadge } from "@/components/admin/calendar/CalendarBadges";
import { CalendarItemForm } from "@/components/admin/calendar/CalendarItemForm";
import {
  regenerateCalendarItemAction,
  setCalendarItemStatusAction,
  updateCalendarItemAction,
} from "@/lib/actions/content-calendar";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS, canTransitionContentItem, type ContentItemStatus } from "@/lib/ai/content-calendar";
import { getAiProviderReadiness } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/session";
import { getClientById } from "@/lib/services/clients";
import { getCalendarItem } from "@/lib/services/content-calendar";
import { listProducts } from "@/lib/services/products";
import { isUuid } from "@/lib/validation/ids";

export const maxDuration = 120;

const STATUS_ACTIONS: { to: ContentItemStatus; label: string }[] = [
  { to: "approved", label: "Approve" },
  { to: "scheduled", label: "Mark Scheduled" },
  { to: "failed", label: "Mark Failed" },
  { to: "draft", label: "Back to Draft" },
  { to: "archived", label: "Archive" },
];

export default async function CalendarItemPage({ params }: PageProps<"/admin/clients/[id]/content-calendar/[itemId]">) {
  const profile = await requirePermission("content");
  const { id, itemId } = await params;
  const client = await getClientById(id);
  if (!client) notFound();
  // Scoped by client_id: an item ID from another client 404s.
  const item = isUuid(itemId) ? await getCalendarItem(client.id, itemId) : null;
  if (!item) notFound();

  const [products, readiness] = await Promise.all([listProducts(client.id), getAiProviderReadiness()]);
  const editable = !["published", "archived"].includes(item.status);
  const canRegenerate = ["draft", "approved"].includes(item.status);
  const allowed = STATUS_ACTIONS.filter((a) => canTransitionContentItem(item.status, a.to, profile.role));
  const canPublish = canTransitionContentItem(item.status, "published", profile.role);
  const product = products.find((p) => p.id === item.product_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/admin/clients/${client.id}/content-calendar`} className="text-sm text-brand-blue hover:underline">
            &larr; Content calendar
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">
              {item.scheduled_date} · {CONTENT_TYPE_LABELS[item.content_type]}
            </h1>
            <ContentStatusBadge status={item.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {PLATFORM_LABELS[item.platform]} · {product?.name ?? "Brand-level"}
            {item.post_url && (
              <>
                {" · "}
                <a href={item.post_url} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">
                  Live post
                </a>
              </>
            )}
          </p>
        </div>
        {allowed.length > 0 && (
          <div className="flex flex-wrap items-start gap-2">
            {allowed.map((a) => (
              <ActionButton
                key={a.to}
                action={setCalendarItemStatusAction.bind(null, client.id, item.id, a.to)}
                label={a.label}
                pendingLabel="Updating..."
                variant={a.to === "approved" ? "primary" : a.to === "archived" ? "ghost" : "outline"}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Content</CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <CalendarItemForm
              action={updateCalendarItemAction.bind(null, client.id, item.id)}
              editable={editable}
              products={products.filter((p) => p.status !== "archived" || p.id === item.product_id).map((p) => ({ id: p.id, name: p.name }))}
              initial={{
                scheduled_date: item.scheduled_date,
                content_type: item.content_type,
                platform: item.platform,
                product_id: item.product_id ?? "",
                hatog_stage: item.hatog_stage,
                suggested_format: item.suggested_format,
                aspect_ratio: item.aspect_ratio,
                duration_seconds: item.duration_seconds?.toString() ?? "15",
                hook: item.hook,
                concept: item.concept,
                caption: item.caption,
                cta: item.cta,
                notes: item.notes ?? "",
                creative_direction: item.creative_direction,
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {canRegenerate && (
            <Card>
              <CardHeader>
                <CardTitle>Regenerate with AI</CardTitle>
              </CardHeader>
              <CardContent className="py-6">
                {readiness.brain === "ready" ? (
                  <InlineActionForm
                    action={regenerateCalendarItemAction.bind(null, client.id, item.id)}
                    name="instructions"
                    label="Instructions (optional)"
                    placeholder="e.g. make it a reel showing the product in use"
                    submitLabel="Regenerate Item"
                    pendingLabel="Regenerating..."
                    multiline
                  />
                ) : (
                  <p className="text-sm text-amber-700">
                    {readiness.brainDetail ?? `Connect ${readiness.brainLabel} to regenerate items.`}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {canPublish && (
            <Card>
              <CardHeader>
                <CardTitle>Record as Published</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 py-6">
                <p className="text-xs text-slate-500">Posting isn&apos;t automated yet. After posting manually, record the live URL.</p>
                <InlineActionForm
                  action={setCalendarItemStatusAction.bind(null, client.id, item.id, "published")}
                  name="post_url"
                  label="Live post URL"
                  placeholder="https://www.facebook.com/..."
                  submitLabel="Mark Published"
                  pendingLabel="Saving..."
                  required
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
