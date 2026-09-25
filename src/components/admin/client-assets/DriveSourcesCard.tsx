import Link from "next/link";
import { ActionButton } from "@/components/admin/ActionButton";
import { DriveSourceForm } from "@/components/admin/client-assets/DriveSourceForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recheckDriveSourceAction, removeDriveSourceAction, saveDriveSourceAction } from "@/lib/actions/drive-sources";
import { DRIVE_SOURCE_MEDIA_LABELS } from "@/lib/drive/media-types";
import { listClientDriveSources } from "@/lib/drive/sources";
import { hasDriveReadAccess, isGoogleDriveConnected } from "@/lib/integrations/google-drive";

const STATUS = {
  available: { label: "Available", variant: "green" },
  unavailable: { label: "Unavailable", variant: "red" },
  unchecked: { label: "Not checked", variant: "amber" },
} as const;

// Per-client Google Drive sources: the image/video assets used by Creative Studio and ads.
export async function DriveSourcesCard({ clientId, isSuperAdmin }: { clientId: string; isSuperAdmin: boolean }) {
  const [sources, connected, readAccess] = await Promise.all([
    listClientDriveSources(clientId),
    isGoogleDriveConnected(),
    hasDriveReadAccess(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Drive Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 py-5">
        <p className="text-sm text-slate-500">
          Image and video assets for Creative Studio references and ad creatives. Google Drive is used only for images and
          videos.
        </p>
        {isSuperAdmin && (!connected || !readAccess) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {connected ? "Google Drive is connected without read access to client folders. " : "Google Drive is not connected. "}
            <Link href="/admin/settings/integrations" className="font-medium underline">
              {connected ? "Reconnect Google Drive" : "Connect Google Drive"}
            </Link>{" "}
            to grant read-only access, then re-check each source.
          </div>
        )}

        {sources.length === 0 ? (
          <p className="text-sm text-slate-500">No Drive sources yet.</p>
        ) : (
          <ul className="space-y-3">
            {sources.map((source) => {
              const status = STATUS[source.status];
              return (
                <li key={source.id} className="space-y-2 rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="font-semibold text-slate-900">{source.name}</p>
                      <a href={source.drive_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand-blue hover:underline">
                        {source.drive_url}
                      </a>
                      <p className="text-xs text-slate-500">
                        {DRIVE_SOURCE_MEDIA_LABELS[source.media_type]} · {source.item_kind === "folder" ? "Folder" : "Single file"}
                      </p>
                      {source.status_detail && <p className="text-xs text-slate-500">{source.status_detail}</p>}
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  {isSuperAdmin && (
                    <div className="flex flex-wrap items-start gap-2">
                      <details className="w-full sm:w-auto">
                        <summary className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                          Edit
                        </summary>
                        <div className="mt-3">
                          <DriveSourceForm
                            action={saveDriveSourceAction.bind(null, clientId, source.id)}
                            idPrefix={`drive-${source.id}`}
                            initial={{ name: source.name, url: source.drive_url, mediaType: source.media_type }}
                            submitLabel="Save"
                          />
                        </div>
                      </details>
                      <ActionButton action={recheckDriveSourceAction.bind(null, clientId, source.id)} label="Re-check" pendingLabel="Checking…" />
                      <ActionButton
                        action={removeDriveSourceAction.bind(null, clientId, source.id)}
                        label="Remove"
                        pendingLabel="Removing…"
                        variant="ghost"
                        confirmMessage={`Remove the Drive source “${source.name}”? Files in Google Drive are not affected.`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {isSuperAdmin && (
          <details className="rounded-md border border-dashed border-slate-300 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-brand-blue">+ Add Drive Link</summary>
            <div className="mt-3">
              <DriveSourceForm action={saveDriveSourceAction.bind(null, clientId, null)} idPrefix="drive-new" submitLabel="Add Drive Link" />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
