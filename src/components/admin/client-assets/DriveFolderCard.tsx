import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/admin/ActionButton";
import { syncClientDriveFolder } from "@/lib/actions/clients";
import { CLIENT_SUBFOLDERS } from "@/lib/integrations/drive-folders";
import { isGoogleDriveConnected } from "@/lib/integrations/google-drive";
import type { Client } from "@/types/client";

function folderUrl(id: string) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function DriveFolderCard({ client, isSuperAdmin }: { client: Client; isSuperAdmin: boolean }) {
  // Only super admins need the live connection state (to offer sync/connect).
  const connected = isSuperAdmin ? await isGoogleDriveConnected() : null;
  const subfolders = CLIENT_SUBFOLDERS.filter(({ key }) => client.drive_subfolder_ids[key]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Drive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {client.drive_folder_id ? (
          <>
            <a
              href={folderUrl(client.drive_folder_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 font-medium text-slate-900 hover:bg-slate-50"
            >
              Open Drive Folder
            </a>
            {subfolders.length > 0 && (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {subfolders.map(({ key, name }) => (
                  <li key={key}>
                    <a
                      href={folderUrl(client.drive_subfolder_ids[key]!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-blue hover:underline"
                    >
                      {name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-400">
              {client.drive_synced_at ? `Last synced ${formatDateTime(client.drive_synced_at)}` : "Not synced yet"}
            </p>
          </>
        ) : (
          <p className="text-slate-500">No Drive folder yet.</p>
        )}

        {isSuperAdmin &&
          (connected ? (
            <ActionButton
              action={syncClientDriveFolder.bind(null, client.id)}
              label="Create/Sync Drive Folder"
              pendingLabel="Syncing..."
              variant="secondary"
            />
          ) : (
            <p className="text-slate-500">
              <Link href="/admin/settings/integrations#google-drive" className="font-medium text-brand-blue hover:underline">
                Connect Google Drive
              </Link>{" "}
              to create and sync client folders.
            </p>
          ))}
      </CardContent>
    </Card>
  );
}
