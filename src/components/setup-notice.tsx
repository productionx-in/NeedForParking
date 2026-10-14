import { Alert } from "@/components/ui";

export function SetupNotice({ what = "This page" }: { what?: string }) {
  return (
    <Alert tone="warning" title="Backend not configured">
      {what} needs a Supabase project. Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
      <code className="rounded bg-amber-100 px-1">.env.local</code>, fill in <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, apply the migrations, then restart. See the README for step-by-step setup.
    </Alert>
  );
}
