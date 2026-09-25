import { ActionButton } from "@/components/admin/ActionButton";
import { CreativeStatusBadge } from "@/components/admin/creative/CreativeStatusBadge";
import { archiveCreative, uploadCreativeToDriveAction } from "@/lib/actions/creatives";
import { CREATIVE_TYPE_LABELS } from "@/lib/creative/options";
import type { Creative } from "@/lib/services/creatives";
import { HATOG_STAGE_LABELS } from "@/types/ai";

// Drive creatives are previewed through the permission-checked thumbnail proxy (Drive files
// are private; the Google token stays on the server).
export function driveCreativeThumbnail(creative: Pick<Creative, "id" | "client_id">): string {
  return `/api/drive/thumbnail?${new URLSearchParams({ client: creative.client_id, creative: creative.id })}`;
}

export function CreativePreview({
  creative,
}: {
  creative: Pick<Creative, "id" | "client_id" | "media" | "status" | "asset_url" | "thumbnail_url" | "source">;
}) {
  if (creative.source === "drive") {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- same-origin Drive thumbnail proxy */}
        <img src={driveCreativeThumbnail(creative)} alt="" className="aspect-square w-full rounded-md bg-slate-100 object-contain" />
        <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
          Google Drive {creative.media}
        </span>
      </div>
    );
  }
  if (creative.status === "ready" && creative.asset_url) {
    return creative.media === "video" ? (
      <video src={creative.asset_url} controls preload="metadata" className="aspect-video w-full rounded-md bg-black object-contain" />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- provider-hosted asset, shown as-is
      <img src={creative.asset_url} alt="" className="aspect-square w-full rounded-md bg-slate-100 object-contain" />
    );
  }
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
      {creative.status === "generating" ? "Generating…" : "No preview"}
    </div>
  );
}

const DRIVE_LABEL = {
  not_uploaded: null,
  uploading: "Uploading to Drive…",
  uploaded: "In Drive",
  failed: "Drive upload failed",
} as const;

export function CreativeCard({
  creative,
  productName,
  canUploadToDrive = false,
}: {
  creative: Creative;
  productName: string;
  canUploadToDrive?: boolean;
}) {
  const brief = creative.brief;
  const openUrl = creative.source === "drive" ? creative.drive_web_url : creative.asset_url;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <CreativePreview creative={creative} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{brief.concept ?? CREATIVE_TYPE_LABELS[creative.creative_type]}</p>
          <p className="text-xs text-slate-500">
            {creative.source === "drive" && <>From Google Drive: {creative.drive_file_name ?? "file"} · </>}
            {productName} · {CREATIVE_TYPE_LABELS[creative.creative_type]} · {creative.format}
            {creative.duration_seconds ? ` · ${creative.duration_seconds}s` : ""}
          </p>
        </div>
        <CreativeStatusBadge status={creative.status} />
      </div>
      {creative.status === "failed" && creative.error && <p className="text-xs text-red-600">{creative.error}</p>}
      {DRIVE_LABEL[creative.drive_upload_status] && (
        <p className={creative.drive_upload_status === "failed" ? "text-xs text-red-600" : "text-xs text-slate-500"}>
          {DRIVE_LABEL[creative.drive_upload_status]}
          {creative.drive_upload_status === "failed" && creative.drive_error ? `: ${creative.drive_error}` : ""}
          {creative.drive_upload_status === "uploaded" && creative.drive_web_url && (
            <>
              {" · "}
              <a href={creative.drive_web_url} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">
                Open in Drive
              </a>
            </>
          )}
        </p>
      )}

      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">Brief & prompt</summary>
        <dl className="mt-2 space-y-2">
          {[
            ["HATOG", HATOG_STAGE_LABELS[creative.hatog_stage]],
            ["Hook", brief.hook],
            ["Visual direction", brief.visual_direction],
            ["Product presentation", brief.product_presentation],
            ["Text overlay", brief.text_overlay],
            ["CTA", brief.cta],
            ["Model", creative.provider_model],
            ["Generation prompt", creative.prompt],
            ["Negative prompt", creative.negative_prompt],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-slate-500">{k}</dt>
                <dd className="whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
          {brief.scene_plan && brief.scene_plan.length > 0 && (
            <div>
              <dt className="font-semibold text-slate-500">Scene plan</dt>
              <dd>
                <ol className="list-decimal pl-4">
                  {brief.scene_plan.map((s) => (
                    <li key={s.order}>
                      {s.duration_seconds ? `${s.duration_seconds}s — ` : ""}
                      {s.description}
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
          )}
        </dl>
      </details>

      <div className="mt-auto flex flex-wrap items-start gap-2">
        {creative.status === "ready" && openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Open
          </a>
        )}
        {canUploadToDrive && creative.source !== "drive" && creative.status === "ready" && creative.drive_upload_status !== "uploading" && (
          <ActionButton
            action={uploadCreativeToDriveAction.bind(null, creative.client_id, creative.id)}
            label={creative.drive_upload_status === "failed" ? "Retry Save to Google Drive" : creative.drive_upload_status === "uploaded" ? "Verify in Drive" : "Save to Google Drive"}
            pendingLabel="Saving to Drive..."
          />
        )}
        {(creative.status === "ready" || creative.status === "failed") && (
          <ActionButton
            action={archiveCreative.bind(null, creative.client_id, creative.id)}
            label="Archive"
            pendingLabel="Archiving..."
            variant="ghost"
          />
        )}
      </div>
    </div>
  );
}
