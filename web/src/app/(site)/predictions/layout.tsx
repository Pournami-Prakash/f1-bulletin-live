import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata(
  'F1 Race Predictions',
  'View probabilistic Formula 1 race predictions, win and podium chances, predicted finishing positions, and model scoring.',
  '/predictions',
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
