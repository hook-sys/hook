import { Badge } from "@/components/ui/badge";
import { CLIENT_STATUS_LABELS, type ClientStatus } from "@/types/client";

const VARIANT: Record<ClientStatus, "green" | "amber" | "slate"> = {
  active: "green",
  paused: "amber",
  archived: "slate",
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <Badge variant={VARIANT[status]}>{CLIENT_STATUS_LABELS[status]}</Badge>;
}
