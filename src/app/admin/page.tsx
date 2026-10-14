import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { ReportActions } from "@/components/admin/admin-actions";
import { listReports } from "@/lib/data/admin";
import { REPORT_REASONS } from "@/lib/domain/constants";
import { formatDateTime } from "@/lib/domain/format";

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = status === "closed" || status === "all" ? status : "open";
  const reports = await listReports(filter);
  return (
    <>
      <PageHeader title="Reported listings" />
      <div className="mb-4 flex gap-2" role="group" aria-label="Filter reports">
        {(["open", "closed", "all"] as const).map((s) => (
          <Link key={s} href={s === "open" ? "/admin" : `/admin?status=${s}`} aria-current={filter === s ? "true" : undefined} className={cx("rounded-lg border px-3 py-2 text-sm font-medium", filter === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white")}>
            {s[0]!.toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>
      {reports.length === 0 ? (
        <EmptyState title={filter === "open" ? "No open reports" : "No reports found"}>Reports from users will appear here.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li key={r.id}>
              <Card className="space-y-3 p-4" data-testid="report">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.status === "open" ? "amber" : r.status === "actioned" ? "green" : "neutral"}>{r.status}</Badge>
                  <Badge tone="red">{REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</Badge>
                  {r.listing?.moderation_status === "suspended" && <Badge tone="red">Listing suspended</Badge>}
                  {r.listing?.is_demo && <Badge tone="amber">Demo</Badge>}
                  <span className="text-xs text-slate-600">{formatDateTime(r.created_at)}</span>
                </div>
                <p className="font-semibold">
                  {r.listing ? <Link className="underline" href={`/listings/${r.listing.id}`}>{r.listing.title || "Untitled"}</Link> : "Listing unavailable"}
                  <span className="font-normal text-slate-600"> · {r.listing?.locality ?? "—"} · {r.listing?.status}</span>
                </p>
                {r.details && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm">{r.details}</p>}
                {r.resolution_note && <p className="text-sm text-slate-600">Resolution: {r.resolution_note}</p>}
                {r.listing && <ReportActions reportId={r.id} listingId={r.listing.id} listingSuspended={r.listing.moderation_status === "suspended"} open={r.status === "open"} />}
                {r.listing && <p className="text-xs text-slate-600">Owner account: <Link className="underline" href={`/admin/accounts?owner=${r.listing.owner_id}`}>review</Link></p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
