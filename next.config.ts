import type { NextConfig } from "next";

const supabaseUrl = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
  } catch {
    return null;
  }
})();
// Local Supabase (CLI) serves Storage over http on a private address; Next blocks that by default.
const supabaseIsLocal = supabaseUrl !== null && ["localhost", "127.0.0.1", "::1"].includes(supabaseUrl.hostname);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
            hostname: supabaseUrl.hostname,
            ...(supabaseUrl.port ? { port: supabaseUrl.port } : {}),
            pathname: "/storage/v1/object/public/listing-photos/**",
          },
        ]
      : [],
    dangerouslyAllowLocalIP: supabaseIsLocal,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
