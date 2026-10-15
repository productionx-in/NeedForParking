import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The app is a server-rendered Next.js site (server actions, cookie sessions), so it cannot be bundled into the
 * APK as static files. The APK is a thin WebView shell that loads the deployed site over HTTPS.
 * Override the target at build time:  APP_URL=https://your-host npx cap sync android
 */
const appUrl = (process.env.APP_URL ?? "https://need-for-parking.vercel.app").replace(/\/$/, "");
const host = new URL(appUrl).host;

const config: CapacitorConfig = {
  appId: "app.parkingresearch.prototype",
  appName: "Parking Prototype",
  webDir: "www",
  server: {
    url: appUrl,
    cleartext: false,
    allowNavigation: [host, "*.supabase.co"],
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
