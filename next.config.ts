
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
    if (!process.env.NEXT_PUBLIC_IMMICH_SERVER_URL) {
      return [];
    }
    const destination = `${process.env.NEXT_PUBLIC_IMMICH_SERVER_URL}/api/:path*`;

    return [
      {
        source: '/api/immich/:path*',
        destination: destination,
      },
    ];
  },
};

export default nextConfig;
