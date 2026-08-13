import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata(
  'Latest F1 News & Stories',
  'Follow grouped Formula 1 headlines, developing stories, source coverage, and race-weekend news from across motorsport media.',
  '/stories',
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
