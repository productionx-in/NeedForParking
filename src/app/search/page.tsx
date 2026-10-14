import type { Metadata } from "next";
import Link from "next/link";
import { FilterForm } from "@/components/search/filter-form";
import { ResultsExplorer } from "@/components/search/results-explorer";
import { Pagination } from "@/components/search/pagination";
import { SetupNotice } from "@/components/setup-notice";
import { Alert, buttonClass, EmptyState, cx } from "@/components/ui";
import { searchListings } from "@/lib/data/listings";
import { formatRadius } from "@/lib/domain/format";
import { buildSearchQuery, parseSearchParams, resolveDestination, activeFilterCount } from "@/lib/validation/search";

export const metadata: Metadata = { title: "Find parking in Hyderabad" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseSearchParams(await searchParams);
  const outcome = await searchListings(filters);
  const destination = resolveDestination(filters);
  const q = (o: Record<string, string | number | null>) => `/search${buildSearchQuery(filters, o)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Find parking in Hyderabad</h1>
        <p className="mt-1 text-slate-600">Browse private and underused spaces. No account needed to look around.</p>
      </div>

      <FilterForm filters={filters} />

      {outcome.status === "unconfigured" && <SetupNotice what="Search" />}

      {outcome.status === "error" && (
        <Alert tone="error" title="Couldn't load listings">
          {outcome.message}{" "}
          <Link href={q({})} className="font-semibold underline">Try again</Link>
        </Alert>
      )}

      {outcome.status === "ok" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-slate-700" data-testid="result-count">
              <strong>{outcome.total}</strong> {outcome.total === 1 ? "listing" : "listings"}
              {destination && <> near <strong>{destination.label}</strong> (within {formatRadius(filters.radiusM)} walk)</>}
            </p>
            <div role="group" aria-label="Results view" className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
              {(["list", "map"] as const).map((v) => (
                <Link
                  key={v}
                  href={q({ view: v === "list" ? null : v, page: null })}
                  aria-current={filters.view === v ? "true" : undefined}
                  className={cx("min-h-11 px-4 py-2.5 text-sm font-semibold", filters.view === v ? "bg-brand-700 text-white" : "text-slate-800 hover:bg-slate-100")}
                >
                  {v === "list" ? "List" : "Map"}
                </Link>
              ))}
            </div>
          </div>

          {outcome.items.some((i) => i.is_demo) && (
            <Alert tone="warning" title="Includes demo data">
              Listings tagged <strong>DEMO DATA</strong> are fictional examples used to preview the product. They are not real inventory and can&apos;t be booked.
            </Alert>
          )}

          {outcome.items.length === 0 ? (
            <EmptyState
              title="No listings match your search"
              action={activeFilterCount(filters) > 0 || filters.q ? <Link href="/search" className={buttonClass("primary")}>Clear filters</Link> : <Link href="/dashboard/listings/new" className={buttonClass("primary")}>List your space</Link>}
            >
              {activeFilterCount(filters) > 0 || filters.q
                ? "Try removing a filter, widening the price range, or searching a nearby locality."
                : "There are no published listings yet. Be the first to share a space, or ask the project team to load the optional demo data."}
            </EmptyState>
          ) : (
            <>
              <ResultsExplorer items={outcome.items} view={filters.view} filters={filters} destination={destination ? { lat: destination.lat, lng: destination.lng } : null} />
              <Pagination page={filters.page} totalPages={Math.max(1, Math.ceil(outcome.total / outcome.pageSize))} hrefFor={(p) => q({ page: p === 1 ? null : p })} />
            </>
          )}
        </>
      )}
    </div>
  );
}
