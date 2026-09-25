// Pure: Meta Ads Insights normalization. Metric values come only from the API; derived
// ratios are computed only when their inputs exist, otherwise they are null ("N/A").

export const DATE_PRESETS = ["today", "yesterday", "last_7d", "last_30d"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export const DATE_PRESET_LABELS: Record<DatePreset | "custom", string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7d: "Last 7 Days",
  last_30d: "Last 30 Days",
  custom: "Custom",
};

export interface InsightRange {
  key: string; // cache key: preset name or custom:since:until
  preset: DatePreset | null;
  since: string;
  until: string;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDaysUtc = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const validIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && isoDay(new Date(`${v}T00:00:00Z`)) === v;

// Resolves UI input into a range. Dates are UTC approximations for display/caching; Meta
// applies presets in the ad account's time zone.
export function resolveRange(
  preset: string | undefined,
  since?: string,
  until?: string,
  now: Date = new Date()
): { ok: true; range: InsightRange } | { ok: false; error: string } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (preset === "custom") {
    if (!since || !until || !validIso(since) || !validIso(until)) return { ok: false, error: "Enter valid custom dates." };
    if (until < since) return { ok: false, error: "The end date must be on or after the start date." };
    if (until > isoDay(today)) return { ok: false, error: "The end date can't be in the future." };
    const span = (Date.parse(until) - Date.parse(since)) / 86_400_000 + 1;
    if (span > 90) return { ok: false, error: "Custom ranges can be at most 90 days." };
    if (since < isoDay(addDaysUtc(today, -36 * 30))) return { ok: false, error: "Meta keeps insights for about 37 months." };
    return { ok: true, range: { key: `custom:${since}:${until}`, preset: null, since, until } };
  }
  const p = (DATE_PRESETS as readonly string[]).includes(preset ?? "") ? (preset as DatePreset) : "last_7d";
  const ranges: Record<DatePreset, [Date, Date]> = {
    today: [today, today],
    yesterday: [addDaysUtc(today, -1), addDaysUtc(today, -1)],
    last_7d: [addDaysUtc(today, -7), addDaysUtc(today, -1)],
    last_30d: [addDaysUtc(today, -30), addDaysUtc(today, -1)],
  };
  const [s, u] = ranges[p];
  return { ok: true, range: { key: p, preset: p, since: isoDay(s), until: isoDay(u) } };
}

// The equal-length period immediately before `range` (for "notable changes").
export function previousRange(range: InsightRange): InsightRange {
  const days = (Date.parse(range.until) - Date.parse(range.since)) / 86_400_000 + 1;
  const until = addDaysUtc(new Date(`${range.since}T00:00:00Z`), -1);
  const since = addDaysUtc(until, -(days - 1));
  return { key: `custom:${isoDay(since)}:${isoDay(until)}`, preset: null, since: isoDay(since), until: isoDay(until) };
}

export interface ActionStat {
  action_type?: string;
  value?: string;
}

export interface RawInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: ActionStat[];
  action_values?: ActionStat[];
  purchase_roas?: ActionStat[];
  account_currency?: string;
}

export interface MetricRow {
  id: string | null;
  name: string | null;
  campaignId: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  leads: number | null;
  addToCart: number | null;
  conversions: number | null; // purchases + leads, when either is reported
  roas: number | null;
}

export const INSIGHT_FIELDS = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "frequency",
  "actions",
  "action_values",
  "purchase_roas",
  "account_currency",
];

function num(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Prefer one canonical action type to avoid double counting (Meta reports several
// overlapping purchase/lead action types).
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const ATC_TYPES = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];

function pickAction(list: ActionStat[] | undefined, types: string[]): number | null {
  if (!Array.isArray(list)) return null;
  for (const type of types) {
    const hit = list.find((a) => a.action_type === type);
    if (hit) return num(hit.value);
  }
  return null;
}

const ratio = (a: number | null, b: number | null, factor = 1) => (a !== null && b !== null && b > 0 ? (a / b) * factor : null);

export function normalizeRow(raw: RawInsightRow, level: "account" | "campaign" | "ad"): MetricRow {
  const spend = num(raw.spend);
  const impressions = num(raw.impressions);
  const clicks = num(raw.clicks);
  const purchases = pickAction(raw.actions, PURCHASE_TYPES);
  const leads = pickAction(raw.actions, LEAD_TYPES);
  const purchaseValue = pickAction(raw.action_values, PURCHASE_TYPES);
  const reportedRoas = pickAction(raw.purchase_roas, PURCHASE_TYPES);
  return {
    id: level === "campaign" ? (raw.campaign_id ?? null) : level === "ad" ? (raw.ad_id ?? null) : null,
    name: level === "campaign" ? (raw.campaign_name ?? null) : level === "ad" ? (raw.ad_name ?? null) : null,
    campaignId: raw.campaign_id ?? null,
    spend,
    impressions,
    reach: num(raw.reach),
    clicks,
    ctr: num(raw.ctr) ?? ratio(clicks, impressions, 100),
    cpc: num(raw.cpc) ?? ratio(spend, clicks),
    cpm: num(raw.cpm) ?? ratio(spend, impressions, 1000),
    frequency: num(raw.frequency),
    purchases,
    purchaseValue,
    leads,
    addToCart: pickAction(raw.actions, ATC_TYPES),
    conversions: purchases === null && leads === null ? null : (purchases ?? 0) + (leads ?? 0),
    roas: reportedRoas ?? ratio(purchaseValue, spend),
  };
}

const sumOrNull = (values: (number | null)[]) =>
  values.some((v) => v !== null) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null;

// Rolls up rows (e.g. campaigns of one product). Reach/frequency are not additive across
// campaigns, so they are N/A in rollups.
export function rollup(rows: MetricRow[], name: string): MetricRow {
  const spend = sumOrNull(rows.map((r) => r.spend));
  const impressions = sumOrNull(rows.map((r) => r.impressions));
  const clicks = sumOrNull(rows.map((r) => r.clicks));
  const purchases = sumOrNull(rows.map((r) => r.purchases));
  const leads = sumOrNull(rows.map((r) => r.leads));
  const purchaseValue = sumOrNull(rows.map((r) => r.purchaseValue));
  return {
    id: null,
    name,
    campaignId: null,
    spend,
    impressions,
    reach: null,
    clicks,
    ctr: ratio(clicks, impressions, 100),
    cpc: ratio(spend, clicks),
    cpm: ratio(spend, impressions, 1000),
    frequency: null,
    purchases,
    purchaseValue,
    leads,
    addToCart: sumOrNull(rows.map((r) => r.addToCart)),
    conversions: purchases === null && leads === null ? null : (purchases ?? 0) + (leads ?? 0),
    roas: ratio(purchaseValue, spend),
  };
}

export interface CampaignInfo {
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  objective: string | null;
}

export interface InsightsSnapshot {
  range: InsightRange;
  currency: string | null;
  account: MetricRow | null;
  campaigns: MetricRow[];
  ads: MetricRow[];
  campaignInfo: CampaignInfo[];
  previous: { account: MetricRow | null; campaigns: MetricRow[] } | null;
  fetchedAt: string;
}

export interface InternalCampaignRef {
  meta_campaign_id: string | null;
  product_id: string;
  hatog_stage: string | null;
}

// Maps Meta campaigns to internal products/HATOG stages where a campaign was created from
// this system. Unmapped campaigns are grouped separately — never guessed.
export function mapToInternal(
  campaigns: MetricRow[],
  internal: InternalCampaignRef[],
  productNames: Map<string, string>
) {
  const byMetaId = new Map(internal.filter((c) => c.meta_campaign_id).map((c) => [c.meta_campaign_id!, c]));
  const mapping = new Map<string, { product: string | null; hatogStage: string | null }>();
  const productGroups = new Map<string, MetricRow[]>();
  const hatogGroups = new Map<string, MetricRow[]>();

  for (const row of campaigns) {
    const ref = row.id ? byMetaId.get(row.id) : undefined;
    const product = ref ? (productNames.get(ref.product_id) ?? "Unknown product") : null;
    const stage = ref?.hatog_stage ?? null;
    if (row.id) mapping.set(row.id, { product, hatogStage: stage });
    const pKey = product ?? "Unmapped (not created here)";
    const hKey = stage ?? "Unmapped";
    productGroups.set(pKey, [...(productGroups.get(pKey) ?? []), row]);
    hatogGroups.set(hKey, [...(hatogGroups.get(hKey) ?? []), row]);
  }

  return {
    mapping,
    productRollups: [...productGroups].map(([name, rows]) => rollup(rows, name)),
    hatogRollups: [...hatogGroups].map(([name, rows]) => rollup(rows, name)),
  };
}

export function formatMetric(value: number | null, kind: "money" | "int" | "pct" | "ratio" | "dec", currency?: string | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  switch (kind) {
    case "money":
      return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
    case "int":
      return Math.round(value).toLocaleString("en-US");
    case "pct":
      return `${value.toFixed(2)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    default:
      return value.toFixed(2);
  }
}

export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
