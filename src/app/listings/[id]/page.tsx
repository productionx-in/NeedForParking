import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PhotoGallery } from "@/components/listing/photo-gallery";
import { RequestForm } from "@/components/listing/request-form";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { ReportForm } from "@/components/listing/report-form";
import { MapView } from "@/components/map/map-view";
import { Alert, Badge, buttonClass, Card, DemoBadge } from "@/components/ui";
import { SECURITY_FEATURES } from "@/lib/domain/constants";
import { formatDays, formatHours, formatINR, formatMinDuration, rentalSuffix, vehicleLabel } from "@/lib/domain/format";
import { getListingDetail, isFavorite } from "@/lib/data/listings";
import { getBookedAccess, listMyRequests } from "@/lib/data/requests";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Listing" };
  const detail = await getListingDetail(id);
  return { title: detail ? detail.listing.title : "Listing not found" };
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 sm:flex-row sm:gap-4">
      <dt className="w-48 shrink-0 text-sm font-medium text-slate-600">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  if (!isSupabaseConfigured()) return <SetupNotice what="Listing details" />;

  const detail = await getListingDetail(id);
  if (!detail) notFound();
  const { listing: l, photos, owner } = detail;

  const user = await getSessionUser();
  const isOwner = user?.id === l.owner_id;
  const isPublic = l.status === "published" && l.moderation_status === "ok";

  const favorite = user ? await isFavorite(user.id, l.id) : false;
  let access = null;
  if (user && !isOwner) {
    const mine = await listMyRequests();
    const accepted = mine.find((r) => r.listing_id === l.id && r.status === "accepted");
    if (accepted) access = await getBookedAccess(accepted.id);
  }

  const loginHref = `/login?next=${encodeURIComponent(`/listings/${l.id}`)}`;

  return (
    <article className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
        <Link href="/search" className="underline">Search</Link> <span aria-hidden="true">/</span> {l.locality ?? "Hyderabad"}
      </nav>

      {isOwner && !isPublic && (
        <Alert tone="warning" title={`Preview — this listing is ${l.moderation_status === "suspended" ? "suspended by a moderator" : l.status}`}>
          Only you can see this page.{" "}
          <Link href={`/dashboard/listings/${l.id}/edit`} className="font-semibold underline">Continue editing</Link>
          {l.moderation_note && <span className="block mt-1">Moderator note: {l.moderation_note}</span>}
        </Alert>
      )}
      {l.is_demo && (
        <Alert tone="warning" title="DEMO DATA — fictional listing">
          This listing is a made-up example for previewing the product. It is not real inventory, the address is fictional, and requests are disabled.
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          <PhotoGallery photos={photos} title={l.title} />

          <header>
            <div className="flex flex-wrap gap-2">
              {l.is_demo && <DemoBadge />}
              {l.cover_type && <Badge tone="teal">{l.cover_type === "covered" ? "Covered" : "Open"} parking</Badge>}
              {l.vehicle_types.map((v) => <Badge key={v}>{vehicleLabel(v)}</Badge>)}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{l.title}</h1>
            <p className="mt-1 text-slate-600">{l.locality}, {l.city}{l.postal_code ? ` ${l.postal_code}` : ""}</p>
            <p className="mt-3 text-2xl font-bold">
              {formatINR(l.price_inr)} <span className="text-base font-medium text-slate-600">{rentalSuffix(l.rental_type)}</span>
            </p>
          </header>

          <section aria-labelledby="about">
            <h2 id="about" className="text-lg font-semibold">About this space</h2>
            <p className="mt-2 whitespace-pre-line text-slate-800">{l.description}</p>
          </section>

          <section aria-labelledby="terms">
            <h2 id="terms" className="text-lg font-semibold">Rental terms</h2>
            <dl className="mt-2">
              <Term label="Rental type">{l.rental_type ? l.rental_type[0]!.toUpperCase() + l.rental_type.slice(1) : "—"}</Term>
              <Term label="Minimum rental">{formatMinDuration(l.min_duration, l.rental_type)}</Term>
              <Term label="Security deposit">{Number(l.deposit_inr) > 0 ? formatINR(l.deposit_inr) : "None"}</Term>
              <Term label="Available days">{formatDays(l.available_days)}</Term>
              <Term label="Access hours">{formatHours(l.access_24h, l.available_from, l.available_to)}</Term>
              <Term label="Overnight parking">{l.overnight_allowed ? "Allowed" : "Not allowed"}</Term>
              <Term label="Size limits">
                {l.max_height_m || l.max_length_m
                  ? [l.max_height_m ? `Height up to ${Number(l.max_height_m)} m` : null, l.max_length_m ? `Length up to ${Number(l.max_length_m)} m` : null].filter(Boolean).join(" · ")
                  : "Not specified"}
              </Term>
              {l.vehicle_restrictions && <Term label="Restrictions">{l.vehicle_restrictions}</Term>}
              <Term label="Security">
                {l.security_features.length
                  ? SECURITY_FEATURES.filter((f) => l.security_features.includes(f.value)).map((f) => f.label).join(", ")
                  : "None listed"}
              </Term>
            </dl>
          </section>

          <section aria-labelledby="where">
            <h2 id="where" className="text-lg font-semibold">Location</h2>
            {l.public_landmark && <p className="mt-1 text-slate-800">Near {l.public_landmark}</p>}
            {l.public_address ? (
              <p className="mt-1 text-slate-800">Address shared by the owner: {l.public_address}</p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                The exact address is private. {l.location_privacy === "approximate" ? "The map shows an approximate area only." : "The owner chose to show the exact pin."} The owner shares exact access details after accepting a request.
              </p>
            )}
            {l.latitude !== null && l.longitude !== null && (
              <div className="mt-3">
                <MapView
                  markers={[{ id: l.id, lat: l.latitude, lng: l.longitude, label: "📍", title: l.title, approximate: l.location_privacy === "approximate" }]}
                  selectedId={l.id}
                  ariaLabel={`Map showing ${l.location_privacy === "approximate" ? "the approximate area of" : "the location of"} ${l.title}`}
                  className="h-72"
                  zoom={l.location_privacy === "approximate" ? 14 : 16}
                />
              </div>
            )}
          </section>

          {access && (
            <section aria-labelledby="access" className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
              <h2 id="access" className="text-lg font-semibold text-emerald-950">Your access details</h2>
              <p className="text-sm text-emerald-900">Shared because the owner accepted your request. Keep these private.</p>
              <dl className="mt-3 space-y-2 text-sm">
                {access.address_line && <div><dt className="font-medium">Address</dt><dd>{access.address_line}</dd></div>}
                {access.access_instructions && <div><dt className="font-medium">Access instructions</dt><dd className="whitespace-pre-line">{access.access_instructions}</dd></div>}
                {access.exact_latitude !== null && access.exact_longitude !== null && (
                  <div>
                    <dt className="font-medium">Exact pin</dt>
                    <dd>
                      <a className="underline" rel="noopener noreferrer" target="_blank" href={`https://www.google.com/maps?q=${access.exact_latitude},${access.exact_longitude}`}>
                        Open in maps
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Request and owner information">
          <Card className="p-5">
            <h2 className="text-lg font-semibold">Request this space</h2>
            <div className="mt-3">
              {l.is_demo ? (
                <Alert tone="warning">Demo listings can&apos;t be requested.</Alert>
              ) : isOwner ? (
                <div className="space-y-2">
                  <Alert tone="info">This is your listing.</Alert>
                  <Link href={`/dashboard/listings/${l.id}/edit`} className={buttonClass("secondary", "w-full")}>Edit listing</Link>
                </div>
              ) : !isPublic ? (
                <Alert tone="warning">This listing isn&apos;t accepting requests right now.</Alert>
              ) : !user ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">Sign in with your mobile number to send a request. Browsing never needs an account.</p>
                  <Link href={loginHref} className={buttonClass("primary", "w-full")}>Sign in to request</Link>
                </div>
              ) : !user.phoneVerified ? (
                <Alert tone="warning">Only users with a verified mobile number can send requests. Please sign in again with an SMS code.</Alert>
              ) : (
                <RequestForm listingId={l.id} vehicleTypes={l.vehicle_types} availableDays={l.available_days} />
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">Listed by</h2>
            {owner ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-medium">{owner.display_name}</p>
                <p className="text-slate-600">Member since {new Date(owner.member_since).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
                <p>{owner.phone_verified ? <Badge tone="green">Phone number verified</Badge> : <Badge>Phone not verified</Badge>}</p>
                <p className="pt-1 text-xs text-slate-600">Contact details stay private. Use the request form to get in touch.</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Owner details are not public for this listing.</p>
            )}
          </Card>

          {!isOwner && (
            <div className="space-y-3">
              <FavoriteButton listingId={l.id} initial={favorite} signedIn={Boolean(user)} />
              {user && isPublic && <ReportForm listingId={l.id} />}
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
