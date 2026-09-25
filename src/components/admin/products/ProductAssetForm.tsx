"use client";

import { useActionState, useRef } from "react";
import { addProductAsset, type ProductFormState } from "@/lib/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PRODUCT_ASSET_TYPES, PRODUCT_ASSET_TYPE_LABELS } from "@/types/product";

const initialState: ProductFormState = { status: "idle" };

export function ProductAssetForm({ clientId, productId }: { clientId: string; productId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ProductFormState, formData: FormData) => {
    const result = await addProductAsset(clientId, productId, prev, formData);
    if (result.status === "success") formRef.current?.reset();
    return result;
  }, initialState);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-md border border-slate-200 p-4">
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div>
          <Label htmlFor="asset_type">Type</Label>
          <Select id="asset_type" name="asset_type" defaultValue="image">
            {PRODUCT_ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRODUCT_ASSET_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="location">Google Drive link, Drive file ID, or https:// URL</Label>
          <Input id="location" name="location" required placeholder="https://drive.google.com/file/d/…/view" />
        </div>
      </div>
      <div>
        <Label htmlFor="label">Label (optional)</Label>
        <Input id="label" name="label" maxLength={200} placeholder="e.g. Front view, 30s demo video" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding..." : "Add Asset Reference"}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
