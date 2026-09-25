import type { ReactNode } from "react";

// Same frame as the admin login page.
export function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Hook<span className="text-brand-red">Marketing</span>
          </span>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
