"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/listings", label: "My listings" },
  { href: "/dashboard/requests/incoming", label: "Incoming requests" },
  { href: "/dashboard/requests/mine", label: "My requests" },
  { href: "/dashboard/favorites", label: "Favorites" },
  { href: "/dashboard/account", label: "Account & security" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 sm:flex-col">
        {ITEMS.map((i) => {
          const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
          return (
            <li key={i.href} className="shrink-0">
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cx("block whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium", active ? "bg-brand-700 text-white" : "text-slate-800 hover:bg-slate-100")}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
