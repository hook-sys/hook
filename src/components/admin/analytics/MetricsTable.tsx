import { formatMetric, type MetricRow } from "@/lib/meta/insights";

type Column = { key: keyof MetricRow; label: string; kind: "money" | "int" | "pct" | "ratio" | "dec" };

export const PERFORMANCE_COLUMNS: Column[] = [
  { key: "spend", label: "Spend", kind: "money" },
  { key: "impressions", label: "Impr.", kind: "int" },
  { key: "reach", label: "Reach", kind: "int" },
  { key: "clicks", label: "Clicks", kind: "int" },
  { key: "ctr", label: "CTR", kind: "pct" },
  { key: "cpc", label: "CPC", kind: "money" },
  { key: "cpm", label: "CPM", kind: "money" },
  { key: "frequency", label: "Freq.", kind: "dec" },
  { key: "conversions", label: "Conv.", kind: "int" },
  { key: "purchases", label: "Purchases", kind: "int" },
  { key: "leads", label: "Leads", kind: "int" },
  { key: "purchaseValue", label: "Conv. Value", kind: "money" },
  { key: "roas", label: "ROAS", kind: "ratio" },
];

export function MetricsTable({
  rows,
  currency,
  nameLabel,
  extra,
  columns = PERFORMANCE_COLUMNS,
  empty = "No data for this period.",
}: {
  rows: MetricRow[];
  currency: string | null;
  nameLabel: string;
  extra?: { label: string; value: (row: MetricRow) => string };
  columns?: Column[];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="p-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="border-b border-slate-100 bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">{nameLabel}</th>
            {extra && <th className="px-3 py-2">{extra.label}</th>}
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={row.id ?? `${row.name}-${i}`}>
              <td className="max-w-[240px] truncate px-3 py-2 font-medium text-slate-800">{row.name ?? "—"}</td>
              {extra && <td className="px-3 py-2 text-slate-600">{extra.value(row)}</td>}
              {columns.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                  {formatMetric(row[c.key] as number | null, c.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {currency && <p className="px-3 py-2 text-[11px] text-slate-400">Amounts in {currency}. N/A = not reported by Meta or not calculable.</p>}
    </div>
  );
}
