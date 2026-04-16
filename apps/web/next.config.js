/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['images.unsplash.com'],
  },
  // Ensure .md files in lib/ai are included in the server bundle
  outputFileTracingIncludes: {
    '/api/chat': ['./lib/ai/FIELD_MAP.md'],
    '/api/demo/chat': ['./lib/ai/FIELD_MAP.md'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Polyfill Buffer for mdb-reader browser build
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer/'),
      }
    }
    return config
  },
};

module.exports = nextConfig;
