import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <Badge variant="amber">Coming Soon</Badge>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-sm font-semibold text-slate-500">
            {title} integration is coming soon
          </p>
          <p className="max-w-sm text-sm text-slate-400">
            We&apos;re preparing this integration. It will appear here once it&apos;s
            available for your account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
