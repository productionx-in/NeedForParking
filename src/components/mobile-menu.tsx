"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";

export function MobileMenu({ links, signedIn, signOut }: { links: { href: string; label: string }[]; signedIn: boolean; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span> Menu
      </button>
      {open && (
        <nav id={id} aria-label="Mobile" className="absolute inset-x-0 top-16 border-b border-slate-200 bg-white p-4 shadow-lg">
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-medium text-slate-900 hover:bg-slate-100">
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              {signedIn ? (
                <form action={signOut}>
                  <button type="submit" className={buttonClass("secondary", "w-full")}>Sign out</button>
                </form>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className={buttonClass("primary", "w-full")}>Sign in</Link>
              )}
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
