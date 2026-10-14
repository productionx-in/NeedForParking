/**
 * Public (browser-safe) configuration. NEXT_PUBLIC_* variables must be referenced literally so that
 * Next.js can inline them into the client bundle.
 *
 * No server-only secret is required to run the app. The Supabase service-role key is used only by
 * the optional `npm run seed:demo` script and must never be placed in a NEXT_PUBLIC_* variable.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseKey } = publicEnv;
  return /^https?:\/\//.test(supabaseUrl) && supabaseKey.length > 10 && !supabaseKey.includes("your-");
}

export function isMapConfigured(): boolean {
  return publicEnv.mapboxToken.startsWith("pk.");
}

export const SETUP_MESSAGE =
  "The backend is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see README → Setup).";

export function listingPhotoUrl(storagePath: string): string {
  return `${publicEnv.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/listing-photos/${storagePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
