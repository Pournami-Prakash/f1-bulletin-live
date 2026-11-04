import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export const metadata = pageMetadata('F1 Championship Outlook',
  'Follow the championship winner, battles for the remaining positions, points gaps and season projections for every driver.', '/championship')

export default function Layout({ children }: { children: ReactNode }) { return children }
