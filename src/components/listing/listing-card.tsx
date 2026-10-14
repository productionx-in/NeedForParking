import Link from "next/link";
import type { SearchRow } from "@/lib/types";
import { Badge, DemoBadge, cx } from "@/components/ui";
import { ListingPhoto } from "@/components/listing/listing-photo";
import { formatDays, formatHours, formatINR, rentalSuffix, vehicleLabel } from "@/lib/domain/format";

type Props = {
  listing: SearchRow;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** Extra controls rendered under the card body (e.g. favorite button). */
  footer?: React.ReactNode;
};

export function ListingCard({ listing: l, selected = false, onSelect, footer }: Props) {
  return (
    <article
      id={`card-${l.id}`}
      data-testid="listing-card"
      aria-current={selected ? "true" : undefined}
      onMouseEnter={onSelect ? () => onSelect(l.id) : undefined}
      className={cx(
        "group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md",
        selected ? "border-brand-700 ring-2 ring-brand-700" : "border-slate-200",
      )}
    >
      <div className="relative aspect-[4/3] bg-slate-100">
        <Link href={`/listings/${l.id}`} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
          <ListingPhoto path={l.cover_photo_path} alt="" />
        </Link>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          {l.is_demo && <DemoBadge />}
          {l.cover_type && <Badge tone="teal">{l.cover_type === "covered" ? "Covered" : "Open"}</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="text-base font-semibold leading-snug text-slate-900">
            <Link href={`/listings/${l.id}`} className="hover:underline">
              {l.title}
            </Link>
          </h3>
          <p className="text-sm text-slate-600">
            {l.locality ?? "Hyderabad"}, {l.city}
            {l.distance_km !== null && l.distance_km !== undefined && <span> · {l.distance_km.toFixed(1)} km away</span>}
          </p>
        </div>
        <p className="text-lg font-bold text-slate-900">
          {formatINR(l.price_inr)} <span className="text-sm font-medium text-slate-600">{rentalSuffix(l.rental_type)}</span>
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Accepted vehicles">
          {l.vehicle_types.map((v) => (
            <li key={v}><Badge>{vehicleLabel(v)}</Badge></li>
          ))}
        </ul>
        <p className="text-sm text-slate-700">
          <span className="font-medium">{formatDays(l.available_days)}</span> · {formatHours(l.access_24h, l.available_from, l.available_to)}
          {l.overnight_allowed && <span> · Overnight OK</span>}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          {l.is_open_now ? <Badge tone="green">Available now (IST)</Badge> : <Badge>Check availability</Badge>}
          {l.latitude !== null && l.location_privacy === "approximate" && <span className="text-xs text-slate-600">Approximate location</span>}
        </div>
        {footer}
      </div>
    </article>
  );
}
