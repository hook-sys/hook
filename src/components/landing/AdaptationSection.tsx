const CONTRASTS = [
  {
    international: "Assumes buyers already trust online payments and unfamiliar brands.",
    bangladesh: "Trust is earned step by step — social proof, real faces, and clear reassurance matter more.",
  },
  {
    international: "Optimizes for a single high-intent landing page and checkout.",
    bangladesh: "Buyers compare, ask questions on Facebook/Messenger, and decide over multiple touchpoints.",
  },
  {
    international: "Treats price objections as the main barrier to purchase.",
    bangladesh: "Risk and authenticity concerns often outweigh price in the decision.",
  },
];

export function AdaptationSection() {
  return (
    <section className="bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          Why generic international funnels may need Bangladesh adaptation
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Funnel principles from international case studies are useful — but customer
          psychology, trust behavior, and buying decisions in Bangladesh follow a
          different pattern.
        </p>
        <div className="mt-12 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-2 border-b border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700 md:grid">
            <div className="px-6 py-3">International Funnel Assumption</div>
            <div className="px-6 py-3 text-brand-blue">Bangladesh Market Reality</div>
          </div>
          {CONTRASTS.map((row) => (
            <div
              key={row.international}
              className="grid grid-cols-1 gap-3 border-b border-slate-100 p-6 text-sm last:border-0 md:grid-cols-2 md:gap-0 md:p-0"
            >
              <div className="text-slate-500 md:px-6 md:py-4">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                  International
                </span>
                {row.international}
              </div>
              <div className="font-medium text-slate-900 md:px-6 md:py-4">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-blue md:hidden">
                  Bangladesh
                </span>
                {row.bangladesh}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
