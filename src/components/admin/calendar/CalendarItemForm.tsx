"use client";

import { useActionState, useState } from "react";
import type { CalendarActionState } from "@/lib/actions/content-calendar";
import {
  CONTENT_ASPECT_RATIOS,
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABELS,
  CONTENT_PLATFORMS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  PLATFORM_LABELS,
  VIDEO_CONTENT_FORMATS,
  type ContentFormat,
} from "@/lib/ai/content-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HATOG_STAGE_KEYS, HATOG_STAGE_LABELS } from "@/types/ai";

type Action = (prev: CalendarActionState, formData: FormData) => Promise<CalendarActionState>;

export function CalendarItemForm({
  action,
  initial,
  products,
  editable,
}: {
  action: Action;
  initial: Record<string, string>;
  products: { id: string; name: string }[];
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  // Controlled so edits survive React's post-action form reset when validation fails.
  const [values, setValues] = useState(initial);
  const bind = (name: string) => ({
    id: name,
    name,
    value: values[name] ?? "",
    disabled: !editable,
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  const isVideo = VIDEO_CONTENT_FORMATS.includes(values.suggested_format as ContentFormat);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="scheduled_date">Date</Label>
          <Input type="date" {...bind("scheduled_date")} />
        </div>
        <div>
          <Label htmlFor="content_type">Content Type</Label>
          <Select {...bind("content_type")}>
            {CONTENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="platform">Platform</Label>
          <Select {...bind("platform")}>
            {CONTENT_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="product_id">Product</Label>
          <Select {...bind("product_id")}>
            <option value="">Brand-level (no product)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="hatog_stage">HATOG Stage</Label>
          <Select {...bind("hatog_stage")}>
            {HATOG_STAGE_KEYS.map((k) => (
              <option key={k} value={k}>
                {HATOG_STAGE_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="suggested_format">Format</Label>
          <Select {...bind("suggested_format")}>
            {CONTENT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {CONTENT_FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="aspect_ratio">Aspect Ratio</Label>
          <Select {...bind("aspect_ratio")}>
            {CONTENT_ASPECT_RATIOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        {isVideo && (
          <div>
            <Label htmlFor="duration_seconds">Duration (sec)</Label>
            <Input type="number" min={5} max={90} {...bind("duration_seconds")} />
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="hook">Hook</Label>
        <Input maxLength={500} {...bind("hook")} />
      </div>
      <div>
        <Label htmlFor="concept">Concept</Label>
        <Textarea rows={2} maxLength={1000} {...bind("concept")} />
      </div>
      <div>
        <Label htmlFor="caption">Caption</Label>
        <Textarea rows={5} maxLength={2200} {...bind("caption")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cta">CTA</Label>
          <Input maxLength={200} {...bind("cta")} />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Input maxLength={1000} {...bind("notes")} />
        </div>
      </div>
      <div>
        <Label htmlFor="creative_direction">Creative Direction</Label>
        <Textarea rows={3} maxLength={1500} {...bind("creative_direction")} />
      </div>
      {editable ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save Item"}
          </Button>
          {state.message && (
            <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Published and archived items are read-only.</p>
      )}
    </form>
  );
}
