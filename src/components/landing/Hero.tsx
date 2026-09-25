import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-navy text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.35),transparent_55%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
        <p className="mb-5 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-300">
          A Bangladesh-focused content funnel framework
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          International funnels weren&apos;t built for how{" "}
          <span className="text-brand-red">Bangladeshi customers</span> actually buy.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-300 md:text-xl">
          HOOK adapts proven content-funnel principles to local trust behavior and
          decision-making — so the goal isn&apos;t just more sales, it&apos;s a
          profitable e-commerce business.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="#apply"
            className="rounded-md bg-brand-red px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-red-900/30 transition-colors hover:bg-brand-red-dark"
          >
            Apply for a Business Assessment
          </Link>
          <Link
            href="#hook-framework"
            className="rounded-md border border-white/20 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            See the HOOK Framework
          </Link>
        </div>
        <p className="mt-8 text-sm text-slate-400">
          Built from 12+ years of hands-on online business experience.
        </p>
      </div>
    </section>
  );
}
