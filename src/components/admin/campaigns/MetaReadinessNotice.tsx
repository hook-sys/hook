import Link from "next/link";
import type { ClientMetaAssets } from "@/types/client";

// Campaign drafts can be written without Meta; publishing needs a connection and the
// client's ad account + Page.
export function MetaReadinessNotice({
  metaConnected,
  assets,
  clientId,
  isSuperAdmin,
}: {
  metaConnected: boolean;
  assets: ClientMetaAssets | null;
  clientId: string;
  isSuperAdmin: boolean;
}) {
  let message: string | null = null;
  let href: string | null = null;
  if (!metaConnected) {
    message = "Connect Meta.";
    href = "/admin/settings/integrations";
  } else if (!assets?.ad_account_id || !assets.facebook_page_id) {
    message = "Assign Meta assets first.";
    href = `/admin/clients/${clientId}#meta-assets`;
  }
  if (!message) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <strong>{message}</strong> Drafts can still be prepared; publishing needs a Meta connection and this client&apos;s ad
      account and Page.{" "}
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
