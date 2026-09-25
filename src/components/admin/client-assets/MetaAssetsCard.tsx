import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/admin/ActionButton";
import { MetaAssetAssignmentForm } from "@/components/admin/client-assets/MetaAssetAssignmentForm";
import { removeClientBusinessManager, removeClientMetaAsset } from "@/lib/actions/client-meta-assets";
import { getMetaConnectionState } from "@/lib/integrations/meta";
import type { AssignedAsset, ClientMetaAssignments, MetaPoolKind } from "@/lib/meta/asset-assignment";
import { getClientMetaAssignments, listMetaAssetPool } from "@/lib/services/meta-assets";

function AssignedList({
  title,
  items,
  clientId,
  kind,
  canManage,
  format = (a) => a.name,
}: {
  title: string;
  items: AssignedAsset[];
  clientId: string;
  kind: MetaPoolKind;
  canManage: boolean;
  format?: (a: AssignedAsset) => string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-slate-400">Not assigned</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
              <span>
                <span className="font-medium text-slate-900">✓ {format(a)}</span>
                <span className="block text-xs text-slate-400">ID {a.id.replace(/^act_/, "")}</span>
              </span>
              {canManage && (
                <ActionButton
                  action={removeClientMetaAsset.bind(null, clientId, kind, a.id)}
                  label="Remove"
                  pendingLabel="Removing..."
                  variant="ghost"
                  showResult={false}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Assigned({ assignments, clientId, canManage }: { assignments: ClientMetaAssignments; clientId: string; canManage: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Business Managers</p>
        {assignments.businesses.length === 0 ? (
          <p className="mt-1 text-sm text-slate-400">Not assigned</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {assignments.businesses.map((b) => (
              <li key={b.business_id} className="flex items-start justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium text-slate-900">✓ {b.name}</span>
                  <span className="block text-xs text-slate-400">ID {b.business_id}</span>
                </span>
                {canManage && (
                  <ActionButton
                    action={removeClientBusinessManager.bind(null, clientId, b.business_id)}
                    label="Remove"
                    pendingLabel="Removing..."
                    variant="ghost"
                    showResult={false}
                    confirmMessage={`Remove ${b.name} and this client's assets under it? The Meta assets themselves are not deleted.`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <AssignedList title="Ad Accounts" items={assignments.adAccounts} clientId={clientId} kind="adAccounts" canManage={canManage} />
        <AssignedList title="Facebook Pages" items={assignments.pages} clientId={clientId} kind="pages" canManage={canManage} />
        <AssignedList
          title="Instagram"
          items={assignments.instagramAccounts}
          clientId={clientId}
          kind="instagramAccounts"
          canManage={canManage}
          format={(a) => `@${a.name}`}
        />
      </div>
    </div>
  );
}

export async function MetaAssetsCard({ clientId, isSuperAdmin }: { clientId: string; isSuperAdmin: boolean }) {
  const assignments = await getClientMetaAssignments(clientId);

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meta Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <Assigned assignments={assignments} clientId={clientId} canManage={false} />
        </CardContent>
      </Card>
    );
  }

  const [connection, pool] = await Promise.all([getMetaConnectionState(), listMetaAssetPool()]);
  const activeBusinesses = pool.businesses.filter((b) => b.is_active);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta Assets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Assigned assignments={assignments} clientId={clientId} canManage />

        {!connection.connected && pool.businesses.length === 0 ? (
          <p className="text-sm text-slate-500">
            <Link href="/admin/settings/integrations#meta" className="font-medium text-brand-blue hover:underline">
              Connect Meta
            </Link>{" "}
            to build the central Meta asset pool, then assign assets to this client.
          </p>
        ) : activeBusinesses.length === 0 ? (
          <p className="text-sm text-slate-500">
            The Meta asset pool is empty.{" "}
            <Link href="/admin/settings/integrations#meta" className="font-medium text-brand-blue hover:underline">
              Sync Meta Assets
            </Link>{" "}
            in Integrations first.
          </p>
        ) : (
          <MetaAssetAssignmentForm clientId={clientId} pool={pool} assignments={assignments} />
        )}
      </CardContent>
    </Card>
  );
}
