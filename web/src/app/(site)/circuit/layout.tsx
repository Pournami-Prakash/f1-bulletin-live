import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata(
  'F1 Circuit Guide',
  'Compare Formula 1 circuits by track characteristics, tyre demands, overtaking difficulty, and historical race context.',
  '/circuit',
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
