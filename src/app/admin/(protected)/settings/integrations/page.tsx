import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/session";
import { disconnectGoogleDriveAction, disconnectMetaAction, syncMetaAssetPoolAction } from "@/lib/actions/integrations";
import { GOOGLE_ENV_VARS, META_ENV_VARS, missingEnvVars } from "@/lib/integrations/env";
import { listIntegrations } from "@/lib/integrations/store";
import type { MetaAssetPool } from "@/lib/meta/asset-assignment";
import { listMetaAssetPool } from "@/lib/services/meta-assets";
import { saveFalModelsAction } from "@/lib/actions/fal-settings";
import { getFalModelSelection } from "@/lib/creative/fal-selection";
import { FalModelsForm } from "@/components/admin/integrations/FalModelsForm";
import { ActionButton } from "@/components/admin/ActionButton";
import { ApiKeyIntegrationPanel } from "@/components/admin/integrations/ApiKeyIntegrationPanel";
import {
  DetailRow,
  formatTimestamp,
  IntegrationCard,
  MissingConfig,
  STATUS_BADGE,
} from "@/components/admin/integrations/IntegrationCard";

const BANNERS: Record<string, { tone: "success" | "error"; text: string }> = {
  "connected:google_drive": { tone: "success", text: "Google Drive connected." },
  "connected:meta": { tone: "success", text: "Meta connected." },
  "error:google_not_configured": { tone: "error", text: "Google OAuth credentials are not configured on the server." },
  "error:meta_not_configured": { tone: "error", text: "Meta app credentials are not configured on the server." },
  "error:oauth_state": { tone: "error", text: "The connection request expired or was invalid. Please try again." },
  "error:google_denied": { tone: "error", text: "Google authorization was cancelled." },
  "error:meta_denied": { tone: "error", text: "Meta authorization was cancelled." },
  "error:google_failed": { tone: "error", text: "Could not complete the Google Drive connection. Please try again." },
  "error:meta_failed": { tone: "error", text: "Could not complete the Meta connection. Please try again." },
};

const CONNECT_LINK =
  "inline-flex h-9 items-center justify-center rounded-md bg-brand-red px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark";

function AssetList({ label, items }: { label: string; items: { id: string; name: string }[] }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label} <span className="text-slate-600">({items.length})</span>
      </p>
      {items.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="truncate">
              {item.name}
            </li>
          ))}
          {items.length > 5 && <li className="text-slate-400">+{items.length - 5} more</li>}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-slate-400">None found</p>
      )}
    </div>
  );
}

export default async function IntegrationsPage({ searchParams }: PageProps<"/admin/settings/integrations">) {
  await requireSuperAdmin();
  const params = await searchParams;

  const integrations = await listIntegrations();
  const { google_drive: drive, meta, claude, openai, gemini, fal } = integrations;
  const falReady = fal.status === "connected" || fal.status === "configured";
  const falSelection = falReady ? await getFalModelSelection() : null;
  const googleMissing = missingEnvVars(GOOGLE_ENV_VARS);
  const metaMissing = missingEnvVars(META_ENV_VARS);

  // Central Meta asset pool (synced from the connected Meta account; stored in Supabase).
  const metaPool: MetaAssetPool | null = meta.status !== "not_connected" && metaMissing.length === 0 ? await listMetaAssetPool() : null;
  const activeBusinesses = metaPool?.businesses.filter((b) => b.is_active) ?? [];

  const bannerKey =
    typeof params.connected === "string"
      ? `connected:${params.connected}`
      : typeof params.error === "string"
        ? `error:${params.error}`
        : null;
  const banner = bannerKey ? BANNERS[bannerKey] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-brand-blue hover:underline">
          &larr; Settings
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect Hook Marketing&apos;s central accounts. Credentials are stored encrypted on the server and are
          only manageable by Super Admins.
        </p>
      </div>

      {banner && (
        <div
          className={
            banner.tone === "success"
              ? "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
              : "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          }
        >
          {banner.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <IntegrationCard
          id="google-drive"
          title="Google Drive"
          description="Central Hook Marketing Drive. Creates a folder tree for every client."
          badge={googleMissing.length > 0 ? { label: "Not Configured", variant: "slate" } : STATUS_BADGE[drive.status]}
        >
          {googleMissing.length > 0 ? (
            <MissingConfig vars={googleMissing} />
          ) : drive.status === "not_connected" ? (
            <a href="/api/integrations/google/connect" className={CONNECT_LINK}>
              Connect Google Drive
            </a>
          ) : (
            <div className="space-y-3">
              <DetailRow label="Account" value={drive.config.account_email ?? "—"} />
              <DetailRow label="Connected" value={formatTimestamp(drive.connected_at) ?? "—"} />
              <DetailRow label="Folder root" value="HOOK MARKETING DRIVE / Clients" />
              {drive.config.last_error && <p className="text-sm text-red-600">{drive.config.last_error}</p>}
              <div className="flex flex-wrap items-start gap-2">
                {drive.status === "error" && (
                  <a href="/api/integrations/google/connect" className={CONNECT_LINK}>
                    Reconnect
                  </a>
                )}
                <ActionButton
                  action={disconnectGoogleDriveAction}
                  label="Disconnect"
                  pendingLabel="Disconnecting..."
                  confirmMessage="Disconnect Google Drive? Existing folders stay in Drive."
                />
              </div>
            </div>
          )}
        </IntegrationCard>

        <IntegrationCard
          id="meta"
          title="Meta"
          description="Hook Marketing Business Manager connection for ad accounts, Pages, and Instagram."
          badge={metaMissing.length > 0 ? { label: "Not Configured", variant: "slate" } : STATUS_BADGE[meta.status]}
        >
          {metaMissing.length > 0 ? (
            <MissingConfig vars={metaMissing} />
          ) : meta.status === "not_connected" ? (
            <a href="/api/integrations/meta/connect" className={CONNECT_LINK}>
              Connect Meta
            </a>
          ) : (
            <div className="space-y-3">
              <DetailRow label="Meta user" value={meta.config.account_name ?? "—"} />
              <DetailRow label="Connected" value={formatTimestamp(meta.connected_at) ?? "—"} />
              {meta.config.expires_at && (
                <DetailRow label="Token expires" value={formatTimestamp(meta.config.expires_at)} />
              )}
              {meta.config.last_error && <p className="text-sm text-red-600">{meta.config.last_error}</p>}
              {metaPool && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Meta Asset Pool <span className="text-slate-600">({activeBusinesses.length} Business Managers)</span>
                  </p>
                  {activeBusinesses.length === 0 ? (
                    <p className="text-sm text-slate-500">No Business Managers synced yet. Use Sync Meta Assets.</p>
                  ) : (
                    activeBusinesses.map((b) => (
                      <div key={b.business_id} className="space-y-1">
                        <p className="text-sm font-medium text-slate-800">{b.name}</p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <AssetList label="Ad accounts" items={metaPool.adAccounts.filter((a) => a.business_id === b.business_id && a.is_active)} />
                          <AssetList label="Pages" items={metaPool.pages.filter((a) => a.business_id === b.business_id && a.is_active)} />
                          <AssetList label="Instagram" items={metaPool.instagramAccounts.filter((a) => a.business_id === b.business_id && a.is_active)} />
                        </div>
                      </div>
                    ))
                  )}
                  <p className="text-xs text-slate-400">Assign pool assets to clients from each client&apos;s Meta Assets section.</p>
                </div>
              )}
              <div className="flex flex-wrap items-start gap-2">
                {meta.status === "error" && (
                  <a href="/api/integrations/meta/connect" className={CONNECT_LINK}>
                    Reconnect
                  </a>
                )}
                {meta.status === "connected" && (
                  <ActionButton action={syncMetaAssetPoolAction} label="Sync Meta Assets" pendingLabel="Syncing..." />
                )}
                <ActionButton
                  action={disconnectMetaAction}
                  label="Disconnect"
                  pendingLabel="Disconnecting..."
                  confirmMessage="Disconnect Meta?"
                />
              </div>
            </div>
          )}
        </IntegrationCard>

        <IntegrationCard
          id="claude"
          title="Claude"
          description="Anthropic API for strategy, content, and campaign intelligence."
          badge={STATUS_BADGE[claude.status]}
        >
          <ApiKeyIntegrationPanel
            provider="claude"
            label="Claude"
            keyHint={claude.config.key_hint ?? null}
            lastTested={formatTimestamp(claude.config.last_tested_at)}
            lastError={claude.status === "error" ? (claude.config.last_error ?? null) : null}
          />
        </IntegrationCard>

        <IntegrationCard
          id="openai"
          title="OpenAI"
          description="OpenAI API as an AI brain for strategy, content, campaign intelligence, and reports."
          badge={STATUS_BADGE[openai.status]}
        >
          <ApiKeyIntegrationPanel
            provider="openai"
            label="OpenAI"
            keyHint={openai.config.key_hint ?? null}
            lastTested={formatTimestamp(openai.config.last_tested_at)}
            lastError={openai.status === "error" ? (openai.config.last_error ?? null) : null}
            connectOnSave
          />
        </IntegrationCard>

        <IntegrationCard
          id="gemini"
          title="Google Gemini"
          description="Google Gemini API as an AI brain for strategy, content, campaign intelligence, and reports."
          badge={STATUS_BADGE[gemini.status]}
        >
          <ApiKeyIntegrationPanel
            provider="gemini"
            label="Google Gemini"
            keyHint={gemini.config.key_hint ?? null}
            lastTested={formatTimestamp(gemini.config.last_tested_at)}
            lastError={gemini.status === "error" ? (gemini.config.last_error ?? null) : null}
            connectOnSave
          />
        </IntegrationCard>

        <IntegrationCard
          id="fal"
          title="Fal.ai"
          description="Image and video generation."
          badge={STATUS_BADGE[fal.status]}
        >
          <ApiKeyIntegrationPanel
            provider="fal"
            label="Fal.ai"
            keyHint={fal.config.key_hint ?? null}
            lastTested={formatTimestamp(fal.config.last_tested_at)}
            lastError={fal.status === "error" ? (fal.config.last_error ?? null) : null}
          />
          {falSelection && <FalModelsForm action={saveFalModelsAction} initialSelection={falSelection} />}
        </IntegrationCard>

        <IntegrationCard
          id="inworld"
          title="Inworld"
          description="Voice/audio generation can be connected when needed."
          badge={{ label: "Coming Later", variant: "slate" }}
        />

        <IntegrationCard
          id="tiktok"
          title="TikTok"
          description="TikTok ads and content publishing."
          badge={{ label: "Coming Soon", variant: "amber" }}
        />

        <IntegrationCard
          id="youtube"
          title="YouTube"
          description="YouTube channel and video publishing."
          badge={{ label: "Coming Soon", variant: "amber" }}
        />
      </div>
    </div>
  );
}
