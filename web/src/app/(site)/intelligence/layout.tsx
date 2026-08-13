import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata(
  'F1 News Intelligence',
  'Track Formula 1 news clusters, driver and constructor sentiment, momentum, controversies, and emerging race-weekend signals.',
  '/intelligence',
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
