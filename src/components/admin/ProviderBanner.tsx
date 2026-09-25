import Link from "next/link";

// "Connect <provider>" state shown wherever a feature depends on an integration.
export function ProviderBanner({
  provider,
  state,
  isSuperAdmin,
  detail,
}: {
  provider: string;
  state: "ready" | "not_configured" | "error" | "connected" | "not_connected";
  isSuperAdmin: boolean;
  detail?: string;
}) {
  if (state === "ready" || state === "connected") return null;
  return (
    <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <strong>Connect {provider}.</strong>{" "}
      {detail ?? (state === "error" ? `The ${provider} connection needs attention.` : `${provider} is not connected.`)}{" "}
      {isSuperAdmin ? (
        <Link href="/admin/settings/integrations" className="font-medium underline">
          Open Integrations
        </Link>
      ) : (
        "Ask a super admin to connect it."
      )}
    </div>
  );
}
