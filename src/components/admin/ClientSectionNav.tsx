"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ClientSectionNav({
  clientName,
  basePath,
  sections,
}: {
  clientName: string;
  basePath: string;
  sections: { label: string; path: string }[];
}) {
  const pathname = usePathname();
  const active = (path: string) =>
    path === "" ? pathname === basePath : pathname === `${basePath}${path}` || pathname.startsWith(`${basePath}${path}/`);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{clientName}</p>
      <nav aria-label="Client sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex min-w-max gap-1 border-b border-slate-200">
          {sections.map((s) => (
            <li key={s.path}>
              <Link
                href={`${basePath}${s.path}`}
                aria-current={active(s.path) ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2 text-sm font-medium",
                  active(s.path)
                    ? "border-brand-blue text-brand-blue"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                )}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
