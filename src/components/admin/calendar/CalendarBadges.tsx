import { Badge } from "@/components/ui/badge";
import { CONTENT_ITEM_STATUS_LABELS, type ContentItemStatus } from "@/lib/ai/content-calendar";

const VARIANTS = {
  draft: "slate",
  approved: "blue",
  scheduled: "amber",
  published: "green",
  failed: "red",
  archived: "slate",
} as const;

export function ContentStatusBadge({ status }: { status: ContentItemStatus }) {
  return <Badge variant={VARIANTS[status]}>{CONTENT_ITEM_STATUS_LABELS[status]}</Badge>;
}
