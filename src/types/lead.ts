export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "not_interested",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  not_interested: "Not Interested",
};

export interface Lead {
  id: string;
  business_name: string;
  mobile: string;
  facebook_page_url: string | null;
  website_url: string | null;
  current_situation: string;
  status: LeadStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}
