/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ioredis', '@upstash/redis'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'Content-Type, Authorization, X-Requested-With, Accept, Origin',
          },
        ],
      },
    ]
  },
}

export default nextConfig
