// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = { configured: true, claims: null as null | { sub: string } };
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), isSupabaseConfigured: () => state.configured }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }) } }),
}));

import { isProtectedPath, updateSession } from "@/lib/supabase/proxy";

const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

beforeEach(() => {
  state.configured = true;
  state.claims = null;
});

describe("protected route detection", () => {
  it("covers the dashboard and admin trees only", () => {
    for (const p of ["/dashboard", "/dashboard/listings/new", "/admin", "/admin/accounts"]) expect(isProtectedPath(p), p).toBe(true);
    for (const p of ["/", "/search", "/listings/abc", "/login", "/dashboardx", "/administrator"]) expect(isProtectedPath(p), p).toBe(false);
  });
});

describe("updateSession (visitor restrictions)", () => {
  it("redirects visitors from protected pages to /login, preserving the destination", async () => {
    const res = await updateSession(req("/dashboard/listings/new?x=1"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/dashboard/listings/new?x=1");
  });
  it("redirects visitors from the admin area too", async () => {
    const res = await updateSession(req("/admin"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
  it("lets visitors browse public pages", async () => {
    for (const p of ["/", "/search", "/listings/abc", "/login"]) {
      const res = await updateSession(req(p));
      expect(res.headers.get("location"), p).toBeNull();
    }
  });
  it("lets signed-in users through", async () => {
    state.claims = { sub: "u1" };
    const res = await updateSession(req("/dashboard"));
    expect(res.headers.get("location")).toBeNull();
  });
  it("fails closed when the backend isn't configured", async () => {
    state.configured = false;
    expect((await updateSession(req("/dashboard"))).status).toBe(307);
    expect((await updateSession(req("/search"))).headers.get("location")).toBeNull();
  });
});
