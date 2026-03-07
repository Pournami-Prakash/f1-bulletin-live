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
  title: 'F1 Bulletin — Race Control Live',
  description: 'Real-time F1 intelligence. Breaking news, Reddit pulse, FIA bulletins and driver sentiment from 6 live sources.',
  openGraph: {
    title: 'F1 Bulletin — Race Control Live',
    description: 'AI-powered F1 intelligence terminal. No filler. Just the numbers that matter.',
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
      <body>{children}</body>
    </html>
  )
}
