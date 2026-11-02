import type { NextConfig } from 'next';

// STATIC_EXPORT=1 (set by /Dockerfile) builds a static site into out/ for the backend to serve.
const exportStatic = process.env.STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  ...(exportStatic && { output: 'export', trailingSlash: true }),
  images: {
    unoptimized: exportStatic,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'labmind-production.up.railway.app',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
      },
    ],
  },
};

export default nextConfig;
