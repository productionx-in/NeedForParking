import Link from "next/link";
import { getSessionUser, getProfile } from "@/lib/auth/session";
import { signOutAction } from "@/app/actions/auth";
import { PROJECT_LABEL } from "@/lib/domain/constants";
import { buttonClass } from "@/components/ui";
import { MobileMenu } from "@/components/mobile-menu";

export async function SiteHeader() {
  const user = await getSessionUser();
  const profile = user ? await getProfile(user.id) : null;
  const links = [
    { href: "/search", label: "Find parking" },
    { href: "/search?view=map", label: "Map" },
    ...(user ? [{ href: "/dashboard/listings", label: "My listings" }, { href: "/dashboard", label: "Dashboard" }] : []),
    ...(profile?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-brand-700 text-sm text-white">P</span>
          <span className="hidden sm:inline">{PROJECT_LABEL}</span>
          <span className="sm:hidden">Parking Research</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <form action={signOutAction}>
              <button type="submit" className={buttonClass("secondary")}>Sign out</button>
            </form>
          ) : (
            <Link href="/login" className={buttonClass("primary")}>Sign in</Link>
          )}
        </div>
        <MobileMenu links={links} signedIn={Boolean(user)} signOut={signOutAction} />
      </div>
    </header>
  );
}
