import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/types/lead";

const VARIANT: Record<LeadStatus, "blue" | "amber" | "green" | "red" | "slate"> = {
  new: "blue",
  contacted: "amber",
  qualified: "green",
  converted: "green",
  not_interested: "red",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={VARIANT[status]}>{LEAD_STATUS_LABELS[status]}</Badge>;
}
