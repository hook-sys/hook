export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 md:flex-row">
        <span className="font-semibold text-slate-900">
          Hook<span className="text-brand-red">Marketing</span>
        </span>
        <p>&copy; {new Date().getFullYear()} Hook Marketing. All rights reserved.</p>
      </div>
    </footer>
  );
}
