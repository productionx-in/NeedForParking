import Link from "next/link";
import { SetupNotice } from "@/components/setup-notice";
import { ListingCard } from "@/components/listing/listing-card";
import { Alert, buttonClass, Field, Input, Select } from "@/components/ui";
import { HYDERABAD_LOCALITIES } from "@/lib/domain/localities";
import { searchListings } from "@/lib/data/listings";
import { parseSearchParams } from "@/lib/validation/search";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const QUICK = ["Madhapur", "Kondapur", "Gachibowli", "Ameerpet", "HITEC City", "Banjara Hills"];

export default async function HomePage() {
  const latest = await searchListings(parseSearchParams({}), 6);

  return (
    <div className="space-y-14">
      <section className="rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 px-5 py-10 text-white sm:px-10 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">Research prototype · Hyderabad</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">Find a private parking space near where you&apos;re going</h1>
        <p className="mt-3 max-w-2xl text-brand-50">Browse driveways, society slots and office bays that sit empty for part of the day. No account needed to look.</p>
        <form action="/search" method="get" role="search" aria-label="Search parking" className="mt-6 grid gap-3 rounded-xl bg-white p-4 text-slate-900 shadow-lg sm:grid-cols-[2fr_1.4fr_auto]">
          <Field id="home-q" label="Locality or title">
            <Input id="home-q" name="q" type="search" placeholder="e.g. Madhapur" maxLength={80} />
          </Field>
          <Field id="home-near" label="Near area">
            <Select id="home-near" name="near" defaultValue="">
              <option value="">Anywhere in Hyderabad</option>
              {HYDERABAD_LOCALITIES.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <button type="submit" className={buttonClass("primary", "w-full sm:w-auto")}>Search</button>
          </div>
        </form>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Popular areas">
          {QUICK.map((name) => (
            <li key={name}>
              <Link href={`/search?near=${encodeURIComponent(name)}&sort=distance`} className="inline-flex min-h-9 items-center rounded-full border border-white/40 px-3 text-sm font-medium text-white hover:bg-white/10">
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="latest">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="latest" className="text-xl font-bold sm:text-2xl">Latest listings</h2>
          <Link href="/search" className="text-sm font-semibold text-brand-800 underline">View all</Link>
        </div>
        {!isSupabaseConfigured() && <SetupNotice what="The homepage listings" />}
        {latest.status === "error" && <Alert tone="error">{latest.message}</Alert>}
        {latest.status === "ok" && latest.items.length === 0 && (
          <Alert tone="info" title="No listings yet">
            Nothing has been published yet. <Link href="/dashboard/listings/new" className="font-semibold underline">List the first space</Link>, or load the optional demo data (see README) to preview the experience.
          </Alert>
        )}
        {latest.status === "ok" && latest.items.length > 0 && (
          <>
            {latest.items.some((i) => i.is_demo) && (
              <Alert tone="warning" title="Includes demo data" className="mb-4">
                Listings tagged <strong>DEMO DATA</strong> are fictional and not real inventory.
              </Alert>
            )}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {latest.items.map((l) => <li key={l.id}><ListingCard listing={l} /></li>)}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="how" className="grid gap-6 md:grid-cols-3">
        <h2 id="how" className="sr-only">How it works</h2>
        {[
          { n: "1", t: "Search", d: "Filter by area, vehicle, price, covered or open, and the hours you need." },
          { n: "2", t: "Request", d: "Verify your mobile number, then send a request with your dates and vehicle." },
          { n: "3", t: "Hear back", d: "Owners accept or decline. Exact address details are shared only after acceptance." },
        ].map((s) => (
          <div key={s.n} className="rounded-xl border border-slate-200 bg-white p-5">
            <span className="grid size-9 place-items-center rounded-full bg-brand-100 font-bold text-brand-900">{s.n}</span>
            <h3 className="mt-3 text-lg font-semibold">{s.t}</h3>
            <p className="mt-1 text-slate-600">{s.d}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold sm:text-2xl">Have a space that sits empty?</h2>
        <p className="mt-1 max-w-2xl text-slate-600">List it for free during this research phase. You choose the hours, the price and how much location detail the public can see.</p>
        <Link href="/dashboard/listings/new" className={buttonClass("primary", "mt-4")}>List your space</Link>
      </section>
    </div>
  );
}
