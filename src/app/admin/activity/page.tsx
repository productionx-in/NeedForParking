import { Card, EmptyState, PageHeader } from "@/components/ui";
import { listAudit } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/domain/format";

export default async function AdminActivityPage() {
  const rows = await listAudit();
  return (
    <>
      <PageHeader title="Activity log" description="The 30 most recent admin actions." />
      {rows.length === 0 ? (
        <EmptyState title="Nothing yet">Admin actions are recorded here.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <span className="font-semibold">{r.action}</span> · {r.target_type} <span className="font-mono text-xs text-slate-500">{r.target_id.slice(0, 8)}</span>
                {r.note && <span className="text-slate-700"> — {r.note}</span>}
                <span className="block text-xs text-slate-500">{formatDateTime(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
