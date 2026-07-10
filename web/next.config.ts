// web/next.config.ts

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
    serverExternalPackages: ['@neondatabase/serverless'],
    turbopack: {
        root: appRoot,
    },
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'media.formula1.com' },
            { protocol: 'https', hostname: 'www.google.com' },
        ],
    },
    experimental: {}
  
};

export default nextConfig;
