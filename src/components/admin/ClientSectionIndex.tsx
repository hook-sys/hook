import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { Client } from "@/types/client";

// Client-scoped features are entered per client; this lists the clients the caller can see
// (RLS: all for super admins, assigned ones for sub-admins).
export function ClientSectionIndex({
  title,
  description,
  clients,
  section,
  linkLabel,
}: {
  title: string;
  description: string;
  clients: Client[];
  section: "creative-studio" | "campaigns" | "content-calendar" | "audiences" | "analytics" | "ai-agent";
  linkLabel: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <Card>
        {clients.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No clients available.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-sm font-medium text-slate-900">{c.business_name}</span>
                <Link href={`/admin/clients/${c.id}/${section}`} className="text-sm font-medium text-brand-blue hover:underline">
                  {linkLabel} &rarr;
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
