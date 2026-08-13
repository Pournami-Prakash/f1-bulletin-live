import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata(
  'F1 Driver Intelligence',
  'Explore Formula 1 driver performance, sentiment, momentum, news signals, and race analytics.',
  '/drivers',
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
