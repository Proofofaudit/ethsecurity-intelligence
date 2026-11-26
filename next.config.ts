import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Same-origin only: no third-party scripts, fonts, styles, images or API calls from the browser.
 * Fonts are self-hosted by next/font at build time. 'unsafe-inline' covers the theme script and
 * the framework's inline hydration data; development adds eval and the hot-reload socket.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const config: NextConfig = {
  poweredByHeader: false,
  // Request URLs can carry search text; keep them out of the server log.
  logging: { incomingRequests: false, fetches: { fullUrl: false } },
  reactStrictMode: true,
  outputFileTracingIncludes: { "/**": ["./data/published/**"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
