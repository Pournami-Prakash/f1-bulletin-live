import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata(
  'F1 Race Analytics',
  'Explore Formula 1 lap pace, tyre strategy, sector performance, race sessions, and circuit-level analytics.',
  '/analytics',
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
