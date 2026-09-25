import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { LeadStatusForm } from "@/components/admin/LeadStatusForm";
import { LeadNoteForm } from "@/components/admin/LeadNoteForm";
import { requirePermission } from "@/lib/auth/session";
import { getLeadById } from "@/lib/services/leads";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function LeadDetailPage({ params }: PageProps<"/admin/leads/[id]">) {
  await requirePermission("leads");
  const { id } = await params;
  const lead = await getLeadById(id);

  if (!lead) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/leads" className="text-sm text-brand-blue hover:underline">
            &larr; Back to Leads
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{lead.business_name}</h1>
        </div>
        <LeadStatusBadge status={lead.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Mobile Number
                </dt>
                <dd className="mt-1 text-sm text-slate-900">{lead.mobile}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Submitted
                </dt>
                <dd className="mt-1 text-sm text-slate-900">{formatDateTime(lead.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Facebook Page
                </dt>
                <dd className="mt-1 text-sm">
                  {lead.facebook_page_url ? (
                    <a
                      href={lead.facebook_page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-blue hover:underline"
                    >
                      {lead.facebook_page_url}
                    </a>
                  ) : (
                    <span className="text-slate-400">Not provided</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Website
                </dt>
                <dd className="mt-1 text-sm">
                  {lead.website_url ? (
                    <a
                      href={lead.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-blue hover:underline"
                    >
                      {lead.website_url}
                    </a>
                  ) : (
                    <span className="text-slate-400">Not provided</span>
                  )}
                </dd>
              </div>
            </dl>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Current Business Situation
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {lead.current_situation}
              </dd>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadStatusForm leadId={lead.id} status={lead.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin Note</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadNoteForm leadId={lead.id} note={lead.admin_note} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
