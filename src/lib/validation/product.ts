import { CURRENCIES, PRODUCT_ASSET_TYPES, PRODUCT_STATUSES, type ProductAssetType, type ProductStatus } from "@/types/product";

export interface ProductValues {
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
}

export type ProductFieldErrors = Partial<Record<keyof ProductValues, string>>;

const URL_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optional(value: string): string | null {
  return value || null;
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function parseProductForm(formData: FormData): { values: ProductValues; errors: ProductFieldErrors } {
  const errors: ProductFieldErrors = {};
  const raw = {
    name: text(formData, "name"),
    sku: text(formData, "sku"),
    product_url: text(formData, "product_url"),
    short_description: text(formData, "short_description"),
    full_description: text(formData, "full_description"),
    price: text(formData, "price"),
    discount_price: text(formData, "discount_price"),
    currency: text(formData, "currency") || "BDT",
    features: lines(text(formData, "features")),
    benefits: lines(text(formData, "benefits")),
    target_customer: text(formData, "target_customer"),
    category: text(formData, "category"),
    status: text(formData, "status") || "draft",
    brand_name: text(formData, "brand_name"),
    brand_colors: text(formData, "brand_colors")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    cta: text(formData, "cta"),
    notes: text(formData, "notes"),
  };

  if (!raw.name) errors.name = "Enter the product name.";
  else if (raw.name.length > 200) errors.name = "Product name is too long.";

  if (raw.sku.length > 100) errors.sku = "SKU is too long.";
  if (raw.product_url && (!URL_PATTERN.test(raw.product_url) || raw.product_url.length > 2000)) {
    errors.product_url = "Enter a valid URL (starting with http:// or https://).";
  }
  if (raw.short_description.length > 500) errors.short_description = "Keep the short description under 500 characters.";
  if (raw.full_description.length > 10000) errors.full_description = "Full description is too long.";

  const price = raw.price ? Number(raw.price) : null;
  const discount = raw.discount_price ? Number(raw.discount_price) : null;
  if (raw.price && !MONEY_PATTERN.test(raw.price)) errors.price = "Enter a valid price (e.g. 1250 or 1250.50).";
  if (raw.discount_price && !MONEY_PATTERN.test(raw.discount_price)) {
    errors.discount_price = "Enter a valid discount price.";
  } else if (discount !== null && price !== null && !errors.price && discount > price) {
    errors.discount_price = "Discount price can't be higher than the price.";
  }

  if (!(CURRENCIES as readonly string[]).includes(raw.currency)) errors.currency = "Select a currency.";
  if (raw.features.length > 30 || raw.features.some((f) => f.length > 300)) {
    errors.features = "Up to 30 features, each under 300 characters.";
  }
  if (raw.benefits.length > 30 || raw.benefits.some((b) => b.length > 300)) {
    errors.benefits = "Up to 30 benefits, each under 300 characters.";
  }
  if (raw.target_customer.length > 2000) errors.target_customer = "Target customer is too long.";
  if (raw.category.length > 100) errors.category = "Category is too long.";
  if (!(PRODUCT_STATUSES as readonly string[]).includes(raw.status)) errors.status = "Select a status.";
  if (raw.brand_name.length > 200) errors.brand_name = "Brand name is too long.";
  if (raw.brand_colors.length > 10 || raw.brand_colors.some((c) => c.length > 30)) {
    errors.brand_colors = "Up to 10 colors, comma-separated (e.g. #0B1220, Red).";
  }
  if (raw.cta.length > 200) errors.cta = "CTA is too long.";
  if (raw.notes.length > 5000) errors.notes = "Notes are too long.";

  return {
    errors,
    values: {
      name: raw.name,
      sku: optional(raw.sku),
      product_url: optional(raw.product_url),
      short_description: optional(raw.short_description),
      full_description: optional(raw.full_description),
      price,
      discount_price: discount,
      currency: raw.currency,
      features: raw.features,
      benefits: raw.benefits,
      target_customer: optional(raw.target_customer),
      category: optional(raw.category),
      status: raw.status as ProductStatus,
      brand_name: optional(raw.brand_name),
      brand_colors: raw.brand_colors,
      cta: optional(raw.cta),
      notes: optional(raw.notes),
    },
  };
}

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

// Accepts a Google Drive share link, a raw Drive file ID, or any other https URL.
// Returns what gets stored: the Drive file ID (when it is a Drive file) and a canonical URL.
export function parseAssetLocation(input: string): { driveFileId: string | null; url: string } | null {
  const value = input.trim();
  if (!value || value.length > 2000) return null;

  if (DRIVE_ID.test(value)) {
    return { driveFileId: value, url: `https://drive.google.com/file/d/${value}/view` };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();
  if (host === "drive.google.com" || host === "docs.google.com") {
    const fromPath = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]{10,200})/)?.[1];
    const fromQuery = parsed.searchParams.get("id");
    const id = fromPath ?? (fromQuery && DRIVE_ID.test(fromQuery) ? fromQuery : null);
    if (!id) return null;
    return { driveFileId: id, url: `https://drive.google.com/file/d/${id}/view` };
  }

  return { driveFileId: null, url: parsed.toString() };
}

export function isProductAssetType(value: string): value is ProductAssetType {
  return (PRODUCT_ASSET_TYPES as readonly string[]).includes(value);
}
