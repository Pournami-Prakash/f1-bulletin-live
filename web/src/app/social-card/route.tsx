import OpenGraphImage from '@/app/(site)/opengraph-image'

export const dynamic = 'force-static'

export function GET() {
  return OpenGraphImage()
}
