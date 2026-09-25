import Link from "next/link";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import type { Lead } from "@/types/lead";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function LeadsTable({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return <div className="p-10 text-center text-sm text-slate-500">No leads found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Business Name</th>
            <th className="px-5 py-3">Mobile</th>
            <th className="px-5 py-3">Facebook Page</th>
            <th className="px-5 py-3">Website</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Created At</th>
            <th className="px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-slate-50">
              <td className="px-5 py-3 font-medium text-slate-900">{lead.business_name}</td>
              <td className="px-5 py-3 text-slate-600">{lead.mobile}</td>
              <td className="px-5 py-3 text-slate-600">
                {lead.facebook_page_url ? (
                  <a
                    href={lead.facebook_page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue hover:underline"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-5 py-3 text-slate-600">
                {lead.website_url ? (
                  <a
                    href={lead.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue hover:underline"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-5 py-3">
                <LeadStatusBadge status={lead.status} />
              </td>
              <td className="px-5 py-3 text-slate-600">{formatDate(lead.created_at)}</td>
              <td className="px-5 py-3">
                <Link
                  href={`/admin/leads/${lead.id}`}
                  className="font-medium text-brand-blue hover:underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
