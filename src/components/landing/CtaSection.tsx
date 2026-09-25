import Link from "next/link";

export function CtaSection() {
  return (
    <section className="bg-brand-navy py-20 text-white">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Ready to see if HOOK fits your business?
        </h2>
        <p className="mt-4 text-lg text-slate-300">
          Apply for a free business assessment and our team will review your current
          situation before recommending anything.
        </p>
        <div className="mt-8">
          <Link
            href="#apply"
            className="inline-flex rounded-md bg-brand-red px-8 py-4 text-base font-semibold text-white shadow-lg shadow-red-900/30 transition-colors hover:bg-brand-red-dark"
          >
            Apply for a Business Assessment
          </Link>
        </div>
      </div>
    </section>
  );
}
