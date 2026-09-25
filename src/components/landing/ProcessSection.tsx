const PHASES = [
  { title: "Assessment", body: "We evaluate your business, funnel, and market fit before recommending anything." },
  { title: "Foundation", body: "HOOK-based funnel structure and content direction are put in place." },
  { title: "Optimization", body: "Campaigns are refined using real performance data, not assumptions." },
  { title: "Scale", body: "What works is scaled deliberately, with profitability as the guide." },
];

export function ProcessSection() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          A growth process, not a one-off campaign
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Building a profitable e-commerce business takes structure. Here&apos;s the
          process behind every HOOK engagement.
        </p>
        <ol className="mt-12 space-y-6">
          {PHASES.map((phase, index) => (
            <li key={phase.title} className="flex gap-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-bold text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{phase.title}</h3>
                <p className="mt-1 text-slate-600">{phase.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
