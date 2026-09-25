import { Card } from "@/components/ui/card";
import { LeadFilters } from "@/components/admin/LeadFilters";
import { LeadsTable } from "@/components/admin/LeadsTable";
import { Pagination } from "@/components/admin/Pagination";
import { requirePermission } from "@/lib/auth/session";
import { listLeads } from "@/lib/services/leads";
import type { LeadStatus } from "@/types/lead";
import { LEAD_STATUSES } from "@/types/lead";

function parseStatus(value: string | undefined): LeadStatus | "all" {
  if (value && (LEAD_STATUSES as readonly string[]).includes(value)) {
    return value as LeadStatus;
  }
  return "all";
}

export default async function AdminLeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  await requirePermission("leads");
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : "";
  const status = parseStatus(typeof params.status === "string" ? params.status : undefined);
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { leads, total, pageSize } = await listLeads({ search, status, page });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          Business applications submitted from the landing page.
        </p>
      </div>

      <Card>
        <div className="border-b border-slate-100 p-5">
          <LeadFilters search={search} status={status} />
        </div>
        <LeadsTable leads={leads} />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          params={{ search, status }}
        />
      </Card>
    </div>
  );
}
