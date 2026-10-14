"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "Reports" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/activity", label: "Activity log" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="mb-6 flex flex-wrap gap-2">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={pathname === i.href ? "page" : undefined} className={cx("min-h-11 rounded-lg px-4 py-2.5 text-sm font-semibold", pathname === i.href ? "bg-slate-900 text-white" : "border border-slate-300 bg-white")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
