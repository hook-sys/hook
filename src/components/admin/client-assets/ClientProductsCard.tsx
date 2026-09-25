import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductStatusBadge } from "@/components/admin/products/ProductStatusBadge";
import { listProducts } from "@/lib/services/products";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS } from "@/types/product";

export async function ClientProductsCard({ clientId, isSuperAdmin }: { clientId: string; isSuperAdmin: boolean }) {
  const products = await listProducts(clientId);
  const recent = products.filter((p) => p.status !== "archived").slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle>Products</CardTitle>
        <div className="flex items-center gap-3 text-sm">
          {isSuperAdmin && (
            <Link href={`/admin/clients/${clientId}/products/new`} className="font-medium text-brand-blue hover:underline">
              Add
            </Link>
          )}
          <Link href={`/admin/clients/${clientId}/products`} className="font-medium text-brand-blue hover:underline">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          {PRODUCT_STATUSES.map((s) => `${products.filter((p) => p.status === s).length} ${PRODUCT_STATUS_LABELS[s].toLowerCase()}`).join(" · ")}
        </p>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No active or draft products.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/admin/clients/${clientId}/products/${p.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                  {p.name}
                </Link>
                <ProductStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
