import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

// Next.js hydrates from inline bootstrap scripts. A per-request nonce would force
// every page to render dynamically, so the statically cached home page allows
// inline scripts instead. React escapes all rendered text; no HTML is injected.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
  "img-src 'self' data:",
  `connect-src 'self'${dev ? ' ws:' : ''}`,
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'"
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp }
        ]
      },
      { source: '/api/(.*)', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] }
    ];
  }
};

export default nextConfig;
