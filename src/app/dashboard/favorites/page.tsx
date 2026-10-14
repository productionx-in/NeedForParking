import Link from "next/link";
import { buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { ListingCard } from "@/components/listing/listing-card";
import { getSessionUser } from "@/lib/auth/session";
import { getFavoriteListings } from "@/lib/data/listings";

export default async function FavoritesPage() {
  const user = (await getSessionUser())!;
  const items = await getFavoriteListings(user.id);
  return (
    <>
      <PageHeader title="Favorites" description="Spaces you've saved. Listings that are paused or removed drop off automatically." />
      {items.length === 0 ? (
        <EmptyState title="No favorites yet" action={<Link href="/search" className={buttonClass("primary")}>Browse listings</Link>}>
          Tap “Save to favorites” on any listing to keep it here.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((l) => <li key={l.id}><ListingCard listing={l} /></li>)}</ul>
      )}
    </>
  );
}
