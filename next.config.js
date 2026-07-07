/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self' https://*.boq.amaryllissuccess.co.zw https://*.clerk.com https://*.clerk.accounts.dev",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.boq.amaryllissuccess.co.zw https://clerk.com https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
              "script-src-elem 'self' 'unsafe-inline' https://*.boq.amaryllissuccess.co.zw https://clerk.com https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.com",
              "font-src 'self' https://fonts.gstatic.com https://*.clerk.com",
              "img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com https://*.boq.amaryllissuccess.co.zw",
              "connect-src 'self' https://amaryllis-boq-production.up.railway.app https://*.boq.amaryllissuccess.co.zw https://clerk.com https://*.clerk.com https://*.clerk.accounts.dev wss://*.clerk.accounts.dev wss://*.boq.amaryllissuccess.co.zw",
              "frame-src 'self' https://*.boq.amaryllissuccess.co.zw https://clerk.com https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
              "worker-src 'self' blob:",
            ].join('; '),
          },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
