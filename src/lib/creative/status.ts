import type { CreativeStatus } from "@/lib/creative/options";

// Mirrors the DB triggers in 0007 (which remain the source of truth) so the UI and actions
// can explain a blocked change before hitting the database.

const CREATIVE_TRANSITIONS: Record<CreativeStatus, readonly CreativeStatus[]> = {
  generating: ["ready", "failed"],
  ready: ["archived"],
  failed: ["archived"],
  archived: [],
};

export function canTransitionCreative(from: CreativeStatus, to: CreativeStatus): boolean {
  return CREATIVE_TRANSITIONS[from].includes(to);
}

export const CAMPAIGN_STATUSES = ["draft", "ready_for_review", "approved", "published", "paused", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready for Review",
  approved: "Approved",
  published: "Published",
  paused: "Paused",
  archived: "Archived",
};

const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["ready_for_review", "archived"],
  ready_for_review: ["draft", "approved", "archived"],
  approved: ["draft", "published", "archived"],
  published: ["paused"],
  paused: ["published", "archived"],
  archived: ["draft"],
};

// Sub-admins may only move drafts into/out of review. "published"/"paused" are set only by
// the Meta publisher after Meta returns real IDs — never by a manual status change.
const SUB_ADMIN_TRANSITIONS: readonly [CampaignStatus, CampaignStatus][] = [
  ["draft", "ready_for_review"],
  ["ready_for_review", "draft"],
];

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus, role: "admin" | "sub_admin"): boolean {
  if (to === "published" || to === "paused") return false;
  if (!CAMPAIGN_TRANSITIONS[from].includes(to)) return false;
  return role === "admin" || SUB_ADMIN_TRANSITIONS.some(([f, t]) => f === from && t === to);
}
