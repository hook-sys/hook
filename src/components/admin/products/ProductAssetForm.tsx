"use client";

import { useActionState, useRef } from "react";
import { addProductAsset, type ProductFormState } from "@/lib/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div>
        <Label htmlFor="location">Google Drive link or file ID (image or video)</Label>
        <Input id="location" name="location" required placeholder="https://drive.google.com/file/d/…/view" />
        <p className="mt-1 text-xs text-slate-400">
          The file type is detected from Drive; only images and videos are accepted. Reference images for Fal.ai must be
          JPEG, PNG or WebP and shared “Anyone with the link”.
        </p>
      </div>
      <div>
        <Label htmlFor="label">Label (optional)</Label>
        <Input id="label" name="label" maxLength={200} placeholder="e.g. Front view, 30s demo video" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Checking Drive..." : "Add Drive Asset"}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
