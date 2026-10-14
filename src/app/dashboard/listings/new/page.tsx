import { Alert, PageHeader } from "@/components/ui";
import { ListingWizard } from "@/components/wizard/listing-wizard";
import { getSessionUser } from "@/lib/auth/session";

export default async function NewListingPage() {
  const user = (await getSessionUser())!;
  return (
    <>
      <PageHeader title="List a space" description="Six short steps. Your progress is saved as a draft along the way." />
      {!user.phoneVerified && <Alert tone="warning" className="mb-4">Your mobile number isn&apos;t verified, so you can&apos;t create listings. Sign in again with an SMS code.</Alert>}
      <ListingWizard listingId={null} />
    </>
  );
}
