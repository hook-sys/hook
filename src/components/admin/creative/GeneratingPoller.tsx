"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { refreshCreativeStatuses } from "@/lib/actions/creatives";

const INTERVAL_MS = 10_000;

// While any creative is generating, asks the server to check Fal.ai and re-renders the page.
export function GeneratingPoller({ clientId, count }: { clientId: string; count: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (count === 0) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const result = await refreshCreativeStatuses(clientId);
      if (cancelled) return;
      setMessage(result.status === "error" ? (result.message ?? null) : null);
      router.refresh();
    }, INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clientId, count, router]);

  if (count === 0) return null;
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      {count} creative{count === 1 ? " is" : "s are"} generating. This page checks Fal.ai every 10 seconds.
      {message && <span className="mt-1 block text-red-600">{message}</span>}
    </div>
  );
}
