import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/admin/ActionButton";
import { MetaAssetAssignmentForm } from "@/components/admin/client-assets/MetaAssetAssignmentForm";
import { removeClientMetaAssets } from "@/lib/actions/client-meta-assets";
import { getMetaAssets, getMetaConnectionState } from "@/lib/integrations/meta";
import type { MetaAssetSummary, MetaNamedAsset } from "@/lib/integrations/meta-assets";
import { IntegrationError } from "@/lib/integrations/types";
import { getClientMetaAssets } from "@/lib/services/client-meta-assets";
import type { ClientMetaAssets } from "@/types/client";

function asset(id: string | null, name: string | null): MetaNamedAsset | null {
  return id ? { id, name: name ?? id } : null;
}

function AssignedAssets({ assignment }: { assignment: ClientMetaAssets | null }) {
  if (!assignment) return <p className="text-sm text-slate-500">No Meta assets assigned.</p>;

  const rows = [
    { label: "Ad Account", value: assignment.ad_account_name, id: assignment.ad_account_id?.replace(/^act_/, "") },
    { label: "Facebook Page", value: assignment.facebook_page_name, id: assignment.facebook_page_id },
    {
      label: "Instagram",
      value: assignment.instagram_username ? `@${assignment.instagram_username}` : null,
      id: assignment.instagram_account_id,
    },
  ];

  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{row.label}</dt>
          <dd className="mt-1 text-sm">
            {row.id ? (
              <>
                <span className="font-medium text-slate-900">{row.value ?? row.id}</span>
                <span className="block text-xs text-slate-400">ID {row.id}</span>
              </>
            ) : (
              <span className="text-slate-400">Not assigned</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export async function MetaAssetsCard({ clientId, isSuperAdmin }: { clientId: string; isSuperAdmin: boolean }) {
  const assignment = await getClientMetaAssets(clientId);

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meta Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <AssignedAssets assignment={assignment} />
        </CardContent>
      </Card>
    );
  }

  const connection = await getMetaConnectionState();
  let available: MetaAssetSummary | null = null;
  let loadError: string | null = null;
  if (connection.connected && connection.businessId) {
    try {
      available = await getMetaAssets(connection.businessId);
    } catch (error) {
      loadError = error instanceof IntegrationError ? error.message : "Could not load assets from Meta.";
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle>Meta Assets</CardTitle>
        {connection.businessName && (
          <span className="text-xs text-slate-500">Business Manager: {connection.businessName}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!available && <AssignedAssets assignment={assignment} />}

        {!connection.connected ? (
          <p className="text-sm text-slate-500">
            <Link href="/admin/settings/integrations#meta" className="font-medium text-brand-blue hover:underline">
              Connect Meta
            </Link>{" "}
            to load and assign this client&apos;s ad account, Page, and Instagram account.
          </p>
        ) : !connection.businessId ? (
          <p className="text-sm text-slate-500">
            Select the Hook Marketing Business Manager in{" "}
            <Link href="/admin/settings/integrations#meta" className="font-medium text-brand-blue hover:underline">
              Integrations
            </Link>{" "}
            to assign assets.
          </p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : (
          available && (
            <MetaAssetAssignmentForm
              clientId={clientId}
              available={available}
              current={{
                adAccount: asset(assignment?.ad_account_id ?? null, assignment?.ad_account_name ?? null),
                facebookPage: asset(assignment?.facebook_page_id ?? null, assignment?.facebook_page_name ?? null),
                instagramAccount: asset(
                  assignment?.instagram_account_id ?? null,
                  assignment?.instagram_username ?? null
                ),
              }}
            />
          )
        )}

        {assignment && (
          <ActionButton
            action={removeClientMetaAssets.bind(null, clientId)}
            label="Remove All Meta Assets"
            pendingLabel="Removing..."
            variant="ghost"
            confirmMessage="Remove all Meta assets from this client?"
          />
        )}
      </CardContent>
    </Card>
  );
}
