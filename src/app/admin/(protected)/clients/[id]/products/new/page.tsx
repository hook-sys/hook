import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ProductForm } from "@/components/admin/products/ProductForm";
import { createProduct } from "@/lib/actions/products";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getClientById } from "@/lib/services/clients";

export default async function NewProductPage({ params }: PageProps<"/admin/clients/[id]/products/new">) {
  await requireSuperAdmin();
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/admin/clients/${client.id}/products`} className="text-sm text-brand-blue hover:underline">
          &larr; {client.business_name} products
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Add Product</h1>
      </div>
      <Card>
        <CardContent className="py-6">
          <ProductForm action={createProduct.bind(null, client.id)} submitLabel="Create Product" pendingLabel="Creating..." />
        </CardContent>
      </Card>
    </div>
  );
}
