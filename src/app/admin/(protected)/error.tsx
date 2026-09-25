"use client";

import { Button } from "@/components/ui/button";

// Error boundary for admin pages. Details stay in server logs; the digest helps correlate.
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-500">
        This page couldn&apos;t load. Try again; if it keeps failing, check the integration status in Settings.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">Reference: {error.digest}</p>}
      <Button className="mt-6" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
