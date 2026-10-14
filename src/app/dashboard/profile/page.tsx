import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { getProfile, getSessionUser } from "@/lib/auth/session";
import { maskPhone } from "@/lib/auth/phone";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = (await getSessionUser())!;
  const profile = await getProfile(user.id);
  const { welcome } = await searchParams;
  return (
    <>
      <PageHeader title="Profile" description="How you appear to other people on the platform." />
      {welcome && <Alert tone="success" title="Welcome!" className="mb-4">Your number is verified. Add a display name so owners know who&apos;s asking.</Alert>}
      <Card className="mb-6 p-5">
        <p className="text-sm text-slate-600">Mobile number</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 font-medium">
          {maskPhone(user.phone)} {user.phoneVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}
        </p>
        <p className="mt-1 text-xs text-slate-600">Your number is never shown to other users.</p>
      </Card>
      <Card className="p-5">
        <ProfileForm displayName={profile?.display_name ?? ""} email={profile?.email ?? ""} />
      </Card>
    </>
  );
}
