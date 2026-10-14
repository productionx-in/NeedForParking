import Link from "next/link";
import { cx } from "@/components/ui";

export function pageWindow(page: number, totalPages: number, span = 2): (number | "…")[] {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - span; p <= page + span; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page: number) => string }) {
  if (totalPages <= 1) return null;
  const item = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-medium";
  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={cx(item, "border-slate-300 bg-white hover:bg-slate-100")}>← Previous</Link>
      ) : (
        <span aria-disabled="true" className={cx(item, "border-slate-200 text-slate-500")}>← Previous</span>
      )}
      {pageWindow(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-slate-500">…</span>
        ) : (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            className={cx(item, p === page ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white hover:bg-slate-100")}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={cx(item, "border-slate-300 bg-white hover:bg-slate-100")}>Next →</Link>
      ) : (
        <span aria-disabled="true" className={cx(item, "border-slate-200 text-slate-500")}>Next →</span>
      )}
    </nav>
  );
}
