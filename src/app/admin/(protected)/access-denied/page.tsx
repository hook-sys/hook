import { Card, CardContent } from "@/components/ui/card";

export default function AccessDeniedPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Access restricted</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm font-semibold text-slate-600">
            You don&apos;t have permission to access this module.
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Use the navigation to open a module you have access to, or ask an admin for access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
