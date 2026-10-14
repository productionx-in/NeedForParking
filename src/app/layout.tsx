import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PROJECT_LABEL } from "@/lib/domain/constants";
import { HydrationMarker } from "@/components/hydration-marker";

export const metadata: Metadata = {
  title: { default: PROJECT_LABEL, template: `%s · ${PROJECT_LABEL}` },
  description: "Research prototype: discover and request private or underused parking spaces in Hyderabad.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a href="#main" className="skip-link">Skip to main content</a>
        <SiteHeader />
        <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </main>
        <SiteFooter />
        <HydrationMarker />
      </body>
    </html>
  );
}
