'use client'
// components/Header.tsx

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Header() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const pathname = usePathname()

  useEffect(() => {
    const saved = localStorage.getItem('f1-theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  // function toggleTheme() {
  //   const next = theme === 'dark' ? 'light' : 'dark'
  //   setTheme(next)
  //   document.documentElement.setAttribute('data-theme', next)
  //   localStorage.setItem('f1-theme', next)
  // }

  const navItems = [
    { href: '/',          label: 'HOME' },
    { href: '/intelligence',  label: 'INTELLIGENCE' },
    { href: '/analytics', label: 'ANALYTICS' },
    { href: '/predictions',  label: 'PREDICTION' },
    { href: '/standings', label: 'STANDINGS' },
    { href: '/guide',     label: 'GUIDE' },
    
  ]

  return (
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
      <Link href="/" style={{
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

      {/* Nav */}
      <nav style={{ display: 'flex', gap: 0, marginLeft: 8 }}>
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

      {/* Right side */}
      {/* <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={toggleTheme}
          style={{
            background: 'transparent', border: '1px solid var(--b1)',
            color: 'var(--t2)', padding: '4px 10px',
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button style={{
          background: 'var(--red)', color: '#fff',
          border: 'none', padding: '5px 14px',
          borderRadius: 6, cursor: 'pointer',
          fontSize: 10, letterSpacing: '.12em', fontWeight: 500,
          fontFamily: 'var(--font-mono)',
        }}>
          SUBSCRIBE
        </button>
      </div> */}
    </header>
  )
}
