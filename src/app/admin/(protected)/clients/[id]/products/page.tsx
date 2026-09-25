import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPrice, ProductStatusBadge } from "@/components/admin/products/ProductStatusBadge";
import { requirePermission } from "@/lib/auth/session";
import { getClientById } from "@/lib/services/clients";
import { listProducts } from "@/lib/services/products";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, type ProductStatus } from "@/types/product";

export default async function ClientProductsPage({ params, searchParams }: PageProps<"/admin/clients/[id]/products">) {
  const profile = await requirePermission("clients");
  const isSuperAdmin = profile.role === "admin";
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const query = await searchParams;
  const search = typeof query.search === "string" ? query.search.slice(0, 100) : "";
  const status =
    typeof query.status === "string" && (PRODUCT_STATUSES as readonly string[]).includes(query.status)
      ? (query.status as ProductStatus)
      : "all";
  const products = await listProducts(client.id, { search, status });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/admin/clients/${client.id}`} className="text-sm text-brand-blue hover:underline">
            &larr; {client.business_name}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Products</h1>
        </div>
        {isSuperAdmin && (
          <Link href={`/admin/clients/${client.id}/products/new`}>
            <Button>Add Product</Button>
          </Link>
        )}
      </div>

      <Card>
        <form method="get" className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="search" className="mb-1.5 block text-sm font-medium text-slate-700">Search</label>
            <Input id="search" name="search" defaultValue={search} placeholder="Name, SKU or category" />
          </div>
          <div className="sm:w-48">
            <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
            <Select id="status" name="status" defaultValue={status}>
              <option value="all">All statuses</option>
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PRODUCT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>

        {products.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {search || status !== "all" ? "No products match these filters." : "No products yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/clients/${client.id}/products/${p.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.sku ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{p.category ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.discount_price !== null ? (
                        <>
                          {formatPrice(p.discount_price, p.currency)}{" "}
                          <span className="text-xs text-slate-400 line-through">{formatPrice(p.price, p.currency)}</span>
                        </>
                      ) : (
                        (formatPrice(p.price, p.currency) ?? "—")
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <ProductStatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
