import { toggleClientStatus } from "@/lib/actions/clients";
import type { ClientStatus } from "@/types/client";

export function ClientStatusToggleForm({
  clientId,
  status,
}: {
  clientId: string;
  status: ClientStatus;
}) {
  const nextLabel = status === "active" ? "Pause" : "Activate";

  return (
    <form action={toggleClientStatus}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="current_status" value={status} />
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {nextLabel}
      </button>
    </form>
  );
}
