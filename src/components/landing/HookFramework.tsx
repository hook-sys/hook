const STAGES = [
  {
    letter: "H",
    name: "Hook",
    body: "Capture attention with a message built around a real, local pain point — not a generic ad template. The first few seconds decide whether a Bangladeshi viewer stays or scrolls past.",
  },
  {
    letter: "A",
    name: "Feature",
    body: "Show the product doing its job clearly and honestly. Bangladeshi buyers scrutinize product proof more than polished branding.",
  },
  {
    letter: "T",
    name: "Trust",
    body: "Layer in social proof, real reviews, delivery transparency, and responsive presence — the reassurance step most funnels skip, and the one local buyers need most.",
  },
  {
    letter: "O",
    name: "Offer",
    body: "Present a clear, honest offer that removes hesitation without relying on artificial urgency or unrealistic promises.",
  },
  {
    letter: "G",
    name: "Gift",
    body: "Add a value-driven incentive that rewards the decision to buy now and opens the door to repeat purchases.",
  },
];

export function HookFramework() {
  return (
    <section id="hook-framework" className="bg-brand-navy py-20 text-white">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-300">
          The Framework
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
          The HOOK Framework
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          Five stages, adapted to Bangladesh market psychology, designed to move a
          visitor from first attention to a returning customer.
        </p>
        <div className="mt-14 grid gap-5 md:grid-cols-5">
          {STAGES.map((stage) => (
            <div
              key={stage.letter}
              className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur"
            >
              <span className="text-3xl font-bold text-brand-red">{stage.letter}</span>
              <h3 className="mt-3 text-lg font-semibold">{stage.name}</h3>
              <p className="mt-2 text-sm text-slate-300">{stage.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
