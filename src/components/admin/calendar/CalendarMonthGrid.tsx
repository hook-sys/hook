import Link from "next/link";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS } from "@/lib/ai/content-calendar";
import type { ContentCalendarItem } from "@/lib/services/content-calendar";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_DOT: Record<string, string> = {
  draft: "bg-slate-400",
  approved: "bg-blue-500",
  scheduled: "bg-amber-500",
  published: "bg-emerald-500",
  failed: "bg-red-500",
  archived: "bg-slate-300",
};

function monthsSpanned(items: ContentCalendarItem[]): string[] {
  const months = new Set(items.map((i) => i.scheduled_date.slice(0, 7)));
  return [...months].sort();
}

// Month grids (Mon-Sun) with each day's items; items link to their detail page.
export function CalendarMonthGrid({ items, basePath }: { items: ContentCalendarItem[]; basePath: string }) {
  const byDate = new Map<string, ContentCalendarItem[]>();
  for (const item of items) byDate.set(item.scheduled_date, [...(byDate.get(item.scheduled_date) ?? []), item]);

  return (
    <div className="space-y-8">
      {monthsSpanned(items).map((month) => {
        const first = new Date(`${month}-01T00:00:00Z`);
        const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
        const leading = (first.getUTCDay() + 6) % 7; // Monday-first
        const cells: (string | null)[] = [
          ...Array.from({ length: leading }, () => null),
          ...Array.from({ length: daysInMonth }, (_, d) => `${month}-${String(d + 1).padStart(2, "0")}`),
        ];
        return (
          <section key={month}>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              {first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
            </h3>
            <div className="overflow-x-auto">
              <div className="grid min-w-[760px] grid-cols-7 gap-px rounded-md border border-slate-200 bg-slate-200 text-xs">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="bg-slate-50 px-2 py-1 font-semibold text-slate-500">
                    {d}
                  </div>
                ))}
                {cells.map((date, i) => (
                  <div key={date ?? `pad-${i}`} className={cn("min-h-24 bg-white p-1.5", !date && "bg-slate-50")}>
                    {date && (
                      <>
                        <p className="mb-1 text-[11px] font-medium text-slate-400">{Number(date.slice(8))}</p>
                        <ul className="space-y-1">
                          {(byDate.get(date) ?? []).map((item) => (
                            <li key={item.id}>
                              <Link
                                href={`${basePath}/${item.id}`}
                                className="block rounded border border-slate-200 px-1.5 py-1 hover:border-brand-blue hover:bg-blue-50"
                              >
                                <span className="flex items-center gap-1">
                                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[item.status])} />
                                  <span className="truncate font-medium text-slate-700">{CONTENT_TYPE_LABELS[item.content_type]}</span>
                                </span>
                                <span className="block truncate text-slate-500">
                                  {PLATFORM_LABELS[item.platform]} · {item.hook}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
