import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata('F1 Championship Forecast',
  'Explore every driver’s championship chances, best-to-worst scenario ranges and projections for each remaining Grand Prix.', '/championship')

export default function Layout({ children }: { children: ReactNode }) { return children }
