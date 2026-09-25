import Link from "next/link";
import { ActionButton } from "@/components/admin/ActionButton";
import { ProductAssetForm } from "@/components/admin/products/ProductAssetForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { removeProductAsset } from "@/lib/actions/products";
import { isGoogleDriveConnected } from "@/lib/integrations/google-drive";
import type { Client } from "@/types/client";
import { PRODUCT_ASSET_TYPE_LABELS, type ProductAsset } from "@/types/product";

function folderUrl(id: string) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

export async function ProductAssetsSection({
  client,
  productId,
  assets,
  isSuperAdmin,
}: {
  client: Client;
  productId: string;
  assets: ProductAsset[];
  isSuperAdmin: boolean;
}) {
  const driveConnected = isSuperAdmin ? await isGoogleDriveConnected() : null;
  const productsFolder = client.drive_subfolder_ids.products;
  const imagesFolder = client.drive_subfolder_ids.images;
  const videosFolder = client.drive_subfolder_ids.videos;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Assets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          {productsFolder || imagesFolder || videosFolder ? (
            <p>
              Client Drive folders:{" "}
              {[
                ["Products", productsFolder],
                ["Images", imagesFolder],
                ["Videos", videosFolder],
              ]
                .filter(([, id]) => id)
                .map(([name, id], i) => (
                  <span key={name}>
                    {i > 0 && " · "}
                    <a href={folderUrl(id!)} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">
                      {name}
                    </a>
                  </span>
                ))}
              . Upload files there, then add their Drive links below.
            </p>
          ) : isSuperAdmin && !driveConnected ? (
            <p>
              <Link href="/admin/settings/integrations#google-drive" className="font-medium text-brand-blue hover:underline">
                Connect Google Drive
              </Link>{" "}
              to create this client&apos;s folders. Asset references can still be added by link.
            </p>
          ) : (
            <p>This client has no Drive folders yet. Asset references can still be added by link.</p>
          )}
        </div>

        {assets.length === 0 ? (
          <p className="text-sm text-slate-500">No asset references yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assets.map((asset) => (
              <li key={asset.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="blue">{PRODUCT_ASSET_TYPE_LABELS[asset.asset_type]}</Badge>
                    <span className="text-sm font-medium text-slate-900">{asset.label ?? "Untitled asset"}</span>
                  </div>
                  {asset.url && (
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-xs text-brand-blue hover:underline"
                    >
                      {asset.url}
                    </a>
                  )}
                  {asset.drive_file_id && <p className="text-xs text-slate-400">Drive file ID {asset.drive_file_id}</p>}
                </div>
                {isSuperAdmin && (
                  <ActionButton
                    action={removeProductAsset.bind(null, client.id, productId, asset.id)}
                    label="Remove"
                    pendingLabel="Removing..."
                    variant="ghost"
                    confirmMessage="Remove this asset reference? The file itself stays in Drive."
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {isSuperAdmin && <ProductAssetForm clientId={client.id} productId={productId} />}
      </CardContent>
    </Card>
  );
}
