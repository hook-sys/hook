const STATS = [
  { value: "12+", label: "Years working in online business" },
  { value: "HOOK", label: "A framework built from real campaign experience" },
  { value: "BD", label: "Focused specifically on the Bangladesh market" },
];

export function ExperienceSection() {
  return (
    <section className="bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-blue">
              Experience, not theory
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              12+ years of online work experience shaped this framework
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              HOOK wasn&apos;t designed in a workshop. It was refined across years of
              running content, ads, and funnels for real products sold to real
              Bangladeshi customers — learning what actually earns trust and what
              only looks good on paper.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-200 bg-white p-6 text-center"
              >
                <div className="text-2xl font-bold text-brand-navy">{stat.value}</div>
                <div className="mt-2 text-sm text-slate-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
