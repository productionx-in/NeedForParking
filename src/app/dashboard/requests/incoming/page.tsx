import { EmptyState, PageHeader } from "@/components/ui";
import { IncomingRequestCard } from "@/components/dashboard/request-cards";
import { listIncomingRequests } from "@/lib/data/requests";

export default async function IncomingRequestsPage() {
  const requests = await listIncomingRequests();
  const pending = requests.filter((r) => r.status === "pending").length;
  return (
    <>
      <PageHeader title="Incoming requests" description={pending ? `${pending} awaiting your reply.` : "Requests for your listings appear here."} />
      {requests.length === 0 ? (
        <EmptyState title="No requests yet">When someone asks to use one of your spaces, you&apos;ll see it here and can accept or decline.</EmptyState>
      ) : (
        <ul className="space-y-4">{requests.map((r) => <li key={r.id}><IncomingRequestCard r={r} /></li>)}</ul>
      )}
    </>
  );
}
