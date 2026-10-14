import Link from "next/link";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { getSessionUser, getProfile } from "@/lib/auth/session";
import { getMyListings } from "@/lib/data/listings";
import { listIncomingRequests, listMyRequests } from "@/lib/data/requests";

export default async function DashboardHome() {
  const user = (await getSessionUser())!;
  const [profile, listings, incoming, mine] = await Promise.all([getProfile(user.id), getMyListings(user.id), listIncomingRequests(), listMyRequests()]);
  const stats = [
    { label: "Published listings", value: listings.filter((l) => l.status === "published").length, href: "/dashboard/listings" },
    { label: "Requests awaiting your reply", value: incoming.filter((r) => r.status === "pending").length, href: "/dashboard/requests/incoming" },
    { label: "Your pending requests", value: mine.filter((r) => r.status === "pending").length, href: "/dashboard/requests/mine" },
  ];
  return (
    <>
      <PageHeader title={`Welcome${profile?.display_name ? `, ${profile.display_name}` : ""}`} description="Manage your listings and requests." actions={<Link href="/dashboard/listings/new" className={buttonClass("primary")}>List a space</Link>} />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="p-5 hover:border-brand-700">
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-sm text-slate-600">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>
      {!profile?.display_name && (
        <p className="mt-6 text-sm text-slate-700">Tip: add a display name in your <Link href="/dashboard/profile" className="font-semibold underline">profile</Link> so owners know who they&apos;re talking to.</p>
      )}
    </>
  );
}
