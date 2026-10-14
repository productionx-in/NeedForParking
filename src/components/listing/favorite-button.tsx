"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "@/app/actions/engagement";
import { buttonClass } from "@/components/ui";

export function FavoriteButton({ listingId, initial, signedIn }: { listingId: string; initial: boolean; signedIn: boolean }) {
  const [fav, setFav] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!signedIn) {
    return <Link href={`/login?next=${encodeURIComponent(`/listings/${listingId}`)}`} className={buttonClass("secondary", "w-full")}>♡ Sign in to save</Link>;
  }
  return (
    <div>
      <button
        type="button"
        aria-pressed={fav}
        disabled={pending}
        className={buttonClass("secondary", "w-full")}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await toggleFavoriteAction(listingId, !fav);
            if (res.ok) setFav(res.data?.favorite ?? !fav);
            else setError(res.error);
          })
        }
      >
        {fav ? "♥ Saved to favorites" : "♡ Save to favorites"}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
