"use client";

import { useActionState, useState } from "react";
import type { CampaignActionState } from "@/lib/actions/campaigns";
import { META_OBJECTIVES, META_OBJECTIVE_LABELS } from "@/lib/ai/campaign-strategy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HATOG_STAGE_KEYS, HATOG_STAGE_LABELS } from "@/types/ai";
import type { ClientMetaAssignments } from "@/lib/meta/asset-assignment";
import { CampaignMetaAssetFields } from "@/components/admin/campaigns/CampaignMetaAssetFields";

type Action = (prev: CampaignActionState, formData: FormData) => Promise<CampaignActionState>;

const initialState: CampaignActionState = { status: "idle" };

export function NewCampaignForm({
  action,
  products,
  claudeReady,
  assignments,
}: {
  action: Action;
  products: { id: string; name: string }[];
  claudeReady: boolean;
  assignments: ClientMetaAssignments;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  // Controlled so values survive React's post-action form reset on errors.
  const [mode, setMode] = useState<"ai" | "blank">(claudeReady ? "ai" : "blank");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [hatogStage, setHatogStage] = useState("hook");
  const [objective, setObjective] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  if (products.length === 0) {
    return <p className="text-sm text-slate-500">Add a product for this client before creating a campaign.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="flex flex-wrap gap-4 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="ai" checked={mode === "ai"} disabled={!claudeReady} onChange={() => setMode("ai")} />
          AI strategy
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="blank" checked={mode === "blank"} onChange={() => setMode("blank")} />
          Blank draft
        </label>
        {!claudeReady && <span className="text-xs text-amber-700">Connect the AI provider to generate strategies.</span>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="product_id">Product</Label>
          <Select id="product_id" name="product_id" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="hatog_stage">Funnel Stage (HATOG)</Label>
          <Select id="hatog_stage" name="hatog_stage" value={hatogStage} onChange={(e) => setHatogStage(e.target.value)}>
            {HATOG_STAGE_KEYS.map((k) => (
              <option key={k} value={k}>
                {HATOG_STAGE_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="objective">Objective</Label>
          <Select id="objective" name="objective" value={objective} onChange={(e) => setObjective(e.target.value)}>
            <option value="">{mode === "ai" ? "Let the AI choose" : "Select an objective"}</option>
            {META_OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {META_OBJECTIVE_LABELS[o]}
              </option>
            ))}
          </Select>
        </div>
        {mode === "blank" && (
          <div>
            <Label htmlFor="name">Campaign Name</Label>
            <Input id="name" name="name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        {mode === "ai" && (
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes for the AI (optional)</Label>
            <Textarea id="notes" name="notes" maxLength={1000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Meta Assets (assigned to this client)</legend>
        <CampaignMetaAssetFields assignments={assignments} />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (mode === "ai" ? "Generating strategy…" : "Creating…") : mode === "ai" ? "Generate Strategy Draft" : "Create Draft"}
        </Button>
        {state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
