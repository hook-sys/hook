import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/admin/KpiCard";
import { LeadsTable } from "@/components/admin/LeadsTable";
import { ClientStatusBadge } from "@/components/admin/ClientStatusBadge";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { getLeadStats, getRecentLeads } from "@/lib/services/leads";
import { listClients } from "@/lib/services/clients";

export default async function AdminDashboardPage() {
  const profile = await requirePermission("dashboard");
  const canViewLeads = hasPermission(profile, "leads");
  const canOpenClients = hasPermission(profile, "clients");
  const isSubAdmin = profile.role === "sub_admin";

  const [stats, recentLeads, assignedClients] = await Promise.all([
    canViewLeads ? getLeadStats() : null,
    canViewLeads ? getRecentLeads(5) : null,
    isSubAdmin ? listClients() : null,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Overview of business applications.</p>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total Leads" value={stats.total} />
          <KpiCard label="New Leads" value={stats.new} />
          <KpiCard label="Qualified Leads" value={stats.qualified} />
          <KpiCard label="Converted Leads" value={stats.converted} />
        </div>
      )}

      {assignedClients && (
        <Card>
          <CardHeader>
            <CardTitle>Your Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {assignedClients.length === 0 ? (
              <p className="text-sm text-slate-500">No clients are assigned to you yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {assignedClients.map((client) => (
                  <li key={client.id} className="flex items-center justify-between py-2">
                    {canOpenClients ? (
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="text-sm font-medium text-brand-blue hover:underline"
                      >
                        {client.business_name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-slate-900">
                        {client.business_name}
                      </span>
                    )}
                    <ClientStatusBadge status={client.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {recentLeads && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent Leads</CardTitle>
            <Link href="/admin/leads" className="text-sm text-brand-blue hover:underline">
              View all
            </Link>
          </CardHeader>
          <LeadsTable leads={recentLeads} />
        </Card>
      )}
    </div>
  );
}
