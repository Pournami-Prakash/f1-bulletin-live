import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/site-metadata'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ driverId: string }>
}): Promise<Metadata> {
  const { driverId } = await params
  const driverName = driverId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')

  return pageMetadata(
    `${driverName} F1 Profile`,
    `Explore ${driverName}'s Formula 1 results, standings, performance trends, and race analytics.`,
    `/drivers/${encodeURIComponent(driverId)}`,
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
