import Link from "next/link";
import { buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { MyRequestCard } from "@/components/dashboard/request-cards";
import { listMyRequests } from "@/lib/data/requests";

export default async function MyRequestsPage() {
  const requests = await listMyRequests();
  return (
    <>
      <PageHeader title="My requests" description="Requests you've sent to space owners." />
      {requests.length === 0 ? (
        <EmptyState title="You haven't requested a space yet" action={<Link href="/search" className={buttonClass("primary")}>Find parking</Link>}>
          Found something that fits? Open the listing and send a request.
        </EmptyState>
      ) : (
        <ul className="space-y-4">{requests.map((r) => <li key={r.id}><MyRequestCard r={r} /></li>)}</ul>
      )}
    </>
  );
}
