import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata(
  'Formula 1 Beginner Guide',
  'Learn Formula 1 basics, race-weekend formats, flags, tyres, strategy, points, and essential terminology.',
  '/guide',
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
