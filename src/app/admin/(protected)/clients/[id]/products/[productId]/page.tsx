import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/admin/ActionButton";
import { ProductAssetsSection } from "@/components/admin/products/ProductAssetsSection";
import { ProductDetails } from "@/components/admin/products/ProductDetails";
import { ProductForm } from "@/components/admin/products/ProductForm";
import { ProductStatusBadge } from "@/components/admin/products/ProductStatusBadge";
import { deleteProduct, setProductStatus, updateProduct } from "@/lib/actions/products";
import { requirePermission } from "@/lib/auth/session";
import { getClientById } from "@/lib/services/clients";
import { getProduct, listProductAssets } from "@/lib/services/products";

export default async function ProductDetailPage({ params }: PageProps<"/admin/clients/[id]/products/[productId]">) {
  const profile = await requirePermission("clients");
  const isSuperAdmin = profile.role === "admin";
  const { id, productId } = await params;

  const client = await getClientById(id);
  if (!client) notFound();
  // Scoped by client_id: a product ID from another client 404s even for super admins.
  const product = await getProduct(client.id, productId);
  if (!product) notFound();
  const assets = await listProductAssets(client.id, product.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/admin/clients/${client.id}/products`} className="text-sm text-brand-blue hover:underline">
            &larr; {client.business_name} products
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
            <ProductStatusBadge status={product.status} />
          </div>
        </div>
        {isSuperAdmin && (
          <div className="flex flex-wrap items-start gap-2">
            <Link
              href={`/admin/clients/${client.id}/knowledge?product=${product.id}#ai-context`}
              className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Preview AI Context
            </Link>
            {product.status === "archived" ? (
              <ActionButton
                action={setProductStatus.bind(null, client.id, product.id, "draft")}
                label="Restore to Draft"
                pendingLabel="Restoring..."
              />
            ) : (
              <ActionButton
                action={setProductStatus.bind(null, client.id, product.id, "archived")}
                label="Archive"
                pendingLabel="Archiving..."
              />
            )}
            <ActionButton
              action={deleteProduct.bind(null, client.id, product.id)}
              label="Delete"
              pendingLabel="Deleting..."
              variant="ghost"
              confirmMessage={`Permanently delete "${product.name}" and its asset references? Files in Drive are not affected.`}
            />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{isSuperAdmin ? "Edit Product" : "Product Information"}</CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            {isSuperAdmin ? (
              <ProductForm
                action={updateProduct.bind(null, client.id, product.id)}
                product={product}
                submitLabel="Save Changes"
                pendingLabel="Saving..."
              />
            ) : (
              <ProductDetails product={product} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <ProductAssetsSection client={client} productId={product.id} assets={assets} isSuperAdmin={isSuperAdmin} />
        </div>
      </div>
    </div>
  );
}
