import Link from "next/link";
import { hasUsableMetaAssets, type ClientMetaAssignments } from "@/lib/meta/asset-assignment";

// Campaign drafts can be written without Meta; publishing needs a connection and an
// ad account + Page assigned to this client from the central Meta asset pool.
export function MetaReadinessNotice({
  metaConnected,
  assignments,
  clientId,
  isSuperAdmin,
}: {
  metaConnected: boolean;
  assignments: ClientMetaAssignments;
  clientId: string;
  isSuperAdmin: boolean;
}) {
  let message: string | null = null;
  let href: string | null = null;
  if (!metaConnected) {
    message = "Connect Meta.";
    href = "/admin/settings/integrations";
  } else if (!hasUsableMetaAssets(assignments)) {
    message = "Assign Meta assets first.";
    href = `/admin/clients/${clientId}#meta-assets`;
  }
  if (!message) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <strong>{message}</strong> Drafts can still be prepared; publishing needs a Meta connection and an ad account and Page
      assigned to this client.{" "}
      {isSuperAdmin && href ? (
        <Link href={href} className="font-medium underline">
          Fix it
        </Link>
      ) : (
        "Ask a super admin."
      )}
    </div>
  );
}
