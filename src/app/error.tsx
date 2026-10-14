"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Alert, Button } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] unhandled error", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg space-y-4 py-12">
      <Alert tone="error" title="Something went wrong">
        We hit an unexpected problem loading this page. You can try again, or go back to the homepage.
      </Alert>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold">Home</Link>
      </div>
    </div>
  );
}
