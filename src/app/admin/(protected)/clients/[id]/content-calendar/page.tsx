import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ContentStatusBadge } from "@/components/admin/calendar/CalendarBadges";
import { CalendarGeneratorForm } from "@/components/admin/calendar/CalendarGeneratorForm";
import { CalendarMonthGrid } from "@/components/admin/calendar/CalendarMonthGrid";
import { ProviderBanner } from "@/components/admin/ProviderBanner";
import { generateCalendarAction } from "@/lib/actions/content-calendar";
import {
  CONTENT_ITEM_STATUSES,
  CONTENT_ITEM_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  PLATFORM_LABELS,
  isIsoDate,
} from "@/lib/ai/content-calendar";
import { getAiProviderReadiness } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/session";
import { getClientById } from "@/lib/services/clients";
import { listCalendarItems } from "@/lib/services/content-calendar";
import { listProducts } from "@/lib/services/products";
import { HATOG_STAGE_KEYS, HATOG_STAGE_LABELS } from "@/types/ai";

// One structured AI brain request can take a few minutes for a 30-day plan.
export const maxDuration = 300;

export default async function ContentCalendarPage({ params, searchParams }: PageProps<"/admin/clients/[id]/content-calendar">) {
  const profile = await requirePermission("content");
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const query = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const [products, readiness] = await Promise.all([listProducts(client.id), getAiProviderReadiness()]);
  const productIds = products.map((p) => p.id);
  const filters = {
    from: isIsoDate(str(query.from)) ? str(query.from) : "",
    to: isIsoDate(str(query.to)) ? str(query.to) : "",
    productId: productIds.includes(str(query.product)) ? str(query.product) : "",
    hatogStage: (HATOG_STAGE_KEYS as readonly string[]).includes(str(query.stage)) ? str(query.stage) : "",
    status: (CONTENT_ITEM_STATUSES as readonly string[]).includes(str(query.status)) ? str(query.status) : "",
  };
  const view = str(query.view) === "list" ? "list" : "calendar";
  const items = await listCalendarItems(client.id, filters);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const basePath = `/admin/clients/${client.id}/content-calendar`;
  const activeProducts = products.filter((p) => p.status !== "archived");
  const viewHref = (v: string) => {
    const params = new URLSearchParams(Object.entries({ ...filters, view: v }).filter(([, val]) => val) as [string, string][]);
    return `${basePath}?${params}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Content Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Facebook &amp; Instagram plan built from this client&apos;s products, AI Knowledge, HATOG and negative rules. Nothing is posted
          automatically.
        </p>
      </div>

      <ProviderBanner provider={readiness.brainLabel} state={readiness.brain} detail={readiness.brainDetail} isSuperAdmin={profile.role === "admin"} />

      <Card>
        <CardHeader>
          <CardTitle>Generate Calendar</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          {activeProducts.length === 0 ? (
            <p className="text-sm text-slate-500">
              This client has no products yet. Add products first — the calendar is planned around real product data.
            </p>
          ) : (
            <CalendarGeneratorForm
              action={generateCalendarAction.bind(null, client.id)}
              products={activeProducts.map((p) => ({ id: p.id, name: p.name }))}
              defaultStartDate={new Date().toISOString().slice(0, 10)}
              aiReady={readiness.brain === "ready"}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <form method="get" className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <input type="hidden" name="view" value={view} />
          <div>
            <label htmlFor="from" className="mb-1.5 block text-sm font-medium text-slate-700">From</label>
            <Input id="from" name="from" type="date" defaultValue={filters.from} />
          </div>
          <div>
            <label htmlFor="to" className="mb-1.5 block text-sm font-medium text-slate-700">To</label>
            <Input id="to" name="to" type="date" defaultValue={filters.to} />
          </div>
          <div>
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
          <div>
            <label htmlFor="stage" className="mb-1.5 block text-sm font-medium text-slate-700">HATOG</label>
            <Select id="stage" name="stage" defaultValue={filters.hatogStage}>
              <option value="">All stages</option>
              {HATOG_STAGE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {HATOG_STAGE_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
            <Select id="status" name="status" defaultValue={filters.status}>
              <option value="">Active (not archived)</option>
              {CONTENT_ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTENT_ITEM_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>

        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <p className="text-sm text-slate-500">{items.length} item{items.length === 1 ? "" : "s"}</p>
          <div className="flex gap-1 text-sm">
            {(["calendar", "list"] as const).map((v) => (
              <Link
                key={v}
                href={viewHref(v)}
                aria-current={view === v ? "page" : undefined}
                className={
                  view === v
                    ? "rounded-md bg-brand-blue px-3 py-1 font-medium text-white"
                    : "rounded-md px-3 py-1 font-medium text-slate-600 hover:bg-slate-100"
                }
              >
                {v === "calendar" ? "Calendar" : "List"}
              </Link>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {Object.values(filters).some(Boolean) ? "No items match these filters." : "No calendar yet. Generate one above."}
          </div>
        ) : view === "calendar" ? (
          <div className="p-5">
            <CalendarMonthGrid items={items} basePath={basePath} />
          </div>
        ) : (
          <div className="overflow-x-auto p-5 pt-3">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Platform</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">HATOG</th>
                  <th className="px-3 py-2">Hook</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`${basePath}/${item.id}`} className="font-medium text-slate-900 hover:underline">
                        {item.scheduled_date}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{CONTENT_TYPE_LABELS[item.content_type]}</td>
                    <td className="px-3 py-2 text-slate-600">{PLATFORM_LABELS[item.platform]}</td>
                    <td className="px-3 py-2 text-slate-600">{item.product_id ? (productName.get(item.product_id) ?? "—") : "Brand"}</td>
                    <td className="px-3 py-2 text-slate-600">{HATOG_STAGE_LABELS[item.hatog_stage]}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-slate-600">{item.hook}</td>
                    <td className="px-3 py-2">
                      <ContentStatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
