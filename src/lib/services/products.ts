import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import type { Product, ProductAsset, ProductStatus } from "@/types/product";

// All queries run with the caller's session: RLS limits sub-admins to assigned clients,
// and every product lookup is also scoped by client_id so IDs can't be mixed across clients.

function normalize(row: Product): Product {
  return {
    ...row,
    price: row.price === null ? null : Number(row.price),
    discount_price: row.discount_price === null ? null : Number(row.discount_price),
  };
}

export async function listProducts(
  clientId: string,
  filters: { search?: string; status?: ProductStatus | "all" } = {}
): Promise<Product[]> {
  const supabase = await createClient();
  let query = supabase.from("products").select("*").eq("client_id", clientId).order("name");

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.search) {
    const term = filters.search.replace(/[%_,()]/g, "");
    if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,category.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Product[]).map(normalize);
}

export async function getProduct(clientId: string, productId: string): Promise<Product | null> {
  if (!isUuid(clientId) || !isUuid(productId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", productId)
    .maybeSingle();
  return data ? normalize(data as Product) : null;
}

export async function listProductAssets(clientId: string, productId: string): Promise<ProductAsset[]> {
  if (!isUuid(clientId) || !isUuid(productId)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_assets")
    .select("*")
    .eq("client_id", clientId)
    .eq("product_id", productId)
    .order("created_at");
  return (data ?? []) as ProductAsset[];
}

export async function listClientImageAssets(clientId: string): Promise<ProductAsset[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_assets")
    .select("*")
    .eq("client_id", clientId)
    .eq("asset_type", "image")
    .order("created_at");
  return (data ?? []) as ProductAsset[];
}
