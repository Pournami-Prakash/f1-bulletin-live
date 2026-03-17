// app/layout.tsx
import type { Metadata } from 'next'
import { Bebas_Neue, JetBrains_Mono } from 'next/font/google'
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
  title: 'F1 Bulletin - Live F1 News and Race Analytics',
  description: 'Track the latest F1 headlines, race analytics, standings, schedule, and circuit insights in one live dashboard.',
  openGraph: {
    title: 'F1 Bulletin - Live F1 News and Race Analytics',
    description: 'Track the latest F1 headlines, race analytics, standings, schedule, and circuit insights in one live dashboard.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${bebas.variable} ${mono.variable}`}>
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏎️</text></svg>" />
      </head>
      <body>{children}</body>
    </html>
  )
}
