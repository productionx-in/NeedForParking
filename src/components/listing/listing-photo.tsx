import Image from "next/image";
import { listingPhotoUrl } from "@/lib/env";

export function ListingPhoto({ path, alt, sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw", priority = false }: { path: string | null; alt: string; sizes?: string; priority?: boolean }) {
  if (!path) {
    return (
      <div className="grid h-full w-full place-items-center bg-slate-100 text-sm text-slate-600" role="img" aria-label="No photo available">
        No photo yet
      </div>
    );
  }
  return <Image src={listingPhotoUrl(path)} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />;
}
