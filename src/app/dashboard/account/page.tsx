import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { AccountActions } from "@/components/dashboard/account-actions";
import { getProfile, getSessionUser } from "@/lib/auth/session";
import { maskPhone } from "@/lib/auth/phone";

export default async function AccountPage() {
  const user = (await getSessionUser())!;
  const profile = await getProfile(user.id);
  return (
    <>
      <PageHeader title="Account & security" description="Your sign-in method and active sessions." />
      {profile?.account_status === "suspended" && (
        <Alert tone="error" title="Your account is suspended" className="mb-4">
          {profile.suspension_reason ?? "A moderator suspended this account."} While suspended you can&apos;t create listings or requests, and your listings are hidden.
        </Alert>
      )}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Sign-in</h2>
          <p className="mt-1 text-sm text-slate-700">One-time SMS code to {maskPhone(user.phone)} {user.phoneVerified && <Badge tone="green">Verified</Badge>}</p>
          <p className="mt-1 text-xs text-slate-600">There is no password to steal. Never share an SMS code with anyone — we will never ask for it.</p>
        </div>
        <AccountActions />
      </Card>
      <Card className="mt-6 space-y-2 p-5 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">Your data</h2>
        <p>Your phone number is stored by the authentication provider and is never copied into public tables. Account deletion isn&apos;t self-service in this prototype — contact the project team to have your account and listings removed.</p>
      </Card>
    </>
  );
}
