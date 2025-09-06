
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    if (!process.env.NEXT_PUBLIC_IMMICH_SERVER_URL || !process.env.NEXT_PUBLIC_IMMICH_API_KEY) {
      return [];
    }
    const destination = `${process.env.NEXT_PUBLIC_IMMICH_SERVER_URL}/api/:path*`;

    return [
      {
        source: '/api/immich/:path*',
        has: [
          {
            type: 'header',
            key: 'x-api-key',
            value: process.env.NEXT_PUBLIC_IMMICH_API_KEY,
          },
        ],
        destination: destination,
      },
    ];
  },
};

export default nextConfig;
