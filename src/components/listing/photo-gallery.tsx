"use client";

import Image from "next/image";
import { useState } from "react";
import { listingPhotoUrl } from "@/lib/env";
import { cx } from "@/components/ui";

export function PhotoGallery({ photos, title }: { photos: { id: string; storage_path: string }[]; title: string }) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) {
    return (
      <div role="img" aria-label="No photos have been added to this listing" className="grid aspect-[16/10] place-items-center rounded-xl border border-slate-200 bg-slate-100 text-slate-600">
        No photos yet
      </div>
    );
  }
  const current = photos[index] ?? photos[0]!;
  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <Image src={listingPhotoUrl(current.storage_path)} alt={`${title} — photo ${index + 1} of ${photos.length}`} fill priority sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
      </div>
      {photos.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Photo thumbnails">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-pressed={i === index}
                className={cx("relative block h-16 w-24 overflow-hidden rounded-lg border-2", i === index ? "border-brand-700" : "border-transparent")}
              >
                <Image src={listingPhotoUrl(p.storage_path)} alt="" fill sizes="96px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
