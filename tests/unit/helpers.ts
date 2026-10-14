import { vi } from "vitest";

export type Call = { table?: string; fn?: string; op: string; args: unknown[] };

/**
 * Tiny chainable stand-in for the Supabase query builder. Every call is recorded so tests can assert
 * what an action sent; `results[table][op]` controls what the awaited chain resolves to.
 */
export function fakeSupabase(opts: {
  user?: { id: string } | null;
  results?: Record<string, Partial<Record<"select" | "insert" | "update" | "delete", { data?: unknown; error?: unknown; count?: number | null }>>>;
  rpc?: Record<string, { data?: unknown; error?: unknown }>;
  auth?: Record<string, unknown>;
} = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let op = "select";
    const chain: Record<string, unknown> = {};
    const record = (name: string, args: unknown[]) => calls.push({ table, op: name, args });
    const result = () => opts.results?.[table]?.[op as "select"] ?? { data: [], error: null };
    for (const name of ["select", "insert", "update", "delete"]) {
      chain[name] = (...args: unknown[]) => {
        if (name !== "select" || op === "select") op = name === "select" ? op : name;
        record(name, args);
        return chain;
      };
    }
    for (const name of ["eq", "neq", "in", "order", "limit", "ilike", "or"]) {
      chain[name] = (...args: unknown[]) => {
        record(name, args);
        return chain;
      };
    }
    chain.single = () => Promise.resolve({ ...(result() as object), data: firstRow(result().data) });
    chain.maybeSingle = chain.single;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ error: null, ...(result() as object) }).then(resolve, reject);
    return chain;
  };
  const rpc = vi.fn(async (fn: string, args?: unknown) => {
    calls.push({ fn, op: "rpc", args: [args] });
    return { data: null, error: null, ...(opts.rpc?.[fn] ?? {}) };
  });
  const client = {
    from,
    rpc,
    storage: { from: () => ({ remove: vi.fn(async () => ({ data: [], error: null })) }) },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: opts.user ?? null }, error: null })),
      signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
      verifyOtp: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      ...(opts.auth ?? {}),
    },
  };
  return { client, calls, callsFor: (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op) };
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}
