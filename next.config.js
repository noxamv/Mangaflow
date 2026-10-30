// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**.comick.pictures' },
      { protocol: 'https', hostname: '**.comick.cc' },
      { protocol: 'https', hostname: '**.mangadex.org' },
      { protocol: 'https', hostname: '**.mangapill.com' },
      { protocol: 'https', hostname: '**.mpcdn.top' },
      { protocol: 'https', hostname: '**.weebcentral.com' },
      { protocol: 'https', hostname: '**.anilist.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
