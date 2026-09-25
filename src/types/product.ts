export const PRODUCT_STATUSES = ["active", "draft", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

export const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR", "AED", "SAR"] as const;

// Google Drive is the only asset source, and only images/videos are allowed.
export const PRODUCT_ASSET_TYPES = ["image", "video"] as const;
export type ProductAssetType = (typeof PRODUCT_ASSET_TYPES)[number];

export const PRODUCT_ASSET_TYPE_LABELS: Record<ProductAssetType, string> = {
  image: "Image",
  video: "Video",
};

export interface Product {
  id: string;
  client_id: string;
  name: string;
  sku: string | null;
  product_url: string | null;
  short_description: string | null;
  full_description: string | null;
  price: number | null;
  discount_price: number | null;
  currency: string;
  features: string[];
  benefits: string[];
  target_customer: string | null;
  category: string | null;
  status: ProductStatus;
  brand_name: string | null;
  brand_colors: string[];
  cta: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductAsset {
  id: string;
  product_id: string;
  client_id: string;
  asset_type: ProductAssetType;
  drive_file_id: string | null;
  url: string | null;
  label: string | null;
  // Verified from Google Drive when the asset was added (image/* or video/*).
  mime_type: string | null;
  created_at: string;
}
