import { ImageResponse } from 'next/og'

export const alt = 'F1 Bulletin — live Formula 1 intelligence'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          color: '#ffffff',
          background:
            'radial-gradient(circle at 82% 18%, rgba(232,0,45,.38), transparent 31%), linear-gradient(135deg, #090b10 0%, #11151d 58%, #08090c 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            color: '#ff365e',
            fontSize: 25,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ width: 54, height: 5, background: '#e8002d' }} />
          Race weekend intelligence
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 112, lineHeight: 0.9, fontWeight: 900, letterSpacing: -3 }}>
            F1 BULLETIN
          </div>
          <div style={{ maxWidth: 880, color: '#c4c9d2', fontSize: 34, lineHeight: 1.25 }}>
            Live news, race analytics, circuit context and probabilistic predictions.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 28, color: '#777f8e', fontSize: 20, letterSpacing: 2 }}>
          <span>NEWS INTELLIGENCE</span>
          <span>•</span>
          <span>RACE ANALYTICS</span>
          <span>•</span>
          <span>PREDICTIONS</span>
        </div>
      </div>
    ),
    size,
  )
}
