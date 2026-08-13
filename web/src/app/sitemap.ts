import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-metadata'

const routes = [
  '',
  '/analytics',
  '/circuit',
  '/drivers',
  '/guide',
  '/intelligence',
  '/predictions',
  '/standings',
  '/stories',
]

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((path, index) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: path === '/guide' ? 'monthly' : 'daily',
    priority: index === 0 ? 1 : 0.8,
  }))
}
