import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No webpack config needed - localStorage should not be accessed on server
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons'],
  },
};

export default nextConfig;
