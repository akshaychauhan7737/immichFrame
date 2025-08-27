
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
    // The destination server must be the root of the Immich instance.
    const immichUrl = new URL(process.env.NEXT_PUBLIC_IMMICH_SERVER_URL);
    return [
      {
        source: '/api/immich/:path*',
        destination: `${immichUrl.origin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
