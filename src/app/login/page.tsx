import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PhoneOtpForm } from "@/components/auth/phone-otp-form";
import { SetupNotice } from "@/components/setup-notice";
import { Card } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next ? safeNextPath(next, "") : "";
  if (await getSessionUser()) redirect(safeNext || "/dashboard");

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">Sign in or register</h1>
      <p className="mt-1 text-slate-600">Use your mobile number. New numbers are registered automatically after verification.</p>
      {safeNext && <p className="mt-2 text-sm text-slate-600">You&apos;ll be taken back to where you were after signing in.</p>}
      <Card className="mt-6 p-5 sm:p-6">
        {!isSupabaseConfigured() && <div className="mb-4"><SetupNotice what="Sign-in" /></div>}
        <PhoneOtpForm next={safeNext} />
      </Card>
    </div>
  );
}
