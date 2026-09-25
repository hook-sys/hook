const STEPS = [
  {
    step: "01",
    title: "Diagnose",
    body: "We review your current funnel, content, and buyer feedback to find where Bangladeshi customers hesitate or drop off.",
  },
  {
    step: "02",
    title: "Rebuild with HOOK",
    body: "We restructure your content funnel stage by stage — Hook, Feature, Trust, Offer, Gift — around local buying psychology.",
  },
  {
    step: "03",
    title: "Run & Measure",
    body: "Campaigns go live with clear tracking, so decisions are based on what's actually converting, not guesswork.",
  },
  {
    step: "04",
    title: "Compound Growth",
    body: "We shift focus from one-time sales to repeat customers and referrals — the foundation of a profitable business.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          How HOOK works
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-4">
          {STEPS.map((item) => (
            <div key={item.step}>
              <span className="text-sm font-bold text-brand-red">{item.step}</span>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
