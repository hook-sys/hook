import type { InsightsSnapshot, MetricRow } from "@/lib/meta/insights";

// Pure: AI marketing report over REAL retrieved metrics. Every statement is labeled FACT,
// INTERPRETATION or RECOMMENDATION. Facts are machine-checked: any number a "fact" cites
// must appear in the metrics sent to Claude, otherwise it is downgraded to an unverified
// interpretation — AI speculation is never shown as fact.

export const STATEMENT_KINDS = ["fact", "interpretation", "recommendation"] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

export interface ReportStatement {
  kind: StatementKind;
  text: string;
  evidence: string;
  unverified?: boolean;
}

export const REPORT_SECTIONS = [
  "summary",
  "notable_changes",
  "top_campaigns",
  "weak_campaigns",
  "possible_reasons",
  "funnel_observations",
  "creative_observations",
  "next_actions",
  "data_gaps",
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  summary: "Summary",
  notable_changes: "Notable Changes",
  top_campaigns: "Top Performing Campaigns",
  weak_campaigns: "Weak Campaigns",
  possible_reasons: "Possible Reasons",
  funnel_observations: "Funnel Observations",
  creative_observations: "Creative Observations",
  next_actions: "Next Actions",
  data_gaps: "Questions / Data Gaps",
};

// Which statement kinds each section may contain.
const ALLOWED_KINDS: Record<ReportSection, readonly StatementKind[]> = {
  summary: ["fact", "interpretation"],
  notable_changes: ["fact", "interpretation"],
  top_campaigns: ["fact", "interpretation"],
  weak_campaigns: ["fact", "interpretation"],
  possible_reasons: ["interpretation"],
  funnel_observations: ["fact", "interpretation"],
  creative_observations: ["fact", "interpretation"],
  next_actions: ["recommendation"],
  data_gaps: ["fact", "interpretation"],
};

export type MarketingReport = Record<ReportSection, ReportStatement[]>;

const statementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "text", "evidence"],
  properties: {
    kind: { type: "string", enum: [...STATEMENT_KINDS] },
    text: { type: "string" },
    evidence: { type: "string", description: "For facts: the exact metric names and values from the data. Otherwise the basis, or empty." },
  },
};

export const MARKETING_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...REPORT_SECTIONS],
  properties: Object.fromEntries(REPORT_SECTIONS.map((s) => [s, { type: "array", items: statementSchema }])),
};

const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

function compactRow(r: MetricRow) {
  return {
    name: r.name ?? undefined,
    spend: round(r.spend),
    impressions: round(r.impressions),
    reach: round(r.reach),
    clicks: round(r.clicks),
    ctr_pct: round(r.ctr),
    cpc: round(r.cpc),
    cpm: round(r.cpm),
    frequency: round(r.frequency),
    purchases: round(r.purchases),
    purchase_value: round(r.purchaseValue),
    leads: round(r.leads),
    add_to_cart: round(r.addToCart),
    roas: round(r.roas),
  };
}

export interface ReportFactsInput {
  snapshot: InsightsSnapshot;
  campaignMapping: Map<string, { product: string | null; hatogStage: string | null }>;
  productRollups: MetricRow[];
  hatogRollups: MetricRow[];
}

// The exact data Claude sees (stored with the report for auditability).
export function buildReportFacts(input: ReportFactsInput) {
  const { snapshot } = input;
  const status = new Map(snapshot.campaignInfo.map((c) => [c.id, c]));
  const bySpend = (a: MetricRow, b: MetricRow) => (b.spend ?? 0) - (a.spend ?? 0);
  return {
    period: { since: snapshot.range.since, until: snapshot.range.until, currency: snapshot.currency },
    account: snapshot.account ? compactRow(snapshot.account) : null,
    previous_period_account: snapshot.previous?.account ? compactRow(snapshot.previous.account) : null,
    campaigns: [...snapshot.campaigns]
      .sort(bySpend)
      .slice(0, 30)
      .map((c) => ({
        ...compactRow(c),
        status: c.id ? (status.get(c.id)?.effectiveStatus ?? null) : null,
        objective: c.id ? (status.get(c.id)?.objective ?? null) : null,
        product: c.id ? (input.campaignMapping.get(c.id)?.product ?? null) : null,
        hatog_stage: c.id ? (input.campaignMapping.get(c.id)?.hatogStage ?? null) : null,
        previous_period: (() => {
          const prev = snapshot.previous?.campaigns.find((p) => p.id === c.id);
          return prev ? compactRow(prev) : null;
        })(),
      })),
    ads: [...snapshot.ads].sort(bySpend).slice(0, 30).map(compactRow),
    products: input.productRollups.map(compactRow),
    hatog_stages: input.hatogRollups.map(compactRow),
    notes: [
      "null means Meta did not report the metric (N/A).",
      "Reach and frequency are not additive across campaigns.",
      "Product/HATOG mapping only exists for campaigns created from this system.",
    ],
  };
}

// Every number that appears anywhere in the facts payload.
export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

function numbersIn(text: string): number[] {
  return (text.replace(/\d{4}-\d{2}-\d{2}/g, " ").match(/-?\d[\d,]*(\.\d+)?/g) ?? [])
    .map((s) => Number(s.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

// A cited number is grounded if it matches a data value (allowing rounding), or is a
// small count (<= 31), or a percent change derivable is not checked (-> interpretation).
export function isGrounded(text: string, known: number[]): boolean {
  return numbersIn(text).every((n) => {
    if (Number.isInteger(n) && Math.abs(n) <= 31) return true;
    return known.some((k) => Math.abs(k - n) <= Math.max(0.011, Math.abs(k) * 0.005));
  });
}

export function validateMarketingReport(
  value: unknown,
  facts: unknown
): { ok: true; report: MarketingReport } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Report is not an object." };
  const v = value as Record<string, unknown>;
  const known = collectNumbers(facts);
  const report = {} as MarketingReport;
  let total = 0;

  for (const section of REPORT_SECTIONS) {
    const list = v[section];
    if (!Array.isArray(list) || list.length > 12) return { ok: false, error: `Section "${section}" is invalid.` };
    report[section] = [];
    for (const raw of list) {
      const s = raw as Record<string, unknown>;
      if (!s || !(STATEMENT_KINDS as readonly unknown[]).includes(s.kind)) return { ok: false, error: "Invalid statement kind." };
      if (typeof s.text !== "string" || !s.text.trim() || s.text.length > 1200) return { ok: false, error: "Invalid statement text." };
      if (typeof s.evidence !== "string" || s.evidence.length > 1200) return { ok: false, error: "Invalid statement evidence." };
      let kind = s.kind as StatementKind;
      if (!ALLOWED_KINDS[section].includes(kind)) {
        // e.g. a "fact" in next_actions is really a recommendation; a fact in possible_reasons is an interpretation.
        kind = ALLOWED_KINDS[section][0];
      }
      const statement: ReportStatement = { kind, text: s.text.trim(), evidence: s.evidence.trim() };
      if (kind === "fact" && (!statement.evidence || !isGrounded(`${statement.text} ${statement.evidence}`, known))) {
        statement.kind = "interpretation";
        statement.unverified = true;
      }
      report[section].push(statement);
      total++;
    }
  }
  if (report.summary.length === 0) return { ok: false, error: "Report has no summary." };
  if (total > 80) return { ok: false, error: "Report is too long." };
  return { ok: true, report };
}

const SYSTEM_PROMPT = `You are Hook Marketing's senior Meta ads analyst for Bangladesh e-commerce brands (HOOK/HATOG framework: Hook, Feature, Trust, Offer, Gift).

Analyze ONLY the Meta Ads metrics provided. Label every statement:
- fact: directly stated by the data. Put the exact metric names and values you rely on in "evidence". Never round differently or compute new numbers inside a fact.
- interpretation: your analysis or a likely explanation (say it is likely/possible).
- recommendation: a suggested next action for a human to decide on.

Rules:
- Never invent metrics, campaigns, benchmarks, or results. null means N/A — call it a data gap, don't guess it.
- Do not claim causes as facts. Changes you compute (e.g. percent change) are interpretations.
- Recommendations are suggestions only; nothing is changed automatically.
- If there is no or little data (no spend), say so plainly in summary and data_gaps.
- Be concise: at most 6 statements per section.`;

export function buildReportPrompt(facts: unknown, clientName: string): { system: string; user: string } {
  return {
    system: SYSTEM_PROMPT,
    user: `Write the marketing report for ${JSON.stringify(clientName)}. Metrics data:\n${JSON.stringify(facts, null, 2)}`,
  };
}
