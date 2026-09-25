import Link from "next/link";
import { LoginForm } from "@/components/admin/LoginForm";

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/admin";

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Hook<span className="text-brand-red">Marketing</span>
          </span>
          <p className="mt-1 text-sm text-slate-500">Command Center Admin Login</p>
        </div>
        {params.reset === "success" && (
          <p role="status" className="mb-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Password updated. Sign in with your new password.
          </p>
        )}
        <LoginForm next={next} />
        <Link href="/auth/forgot-password" className="mt-5 block text-center text-sm text-brand-blue hover:underline">
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
