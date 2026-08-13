import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata(
  'F1 Driver & Constructor Standings',
  'Follow current Formula 1 driver and constructor standings, points, positions, and championship progress.',
  '/standings',
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
