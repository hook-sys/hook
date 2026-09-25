import { Badge } from "@/components/ui/badge";
import { CREATIVE_STATUS_LABELS, type CreativeStatus } from "@/lib/creative/options";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/creative/status";

const CREATIVE_VARIANTS = { generating: "blue", ready: "green", failed: "red", archived: "slate" } as const;

export function CreativeStatusBadge({ status }: { status: CreativeStatus }) {
  return <Badge variant={CREATIVE_VARIANTS[status]}>{CREATIVE_STATUS_LABELS[status]}</Badge>;
}

const CAMPAIGN_VARIANTS = {
  draft: "slate",
  ready_for_review: "amber",
  approved: "blue",
  published: "green",
  paused: "amber",
  archived: "slate",
} as const;

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge variant={CAMPAIGN_VARIANTS[status]}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>;
}
