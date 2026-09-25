import Link from "next/link";
import { ClientStatusBadge } from "@/components/admin/ClientStatusBadge";
import { ClientStatusToggleForm } from "@/components/admin/ClientStatusToggleForm";
import type { Client } from "@/types/client";

export function ClientsTable({ clients, readOnly = false }: { clients: Client[]; readOnly?: boolean }) {
  if (clients.length === 0) {
    return <div className="p-10 text-center text-sm text-slate-500">No clients yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Business Name</th>
            <th className="px-5 py-3">Website</th>
            <th className="px-5 py-3">Phone</th>
            <th className="px-5 py-3">Facebook Page</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {clients.map((client) => (
            <tr key={client.id} className="hover:bg-slate-50">
              <td className="px-5 py-3 font-medium text-slate-900">
                <Link href={`/admin/clients/${client.id}`} className="hover:underline">
                  {client.business_name}
                </Link>
              </td>
              <td className="px-5 py-3 text-slate-600">
                {client.website ? (
                  <a
                    href={client.website}
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
              <td className="px-5 py-3 text-slate-600">{client.phone || <span className="text-slate-300">—</span>}</td>
              <td className="px-5 py-3 text-slate-600">
                {client.facebook_page_url ? (
                  <a
                    href={client.facebook_page_url}
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
                <ClientStatusBadge status={client.status} />
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="font-medium text-brand-blue hover:underline"
                  >
                    View
                  </Link>
                  {!readOnly && <ClientStatusToggleForm clientId={client.id} status={client.status} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
