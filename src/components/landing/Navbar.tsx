import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-brand-navy/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <span className="text-lg font-bold tracking-tight text-white">
          Hook<span className="text-brand-red">Marketing</span>
        </span>
        <Link
          href="#apply"
          className="rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark"
        >
          Apply for Assessment
        </Link>
      </div>
    </header>
  );
}
