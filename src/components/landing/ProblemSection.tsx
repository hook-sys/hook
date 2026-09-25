const PROBLEMS = [
  {
    title: "Traffic without trust",
    body: "Ads bring visitors, but Bangladeshi buyers rarely purchase from a brand they don't trust yet — no matter how good the offer looks.",
  },
  {
    title: "One-time buyers, not customers",
    body: "Many stores optimize for a single sale instead of building the repeat-purchase relationship that actually makes e-commerce profitable.",
  },
  {
    title: "Copy-pasted funnels",
    body: "Funnel templates built for Western buying habits often skip the reassurance steps Bangladeshi customers expect before they pay.",
  },
];

export function ProblemSection() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          The real e-commerce problem
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Most stores don&apos;t fail because of a bad product. They fail because the
          funnel around the product wasn&apos;t built for the customer in front of it.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PROBLEMS.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
