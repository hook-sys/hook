"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getClientById } from "@/lib/services/clients";
import { getProduct } from "@/lib/services/products";
import { createClient } from "@/lib/supabase/server";
import { inspectDriveMedia, isFalReferenceMime } from "@/lib/integrations/drive-media";
import { IntegrationError } from "@/lib/integrations/types";
import { parseAssetLocation, parseProductForm, type ProductFieldErrors } from "@/lib/validation/product";
import { PRODUCT_STATUSES, type ProductStatus } from "@/types/product";

export interface ProductFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: ProductFieldErrors;
  // Submitted values echoed back on error so React's post-action form reset doesn't wipe them.
  values?: Record<string, string>;
}

function submitted(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string") as [string, string][]
  );
}

function invalid(formData: FormData, fieldErrors: ProductFieldErrors): ProductFormState {
  return { status: "error", message: "Please correct the highlighted fields.", fieldErrors, values: submitted(formData) };
}

const UNIQUE_VIOLATION = "23505";

function productsPath(clientId: string, productId?: string) {
  return `/admin/clients/${clientId}/products${productId ? `/${productId}` : ""}`;
}

function revalidateProducts(clientId: string, productId?: string) {
  revalidatePath(productsPath(clientId));
  revalidatePath(`/admin/clients/${clientId}`);
  if (productId) revalidatePath(productsPath(clientId, productId));
}

export async function createProduct(
  clientId: string,
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  await requireSuperAdmin();
  if (!(await getClientById(clientId))) return { status: "error", message: "Client not found." };

  const { values, errors } = parseProductForm(formData);
  if (Object.keys(errors).length > 0) {
    return invalid(formData, errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ client_id: clientId, ...values })
    .select("id")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    return invalid(formData, { sku: "This SKU is already used for this client." });
  }
  if (error || !data) return { status: "error", message: "Could not create the product." };

  revalidateProducts(clientId);
  redirect(productsPath(clientId, data.id));
}

export async function updateProduct(
  clientId: string,
  productId: string,
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  await requireSuperAdmin();

  const { values, errors } = parseProductForm(formData);
  if (Object.keys(errors).length > 0) {
    return invalid(formData, errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(values)
    .eq("client_id", clientId)
    .eq("id", productId)
    .select("id");

  if (error?.code === UNIQUE_VIOLATION) {
    return invalid(formData, { sku: "This SKU is already used for this client." });
  }
  if (error) return { status: "error", message: "Could not update the product." };
  if (!data?.length) return { status: "error", message: "Product not found." };

  revalidateProducts(clientId, productId);
  return { status: "success", message: "Product updated." };
}

export async function setProductStatus(
  clientId: string,
  productId: string,
  status: ProductStatus
): Promise<ProductFormState> {
  await requireSuperAdmin();
  if (!(PRODUCT_STATUSES as readonly string[]).includes(status)) return { status: "error", message: "Invalid status." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status })
    .eq("client_id", clientId)
    .eq("id", productId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not update the product status." };

  revalidateProducts(clientId, productId);
  return { status: "success", message: status === "archived" ? "Product archived." : "Product restored." };
}

export async function deleteProduct(clientId: string, productId: string): Promise<ProductFormState> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("client_id", clientId)
    .eq("id", productId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not delete the product." };

  revalidateProducts(clientId);
  redirect(productsPath(clientId));
}

export async function addProductAsset(
  clientId: string,
  productId: string,
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  await requireSuperAdmin();
  if (!(await getProduct(clientId, productId))) return { status: "error", message: "Product not found." };

  // Google Drive is the only asset source.
  const location = parseAssetLocation(String(formData.get("location") ?? ""));
  if (!location?.driveFileId) return { status: "error", message: "Enter a Google Drive file link or file ID." };

  const label = String(formData.get("label") ?? "").trim();
  if (label.length > 200) return { status: "error", message: "Label is too long." };

  // The type comes from the file itself (image or video only), never from user input.
  let media;
  try {
    media = await inspectDriveMedia(location.driveFileId);
  } catch (error) {
    return { status: "error", message: error instanceof IntegrationError ? error.message : "Could not check the Google Drive file." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("product_assets").insert({
    product_id: productId,
    client_id: clientId,
    asset_type: media.kind,
    drive_file_id: location.driveFileId,
    url: location.url,
    mime_type: media.mimeType,
    label: label || null,
  });
  if (error) return { status: "error", message: "Could not add the asset reference." };

  revalidateProducts(clientId, productId);
  let note = "";
  if (media.kind === "image" && !isFalReferenceMime(media.mimeType)) {
    note = " This image format can't be used as a Fal.ai reference (use JPEG, PNG or WebP).";
  } else if (media.kind === "image" && !media.publiclyAccessible) {
    note = " To use it as a Fal.ai reference image, share it as “Anyone with the link” (Viewer).";
  }
  return { status: "success", message: `${media.kind === "image" ? "Image" : "Video"} added (${media.mimeType}).${note}` };
}

export async function removeProductAsset(
  clientId: string,
  productId: string,
  assetId: string
): Promise<ProductFormState> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_assets")
    .delete()
    .eq("client_id", clientId)
    .eq("product_id", productId)
    .eq("id", assetId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not remove the asset." };

  revalidateProducts(clientId, productId);
  return { status: "success", message: "Asset removed." };
}
