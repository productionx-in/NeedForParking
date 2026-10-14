import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

/**
 * Refreshes the Supabase session cookies on every request and gates protected areas.
 * This is a convenience layer only: every page, server action and database policy re-checks
 * authorization independently.
 */
export async function updateSession(request: NextRequest) {
  const protectedPath = isProtectedPath(request.nextUrl.pathname);

  if (!isSupabaseConfigured()) {
    return protectedPath ? redirectToLogin(request) : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() validates the JWT and refreshes it when it has expired.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && protectedPath) {
    const redirect = redirectToLogin(request);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}
