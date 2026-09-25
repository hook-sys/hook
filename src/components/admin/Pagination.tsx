import Link from "next/link";

function buildHref(params: Record<string, string>, page: number) {
  const search = new URLSearchParams({ ...params, page: String(page) });
  return `?${search.toString()}`;
}

export function Pagination({
  page,
  pageSize,
  total,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  params: Record<string, string>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
      <span>
        Page {page} of {totalPages} &middot; {total} leads
      </span>
      <div className="flex gap-2">
        <Link
          aria-disabled={page <= 1}
          className={`rounded-md border px-3 py-1.5 ${
            page <= 1
              ? "pointer-events-none border-slate-100 text-slate-300"
              : "border-slate-300 hover:bg-slate-50"
          }`}
          href={buildHref(params, Math.max(1, page - 1))}
        >
          Previous
        </Link>
        <Link
          aria-disabled={page >= totalPages}
          className={`rounded-md border px-3 py-1.5 ${
            page >= totalPages
              ? "pointer-events-none border-slate-100 text-slate-300"
              : "border-slate-300 hover:bg-slate-50"
          }`}
          href={buildHref(params, Math.min(totalPages, page + 1))}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
