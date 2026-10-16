import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origin of the API the browser calls directly (baked in at build time, like api.ts). */
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").origin;
  } catch {
    return ""; // a relative API URL is same-origin, which 'self' already allows
  }
}

// ponytail: script-src allows 'unsafe-inline'. Pages are statically generated
// (generateStaticParams in app/[locale]/layout.tsx), and a per-request nonce
// would force every page to dynamic rendering; Next.js's inline RSC payload
// scripts and the next-themes theme script need inline execution. Ceiling:
// inline scripts are allowed, so this CSP limits what injected markup can load
// or send, but does not stop XSS by itself. Upgrade path: generate a nonce in
// src/proxy.ts, render dynamically, and switch to 'nonce-…' 'strict-dynamic'
// (public/offline.html's inline onclick must then move to a script file).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // ws: only in development, for the hot-reload socket.
  `connect-src 'self' ${apiOrigin()}${isDev ? " ws:" : ""}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), accelerometer=(), gyroscope=(), magnetometer=(), display-capture=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
