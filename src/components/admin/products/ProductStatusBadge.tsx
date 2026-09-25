import { Badge } from "@/components/ui/badge";
import { PRODUCT_STATUS_LABELS, type ProductStatus } from "@/types/product";

const VARIANT: Record<ProductStatus, "green" | "amber" | "slate"> = {
  active: "green",
  draft: "amber",
  archived: "slate",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={VARIANT[status]}>{PRODUCT_STATUS_LABELS[status]}</Badge>;
}

export function formatPrice(value: number | null, currency: string): string | null {
  if (value === null) return null;
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
