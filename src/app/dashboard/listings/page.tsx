import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { ListingPhoto } from "@/components/listing/listing-photo";
import { ListingStatusBadge } from "@/components/status-badge";
import { ListingRowActions } from "@/components/dashboard/listing-row-actions";
import { getSessionUser } from "@/lib/auth/session";
import { getMyListings } from "@/lib/data/listings";
import { formatINR, rentalSuffix } from "@/lib/domain/format";

export default async function MyListingsPage() {
  const user = (await getSessionUser())!;
  const listings = await getMyListings(user.id);
  return (
    <>
      <PageHeader title="My listings" description="Create, edit, pause and remove your own spaces." actions={<Link href="/dashboard/listings/new" className={buttonClass("primary")}>List a space</Link>} />
      {listings.length === 0 ? (
        <EmptyState title="You haven't listed a space yet" action={<Link href="/dashboard/listings/new" className={buttonClass("primary")}>Create your first listing</Link>}>
          It takes a few minutes. You decide the hours, the price, and how much location detail the public sees.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {listings.map((l) => (
            <li key={l.id}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row">
                <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:w-48">
                  <ListingPhoto path={l.cover_photo_path} alt="" sizes="192px" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{l.title || "Untitled draft"}</h2>
                    <ListingStatusBadge status={l.status} moderation={l.moderation_status} />
                    {l.is_demo && <Badge tone="amber">Demo</Badge>}
                  </div>
                  <p className="text-sm text-slate-600">
                    {l.locality ?? "No locality yet"} · {l.price_inr ? `${formatINR(l.price_inr)} ${rentalSuffix(l.rental_type)}` : "No price yet"} · {l.photo_count} photo{l.photo_count === 1 ? "" : "s"}
                  </p>
                  {l.moderation_status === "suspended" && (
                    <p className="text-sm text-red-800">A moderator suspended this listing{l.moderation_note ? `: ${l.moderation_note}` : "."} It is hidden from the public.</p>
                  )}
                  <ListingRowActions id={l.id} status={l.status} suspended={l.moderation_status === "suspended"} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
