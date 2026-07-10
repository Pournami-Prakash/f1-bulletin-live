'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Header({ onReset }: { onReset?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const saved = localStorage.getItem('f1-theme') as 'dark' | 'light' | null
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const navItems = [
    { href: '/',             label: 'HOME'         },
    { href: '/intelligence', label: 'INTELLIGENCE' },
    { href: '/analytics',    label: 'ANALYTICS'    },
    { href: '/predictions',  label: 'PREDICTION'   },
    { href: '/standings',    label: 'STANDINGS'    },
    { href: '/circuit',      label: 'CIRCUIT'      },
    { href: '/guide',        label: 'GUIDE'        },
  ]

  return (
    <>
      <style>{`
        .f1-nav { display: flex; gap: 0; margin-left: 8px; }
        .f1-hamburger { display: none; }
        .f1-dropdown { display: none; }
        @media (max-width: 768px) {
          .f1-nav { display: none !important; }
          .f1-hamburger { display: flex !important; }
          .f1-dropdown { display: block !important; }
        }
      `}</style>

      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 'var(--header-h)',
        display: 'flex', alignItems: 'center',
        padding: '0 var(--gutter)', gap: 16,
        background: 'rgba(10,10,10,.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--b1)',
        transition: 'background var(--tr)',
      }}>
        {/* Logo */}
        <Link href="/" onClick={onReset} style={{
          fontFamily: 'var(--font-bebas)',
          fontSize: 22, letterSpacing: '.14em',
          color: 'var(--t1)', textDecoration: 'none',
          flexShrink: 0,
        }}>
          F1<em style={{ color: 'var(--red)', fontStyle: 'normal' }}>BULLETIN</em>
        </Link>

        {/* Live pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '3px 10px', borderRadius: 20,
          border: '1px solid rgba(225,6,0,.25)',
          background: 'rgba(225,6,0,.08)',
          flexShrink: 0,
        }}>
          <div className="pd" />
          <span style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--red)' }}>LIVE</span>
        </div>

        {/* Desktop nav */}
        <nav className="f1-nav">
          {navItems.map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} style={{
                padding: '0 16px',
                height: 'var(--header-h)',
                display: 'flex', alignItems: 'center',
                fontSize: 11, letterSpacing: '.12em',
                color: active ? 'var(--t1)' : 'var(--t2)',
                textDecoration: 'none',
                borderBottom: active ? '1px solid var(--red)' : '1px solid transparent',
                transition: 'color var(--tr)',
                fontWeight: active ? 500 : 300,
              }}>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Hamburger + dropdown — mobile only */}
        <div
          className="f1-hamburger"
          style={{
            marginLeft: 'auto',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
            style={{
              background: 'transparent',
              border: '1px solid var(--b1)',
              width: 36, height: 36,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 5,
              padding: '8px 9px',
            }}
          >
            <span style={{
              display: 'block', width: '100%', height: 1.5,
              background: 'var(--t1)', transition: 'all .2s',
              transform: menuOpen ? 'rotate(45deg) translate(0px, 6.5px)' : 'none',
            }} />
            <span style={{
              display: 'block', width: '100%', height: 1.5,
              background: menuOpen ? 'transparent' : 'var(--t1)',
              transition: 'all .2s',
            }} />
            <span style={{
              display: 'block', width: '60%', height: 1.5,
              background: 'var(--t1)', transition: 'all .2s',
              alignSelf: 'flex-start',
              transform: menuOpen ? 'rotate(-45deg) translate(1px, -6.5px)' : 'none',
            }} />
          </button>

          {/* Dropdown — anchored below hamburger */}
          {menuOpen && (
            <div
              className="f1-dropdown"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 200,
                background: 'rgba(10,10,10,.98)',
                border: '1px solid var(--b1)',
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: '0 16px 40px rgba(0,0,0,.6)',
              }}
            >
              {navItems.map((item, i) => {
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '13px 16px',
                    borderBottom: i < navItems.length - 1
                      ? '1px solid rgba(255,255,255,.05)' : 'none',
                    fontSize: 11, letterSpacing: '.12em',
                    color: active ? 'var(--t1)' : 'var(--t2)',
                    textDecoration: 'none',
                    background: active ? 'rgba(220,0,0,.06)' : 'transparent',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    <div style={{
                      width: 3, height: 14, borderRadius: 2, flexShrink: 0,
                      background: active ? 'var(--red)' : 'rgba(255,255,255,.1)',
                    }} />
                    {item.label}
                    {active && (
                      <span style={{ marginLeft: 'auto', color: 'var(--red)', fontSize: 8 }}>●</span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Backdrop to close menu */}
        {menuOpen && (
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              zIndex: -1,
            }}
          />
        )}
      </header>
    </>
  )
}
