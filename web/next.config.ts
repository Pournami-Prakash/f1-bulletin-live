// web/next.config.ts

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    serverExternalPackages: ['@neondatabase/serverless'],
    experimental: {}
  
};

export default nextConfig;
