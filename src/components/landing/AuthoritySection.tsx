export function AuthoritySection() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 rounded-2xl border border-slate-200 bg-slate-50 p-8 md:grid-cols-[auto,1fr] md:items-center md:p-12">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-brand-navy text-3xl font-bold text-white md:mx-0">
            SH
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-blue">
              Founder
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">
              Solyman Hossain
            </h2>
            <p className="mt-1 font-medium text-slate-500">Content Funnel Expert</p>
            <p className="mt-4 max-w-2xl text-slate-600">
              After more than 12 years working in online business, Solyman built the
              HOOK Framework to solve a pattern he kept seeing: international funnel
              playbooks underperforming for Bangladeshi audiences. HOOK is his
              answer — a content funnel approach shaped specifically around how
              Bangladeshi customers actually decide to buy.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
