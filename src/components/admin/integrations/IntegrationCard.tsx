import type { ReactNode } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { IntegrationStatus } from "@/lib/integrations/types";

export const STATUS_BADGE: Record<IntegrationStatus, { label: string; variant: BadgeProps["variant"] }> = {
  not_connected: { label: "Not Connected", variant: "slate" },
  configured: { label: "Saved — Not Tested", variant: "amber" },
  connected: { label: "Connected", variant: "green" },
  error: { label: "Needs Attention", variant: "red" },
};

export function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function IntegrationCard({
  id,
  title,
  description,
  badge,
  children,
}: {
  id: string;
  title: string;
  description: string;
  badge: { label: string; variant: BadgeProps["variant"] };
  children?: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <Badge variant={badge.variant} className="shrink-0">
            {badge.label}
          </Badge>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function MissingConfig({ vars }: { vars: string[] }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p className="font-medium">Server configuration required</p>
      <p className="mt-1">
        Set {vars.map((v, i) => (
          <span key={v}>
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">{v}</code>
            {i < vars.length - 1 ? ", " : ""}
          </span>
        ))}{" "}
        in the server environment, then restart the app.
      </p>
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}
