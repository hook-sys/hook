import type { ReactNode } from "react";
import { formatPrice } from "@/components/admin/products/ProductStatusBadge";
import type { Product } from "@/types/product";

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
        {children || <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function ProductDetails({ product }: { product: Product }) {
  return (
    <dl className="grid gap-5 sm:grid-cols-2">
      <Item label="SKU / Product Code">{product.sku}</Item>
      <Item label="Category">{product.category}</Item>
      <Item label="Price">{formatPrice(product.price, product.currency)}</Item>
      <Item label="Discount Price">{formatPrice(product.discount_price, product.currency)}</Item>
      <Item label="Product URL" wide>
        {product.product_url && (
          <a href={product.product_url} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">
            {product.product_url}
          </a>
        )}
      </Item>
      <Item label="Short Description" wide>{product.short_description}</Item>
      <Item label="Full Description" wide>{product.full_description}</Item>
      <Item label="Features"><List items={product.features} /></Item>
      <Item label="Benefits"><List items={product.benefits} /></Item>
      <Item label="Target Customer" wide>{product.target_customer}</Item>
      <Item label="Brand Name">{product.brand_name}</Item>
      <Item label="Brand Colors">{product.brand_colors.join(", ")}</Item>
      <Item label="CTA" wide>{product.cta}</Item>
      <Item label="Notes" wide>{product.notes}</Item>
    </dl>
  );
}
