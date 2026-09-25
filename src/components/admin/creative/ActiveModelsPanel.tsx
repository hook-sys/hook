import Link from "next/link";
import { FAL_MODELS, type FalModelSelection } from "@/lib/creative/fal-models";

// The models Creative Studio will use, read from the saved Super Admin configuration
// (Settings → AI Brain and Settings → Integrations → Fal.ai). Nothing here is hard-coded.
export function ActiveModelsPanel({
  brain,
  falModels,
  isSuperAdmin,
}: {
  brain: { providerLabel: string; model: string } | null;
  falModels: FalModelSelection;
  isSuperAdmin: boolean;
}) {
  const rows: { label: string; mode: keyof FalModelSelection }[] = [
    { label: "Image Generation", mode: "text-to-image" },
    { label: "Image + Reference", mode: "image-to-image" },
    { label: "Video Generation", mode: "text-to-video" },
    { label: "Video + Reference", mode: "image-to-video" },
  ];
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-md border border-slate-200 p-3">
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI Brain</dt>
        <dd className="mt-1 break-words text-slate-900">
          {brain ? (
            <>
              {brain.providerLabel} → <span className="font-medium">{brain.model}</span>
            </>
          ) : (
            <span className="text-amber-700">Not selected</span>
          )}
        </dd>
      </div>
      {rows.map(({ label, mode }) => {
        const spec = FAL_MODELS[falModels[mode]];
        return (
          <div key={mode} className="rounded-md border border-slate-200 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-1 break-words text-slate-900">
              Fal.ai → <span className="font-medium">{spec?.label ?? falModels[mode]}</span>
              <span className="block text-xs text-slate-400">{falModels[mode]}</span>
            </dd>
          </div>
        );
      })}
      {isSuperAdmin && (
        <p className="text-xs text-slate-400 sm:col-span-2 lg:col-span-5">
          Change models in{" "}
          <Link href="/admin/settings/ai" className="text-brand-blue hover:underline">
            Settings → AI Brain
          </Link>{" "}
          and{" "}
          <Link href="/admin/settings/integrations#fal" className="text-brand-blue hover:underline">
            Settings → Integrations → Fal.ai
          </Link>
          .
        </p>
      )}
    </dl>
  );
}
