import { Card, CardContent } from "@/components/ui/card";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-sm font-semibold text-slate-500">Module under construction</p>
          <p className="max-w-sm text-sm text-slate-400">
            This section is scaffolded and ready for the next development phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
