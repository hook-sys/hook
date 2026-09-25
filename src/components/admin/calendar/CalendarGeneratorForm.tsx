"use client";

import { useActionState, useState } from "react";
import type { CalendarActionState } from "@/lib/actions/content-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Action = (prev: CalendarActionState, formData: FormData) => Promise<CalendarActionState>;

export function CalendarGeneratorForm({
  action,
  products,
  defaultStartDate,
  aiReady,
}: {
  action: Action;
  products: { id: string; name: string }[];
  defaultStartDate: string;
  aiReady: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  // Controlled so selections survive React's post-action form reset.
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [days, setDays] = useState("30");
  const [platforms, setPlatforms] = useState<string[]>(["facebook", "instagram"]);
  const [selected, setSelected] = useState<string[]>(products.slice(0, 10).map((p) => p.id));
  const [notes, setNotes] = useState("");

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="start_date">Start Date</Label>
          <Input id="start_date" name="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="days">Length</Label>
          <Select id="days" name="days" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </Select>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Platforms</legend>
          <div className="flex gap-4 pt-2 text-sm text-slate-700">
            {[
              ["facebook", "Facebook"],
              ["instagram", "Instagram"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="platforms"
                  value={value}
                  checked={platforms.includes(value)}
                  onChange={() => toggle(platforms, setPlatforms, value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Products (up to 10)</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="product_ids"
                value={p.id}
                checked={selected.includes(p.id)}
                disabled={!selected.includes(p.id) && selected.length >= 10}
                onChange={() => toggle(selected, setSelected, p.id)}
              />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="focus_notes">Focus / Notes (optional)</Label>
        <Textarea
          id="focus_notes"
          name="focus_notes"
          rows={2}
          maxLength={1000}
          placeholder="e.g. Eid launch in week 2, push the new colour range"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !aiReady || platforms.length === 0 || selected.length === 0}>
          {pending ? "Planning calendar… (up to a few minutes)" : "Generate Calendar"}
        </Button>
        {state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
