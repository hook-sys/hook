"use client";

import { useActionState, type ReactNode } from "react";
import type { ProductFormState } from "@/lib/actions/products";
import type { ProductValues } from "@/lib/validation/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, type Product } from "@/types/product";

type ProductAction = (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;

const initialState: ProductFormState = { status: "idle" };

function Field({
  name,
  label,
  error,
  hint,
  children,
  className,
}: {
  name: keyof ProductValues;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ProductForm({
  action,
  product,
  submitLabel,
  pendingLabel,
}: {
  action: ProductAction;
  product?: Product;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const e = state.fieldErrors ?? {};
  const v = (name: string, saved: string | number | null | undefined) =>
    state.values?.[name] ?? (saved === null || saved === undefined ? "" : String(saved));

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <Section title="Basics">
        <Field name="name" label="Product Name *" error={e.name}>
          <Input id="name" name="name" required maxLength={200} defaultValue={v("name", product?.name)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="sku" label="SKU / Product Code" error={e.sku}>
            <Input id="sku" name="sku" maxLength={100} defaultValue={v("sku", product?.sku)} />
          </Field>
          <Field name="category" label="Product Category" error={e.category}>
            <Input id="category" name="category" maxLength={100} defaultValue={v("category", product?.category)} />
          </Field>
          <Field name="status" label="Product Status" error={e.status}>
            <Select id="status" name="status" defaultValue={v("status", product?.status ?? "draft")}>
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PRODUCT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field name="product_url" label="Product URL" error={e.product_url}>
          <Input id="product_url" name="product_url" type="url" placeholder="https://" defaultValue={v("product_url", product?.product_url)} />
        </Field>
      </Section>

      <Section title="Description">
        <Field name="short_description" label="Short Description" error={e.short_description} hint="Up to 500 characters.">
          <Textarea id="short_description" name="short_description" rows={2} maxLength={500} defaultValue={v("short_description", product?.short_description)} />
        </Field>
        <Field name="full_description" label="Full Description" error={e.full_description}>
          <Textarea id="full_description" name="full_description" rows={5} defaultValue={v("full_description", product?.full_description)} />
        </Field>
      </Section>

      <Section title="Pricing">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="price" label="Price" error={e.price}>
            <Input id="price" name="price" inputMode="decimal" defaultValue={v("price", product?.price)} />
          </Field>
          <Field name="discount_price" label="Discount Price" error={e.discount_price}>
            <Input id="discount_price" name="discount_price" inputMode="decimal" defaultValue={v("discount_price", product?.discount_price)} />
          </Field>
          <Field name="currency" label="Currency" error={e.currency}>
            <Select id="currency" name="currency" defaultValue={v("currency", product?.currency ?? "BDT")}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Selling Points">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="features" label="Features" error={e.features} hint="One per line.">
            <Textarea id="features" name="features" rows={5} defaultValue={v("features", product?.features.join("\n"))} />
          </Field>
          <Field name="benefits" label="Benefits" error={e.benefits} hint="One per line.">
            <Textarea id="benefits" name="benefits" rows={5} defaultValue={v("benefits", product?.benefits.join("\n"))} />
          </Field>
        </div>
        <Field name="target_customer" label="Target Customer" error={e.target_customer}>
          <Textarea id="target_customer" name="target_customer" rows={3} defaultValue={v("target_customer", product?.target_customer)} />
        </Field>
        <Field name="cta" label="CTA" error={e.cta} hint='e.g. "Order now — cash on delivery available"'>
          <Input id="cta" name="cta" maxLength={200} defaultValue={v("cta", product?.cta)} />
        </Field>
      </Section>

      <Section title="Brand">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="brand_name" label="Brand Name" error={e.brand_name}>
            <Input id="brand_name" name="brand_name" maxLength={200} defaultValue={v("brand_name", product?.brand_name)} />
          </Field>
          <Field name="brand_colors" label="Brand Colors" error={e.brand_colors} hint="Comma-separated, e.g. #0B1220, #DC2626, White">
            <Input id="brand_colors" name="brand_colors" defaultValue={v("brand_colors", product?.brand_colors.join(", "))} />
          </Field>
        </div>
      </Section>

      <Section title="Internal">
        <Field name="notes" label="Notes" error={e.notes}>
          <Textarea id="notes" name="notes" rows={3} defaultValue={v("notes", product?.notes)} />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
