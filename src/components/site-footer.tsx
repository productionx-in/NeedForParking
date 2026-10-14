import { PROJECT_LABEL } from "@/lib/domain/constants";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-8 text-sm text-slate-600 sm:px-6">
        <p className="font-semibold text-slate-900">{PROJECT_LABEL}</p>
        <p>
          A research prototype for exploring private parking in Hyderabad. It is not a commercial service: no payments are taken, nothing here is a guarantee of
          availability, and listings marked <strong>DEMO DATA</strong> are fictional.
        </p>
        <p>Meet in safe, well-lit places, and never share one-time codes or banking details with anyone.</p>
      </div>
    </footer>
  );
}
