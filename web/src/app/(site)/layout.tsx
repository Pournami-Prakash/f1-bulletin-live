// app/layout.tsx
import type { Metadata } from 'next'
import { Bebas_Neue, JetBrains_Mono } from 'next/font/google'
import { siteDescription, siteName, siteUrl } from '@/lib/site-metadata'
import './globals.css'

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: 'F1 Bulletin | Live F1 News, Analytics & Predictions',
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  alternates: { canonical: '/' },
  category: 'sports',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName,
    title: 'F1 Bulletin | Live F1 News, Analytics & Predictions',
    description: siteDescription,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'F1 Bulletin — live Formula 1 intelligence',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'F1 Bulletin | Live F1 News, Analytics & Predictions',
    description: siteDescription,
    images: ['/opengraph-image'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${bebas.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
