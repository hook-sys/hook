import Link from "next/link";

// Also shown for records outside the caller's access (RLS hides them), so nothing leaks.
export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Not found</h1>
      <p className="mt-2 text-sm text-slate-500">This record doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/admin" className="mt-6 inline-block text-sm font-medium text-brand-blue hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
