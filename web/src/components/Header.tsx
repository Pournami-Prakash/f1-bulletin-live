'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Header({ onReset }: { onReset?: () => void }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const saved = localStorage.getItem('f1-theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
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
    { href: '/guide',        label: 'GUIDE'        },
  ]

  return (
    <>
      <style>{`
        .f1-nav { display: flex; gap: 0; margin-left: 8px; }
        .f1-hamburger { display: none; margin-left: auto; background: transparent; border: 1px solid var(--b1); width: 36px; height: 36px; border-radius: 8px; cursor: pointer; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 8px 9px; flex-shrink: 0; }
        .f1-mobile-overlay { display: none; }
        .f1-mobile-menu { display: none; }
        @media (max-width: 768px) {
          .f1-nav { display: none !important; }
          .f1-hamburger { display: flex !important; }
          .f1-mobile-overlay { display: block !important; }
          .f1-mobile-menu { display: flex !important; }
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

        {/* Hamburger — mobile only via CSS */}
        <button
          className="f1-hamburger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
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
      </header>

      {/* Backdrop — mobile only via CSS */}
      {menuOpen && (
        <div
          className="f1-mobile-overlay"
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 98,
            background: 'rgba(0,0,0,.7)',
            backdropFilter: 'blur(4px)',
          }}
        />
      )}

      {/* Mobile menu — centered vertically in viewport */}
      {menuOpen && (
        <div
          className="f1-mobile-menu"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            width: '80%',
            maxWidth: 320,
            background: 'rgba(12,12,12,.98)',
            border: '1px solid var(--b1)',
            borderRadius: 16,
            overflow: 'hidden',
            pointerEvents: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,.6)',
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--b1)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{
                fontSize: 8, letterSpacing: '.2em',
                color: 'var(--t3)', fontFamily: 'var(--font-mono)',
              }}>
                NAVIGATION
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--t3)', cursor: 'pointer',
                  fontSize: 18, lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            </div>

            {/* Nav items */}
            {navItems.map((item, i) => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '15px 20px',
                  borderBottom: i < navItems.length - 1
                    ? '1px solid rgba(255,255,255,.05)' : 'none',
                  fontSize: 13, letterSpacing: '.14em',
                  color: active ? 'var(--t1)' : 'var(--t2)',
                  textDecoration: 'none',
                  background: active ? 'rgba(220,0,0,.06)' : 'transparent',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 3, height: 16, borderRadius: 2, flexShrink: 0,
                      background: active ? 'var(--red)' : 'rgba(255,255,255,.1)',
                    }} />
                    {item.label}
                  </div>
                  {active && (
                    <span style={{
                      fontSize: 7, color: 'var(--red)',
                      letterSpacing: '.14em', fontFamily: 'var(--font-mono)',
                    }}>
                      ●
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}