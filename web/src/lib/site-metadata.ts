import type { Metadata } from 'next'

export const siteUrl = 'https://f1bulletin.pournamiprakash.dev'
export const siteName = 'F1 Bulletin'
export const siteDescription =
  'Live Formula 1 news, race analytics, standings, circuit insights, strategy data, and probabilistic race predictions in one dashboard.'

export function pageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title: { absolute: `${title} | ${siteName}` },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      url: path,
      siteName,
      title: `${title} | ${siteName}`,
      description,
      images: [
        {
          url: '/social-card',
          width: 1200,
          height: 630,
          alt: `${siteName} — live Formula 1 intelligence`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${siteName}`,
      description,
      images: ['/social-card'],
    },
  }
}
