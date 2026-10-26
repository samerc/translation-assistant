import type { NextConfig } from "next";

// Allow the browser to reach the API origin (same host in prod, localhost in dev).
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005/api";
let apiOrigin = "";
try {
  apiOrigin = new URL(apiUrl).origin;
} catch {
  apiOrigin = "";
}

// Content-Security-Policy. 'unsafe-inline' is required for Next.js' inline
// hydration/bootstrap scripts and styles (no nonce pipeline here); the value of
// this policy is in the restrictive directives (frame-ancestors, object-src,
// base-uri) and pinning connect/img/font sources. `data:` on img-src is needed
// for the per-user base64 logos and avatars. 'unsafe-eval' is added in
// development only: React's dev build uses eval() for its debugging features
// (never in production builds).
const isDev = process.env.NODE_ENV === "development";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin ? " " + apiOrigin : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: "..",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
