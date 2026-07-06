/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",

              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com",

              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://clerk.dev https://*.clerk.accounts.dev",

              "font-src 'self' https://fonts.gstatic.com",

              "img-src 'self' data: blob: https://clerk.dev https://*.clerk.accounts.dev https://img.clerk.com",

              "connect-src 'self' https://amaryllis-boq-production.up.railway.app https://clerk.dev https://*.clerk.accounts.dev wss://*.clerk.accounts.dev",

              "frame-src 'self' https://clerk.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com",

              "worker-src 'self' blob:",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
