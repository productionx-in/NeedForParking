import { notFound } from "next/navigation";
import { z } from "zod";
import { Alert, PageHeader } from "@/components/ui";
import { ListingStatusBadge } from "@/components/status-badge";
import { ListingWizard } from "@/components/wizard/listing-wizard";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnerListingForEdit } from "@/lib/data/listings";
import { toFormValues } from "@/lib/validation/listing";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = (await getSessionUser())!;
  // Scoped to the signed-in owner; RLS enforces the same on the database side.
  const data = await getOwnerListingForEdit(id, user.id);
  if (!data || data.listing.status === "removed") notFound();
  const { listing, details, photos } = data;
  return (
    <>
      <PageHeader title="Edit listing" description={listing.title || "Untitled draft"} actions={<ListingStatusBadge status={listing.status} moderation={listing.moderation_status} />} />
      {listing.moderation_status === "suspended" && (
        <Alert tone="error" title="Suspended by a moderator" className="mb-4">{listing.moderation_note ?? "This listing is hidden from the public."}</Alert>
      )}
      <ListingWizard
        listingId={listing.id}
        initialValues={toFormValues(listing, details)}
        initialPhotos={photos.map((p) => ({ id: p.id, storage_path: p.storage_path }))}
        status={listing.status as "draft" | "published" | "paused"}
      />
    </>
  );
}
