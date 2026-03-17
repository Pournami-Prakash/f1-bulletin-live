'use client'
import { useEffect, useMemo, useState } from 'react'

interface TickerItem {
  title?: string
  headline?: string
  source_type?: string
  published_at?: string
}

interface Props {
  items?: TickerItem[]
  loading?: boolean
}

const FALLBACK = [
  { type: 'o', text: 'FIA COMMISSION — Sprint format revised, cost cap updated for 2026' },
  { type: 'r', text: 'REDDIT — Hamilton Ferrari Year One retrospective viral across F1 communities' },
  { type: 'n', text: 'NEWS — Russell P1 Bahrain Day 2, Piastri 0.087s back on C4 compound' },
  { type: 'n', text: 'NEWS — Verstappen on 2026 regulations: "We need to wait and see"' },
  { type: 'r', text: 'REDDIT — Aston Martin Honda concerns deepen ahead of Melbourne opener' },
  { type: 'o', text: 'OFFICIAL — 2026 PU deployment rules confirmed by unanimous vote' },
]

export default function Ticker({ items }: Props) {
  const [fetched, setFetched] = useState<{ type: string; text: string }[]>([])

  useEffect(() => {
    if (items && items.length > 0) return

    fetch('/api/intelligence/alerts')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ticker?.length) {
          setFetched(
            data.ticker
              .map((a: { source_type?: string; headline?: string }) => ({
                type:
                  a.source_type === 'reddit'
                    ? 'r'
                    : a.source_type === 'official'
                    ? 'o'
                    : 'n',
                text: a.headline || '',
              }))
              .filter((x: { text: string }) => x.text.trim().length > 0)
          )
        }
      })
      .catch(() => {})
  }, [items])

  const display = useMemo(() => {
    if (items && items.length > 0) {
      const mapped = items
        .map((i) => ({
          type:
            i.source_type === 'reddit'
              ? 'r'
              : i.source_type === 'official'
              ? 'o'
              : 'n',
          text: i.title || i.headline || '',
        }))
        .filter((x) => x.text.trim().length > 0)

      return mapped.length > 0 ? mapped : FALLBACK
    }

    return fetched.length > 0 ? fetched : FALLBACK
  }, [items, fetched])

  const doubled = [...display, ...display]

  return (
    <>
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      <div
        className="ticker"
        style={{
          position: 'fixed',
          top: 'var(--header-h)',
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: 36,
          minHeight: 36,
          borderTop: '1px solid var(--b1)',
          borderBottom: '1px solid var(--b1)',
          background: 'rgba(0,0,0,0.94)',
          backdropFilter: 'blur(8px)',
          overflow: 'hidden',
          zIndex: 40,
        }}
      >
        <div
          className="ttag"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 14px',
            height: '100%',
            borderRight: '1px solid var(--b1)',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.14em',
            color: 'var(--red)',
            background: 'rgba(0,0,0,0.98)',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <div
            className="pd"
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--red)',
              boxShadow: '0 0 8px var(--red)',
              flexShrink: 0,
            }}
          />
          <span>BREAKING</span>
        </div>

        <div
          className="tscroll"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            position: 'relative',
          }}
        >
          <div
            className="tinner"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              width: 'max-content',
              animation: 'ticker-scroll 120s linear infinite',
              willChange: 'transform',
            }}
          >
            {doubled.map((item, i) => (
              <span
                key={i}
                className="ti"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  marginRight: 28,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--t1)',
                }}
              >
                <span
                  style={{
                    color:
                      item.type === 'o'
                        ? 'var(--red)'
                        : item.type === 'r'
                        ? 'var(--gold)'
                        : 'var(--blue)',
                    fontSize: 10,
                    letterSpacing: '.08em',
                    flexShrink: 0,
                  }}
                >
                  [{item.type.toUpperCase()}]
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>{item.text}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}