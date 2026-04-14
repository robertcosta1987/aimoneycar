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
};

module.exports = nextConfig;
