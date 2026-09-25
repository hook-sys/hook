import { ApplicationForm } from "@/components/landing/ApplicationForm";

export function ApplicationFormSection() {
  return (
    <section id="apply" className="bg-slate-50 py-20">
      <div className="mx-auto max-w-2xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Apply for a Business Assessment
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Share a few details about your business. Our team will review it and get
            back to you.
          </p>
        </div>
        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
          <ApplicationForm />
        </div>
      </div>
    </section>
  );
}
