'use client'
// components/Footer.tsx

export default function Footer() {
  return (
    <footer style={{
      padding: '28px var(--gutter)',
      borderTop: '1px solid var(--b1)',
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', flexWrap: 'wrap', gap: 12,
      background: 'var(--bg2)', position: 'relative', zIndex: 1,
    }}>
      <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 18, letterSpacing: '.14em' }}>
        F1<span style={{ color: 'var(--red)' }}>BULLETIN</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.08em' }}>
        SNOWFLAKE CORTEX · NEON POSTGRES · NEXT.JS · VERCEL
      </div>
      <div style={{ fontSize: 10, color: 'var(--t3)' }}>
        DATA REFRESHED HOURLY · NOT AFFILIATED WITH FIA OR FORMULA 1
      </div>
    </footer>
  )
}
