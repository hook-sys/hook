import { Badge } from "@/components/ui/badge";
import { REPORT_SECTIONS, REPORT_SECTION_LABELS, type MarketingReport, type StatementKind } from "@/lib/ai/marketing-report";

const KIND_STYLE: Record<StatementKind, { label: string; variant: "green" | "blue" | "amber" }> = {
  fact: { label: "FACT", variant: "green" },
  interpretation: { label: "INTERPRETATION", variant: "blue" },
  recommendation: { label: "RECOMMENDATION", variant: "amber" },
};

export function ReportView({ report }: { report: MarketingReport }) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        FACT = verified against the retrieved Meta metrics · INTERPRETATION = AI analysis · RECOMMENDATION = suggested action (nothing is
        changed automatically).
      </p>
      {REPORT_SECTIONS.map((section) =>
        report[section]?.length ? (
          <section key={section}>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">{REPORT_SECTION_LABELS[section]}</h3>
            <ul className="space-y-2">
              {report[section].map((s, i) => (
                <li key={i} className="rounded-md border border-slate-100 p-3 text-sm text-slate-700">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_STYLE[s.kind].variant}>{KIND_STYLE[s.kind].label}</Badge>
                    {s.unverified && <Badge variant="red">Unverified number</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap">{s.text}</p>
                  {s.evidence && <p className="mt-1 text-xs text-slate-500">Evidence: {s.evidence}</p>}
                </li>
              ))}
            </ul>
          </section>
        ) : null
      )}
    </div>
  );
}
