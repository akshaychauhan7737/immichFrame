
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
    // The destination needs to be the root of the Immich API endpoint.
    // The `:path*` from the source will be appended to this.
    // For example, a request to `/api/immich/asset/file/123` will be proxied to
    // `http://<your-immich-url>/api/asset/file/123`.
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
