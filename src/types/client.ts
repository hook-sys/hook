import type { ClientSubfolderKey } from "@/lib/integrations/drive-folders";

export const CLIENT_STATUSES =["active", "paused", "archived"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export interface Client {
  id: string;
  business_name: string;
  website: string | null;
  phone: string | null;
  facebook_page_url: string | null;
  status: ClientStatus;
  drive_folder_id: string | null;
  drive_subfolder_ids: Partial<Record<ClientSubfolderKey, string>>;
  drive_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

