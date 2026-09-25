const SERVICES = [
  { title: "Content Funnel Strategy", body: "HOOK-based funnel design mapped to your product and audience." },
  { title: "Paid Ad Management", body: "Campaign structure, creative direction, and budget management on Meta." },
  { title: "Content Production Direction", body: "Guidance on the content that fills each HOOK stage — Hook, Feature, Trust." },
  { title: "Offer & Positioning", body: "Refining how your product is presented so the offer feels clear and credible." },
  { title: "Performance Reporting", body: "Ongoing visibility into what's working, so decisions are based on data." },
  { title: "Growth Roadmapping", body: "A plan for moving from one-time sales to a repeat-customer business." },
];

export function ServicesSection() {
  return (
    <section className="bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          What Hook Marketing works on
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <div key={service.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-base font-semibold text-slate-900">{service.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{service.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
