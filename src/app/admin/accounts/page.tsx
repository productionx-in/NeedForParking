import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { AccountStatusActions } from "@/components/admin/admin-actions";
import { listAccounts } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/domain/format";
import { buttonClass } from "@/components/ui";

export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; owner?: string }> }) {
  const { q = "", owner } = await searchParams;
  let accounts = await listAccounts(q);
  if (owner) accounts = accounts.filter((a) => a.id === owner);
  return (
    <>
      <PageHeader title="Accounts" description="Suspending an account hides all of its listings and blocks it from creating listings, requests or reports." />
      <form method="get" className="mb-4 flex max-w-md gap-2" role="search" aria-label="Search accounts">
        <label htmlFor="acct-q" className="sr-only">Search by display name</label>
        <Input id="acct-q" name="q" defaultValue={q} placeholder="Search by display name" />
        <button className={buttonClass("secondary")} type="submit">Search</button>
      </form>
      {accounts.length === 0 ? (
        <EmptyState title="No accounts match">Try a different name.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {accounts.map((a) => (
            <li key={a.id}>
              <Card className="space-y-3 p-4" data-testid="account">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{a.display_name || "(no name)"}</span>
                  {a.role === "admin" && <Badge tone="blue">Admin</Badge>}
                  <Badge tone={a.account_status === "active" ? "green" : "red"}>{a.account_status}</Badge>
                  <span className="text-xs text-slate-600">Joined {formatDateTime(a.created_at)}</span>
                </div>
                {a.suspension_reason && <p className="text-sm text-slate-700">Reason: {a.suspension_reason}</p>}
                <p className="font-mono text-xs text-slate-500">{a.id}</p>
                <AccountStatusActions userId={a.id} suspended={a.account_status === "suspended"} isAdmin={a.role === "admin"} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
