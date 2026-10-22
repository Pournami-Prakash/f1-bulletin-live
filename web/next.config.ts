// web/next.config.ts

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
    poweredByHeader: false,
    async headers() {
        const csp = [
            "default-src 'self'",
            // Next's prerendered bootstrap uses inline scripts; no eval in production.
            `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' https: data: blob:",
            "connect-src 'self' https://api.jolpi.ca",
            "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
            "form-action 'self'", "upgrade-insecure-requests",
        ].filter(rule => process.env.NODE_ENV !== 'development' || rule !== 'upgrade-insecure-requests').join('; ');
        return [{ source: '/:path*', headers: [
            { key: 'Content-Security-Policy', value: csp },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ] }];
    },
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
