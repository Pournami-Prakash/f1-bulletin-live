'use client'
import { useEffect, useRef } from 'react'

const RA = ['RULES', 'DRIVER', 'TEAM', 'REDDIT', 'SESSION', 'BREAKING']
const RV = [.95, .72, .54, .68, .61, .88]
const RC = ['rgba(225,6,0,.8)', 'rgba(245,158,11,.8)', 'rgba(168,85,247,.8)', 'rgba(245,158,11,.6)', 'rgba(56,189,248,.8)', 'rgba(225,6,0,.6)']

const ITEMS = [
  { color: 'var(--red)', shadow: 'rgba(225,6,0,.6)', name: 'RULES_STEWARDS', sub: '12 sources · BREAKING · ↑ spike', score: 95 },
  { color: 'var(--gold)', shadow: 'rgba(245,158,11,.5)', name: 'DRIVER_NEWS', sub: '8 sources · HIGH momentum', score: 72 },
  { color: 'var(--blue)', shadow: 'rgba(56,189,248,.4)', name: 'SESSION_PERFORMANCE', sub: '6 sources · medium', score: 61 },
  { color: 'var(--purple)', shadow: 'rgba(192,132,252,.4)', name: 'TEAM_NEWS', sub: '4 sources · building', score: 48 },
  { color: 'var(--green)', shadow: 'rgba(74,222,128,.4)', name: 'REDDIT_PULSE', sub: 'all subreddits · live', score: 68 },
  { color: '#fff', shadow: 'rgba(255,255,255,.3)', name: 'BREAKING_P0', sub: '7 signals · urgent', score: 88 },
]

function RadarCanvas({ id, W, H }: { id: string; W: number; H: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const rc = ref.current; if (!rc) return
    rc.width = W; rc.height = H
    const ctx = rc.getContext('2d')!
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 28
    const n = RA.length, step = Math.PI * 2 / n; let t = 0, raf = 0
    function draw() {
      raf = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, W, H)
      const pulse = .02 * Math.sin(t * .05)
      for (let r = .25; r <= 1; r += .25) {
        ctx.beginPath()
        for (let i = 0; i <= n; i++) { const a = i * step - Math.PI / 2; ctx.lineTo(cx + Math.cos(a) * R * r, cy + Math.sin(a) * R * r) }
        ctx.strokeStyle = `rgba(255,255,255,${r === 1 ? .08 : .04})`; ctx.lineWidth = r === 1 ? 1 : .5; ctx.stroke()
      }
      for (let i = 0; i < n; i++) {
        const a = i * step - Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = .5; ctx.stroke()
      }
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const idx = i % n, a = idx * step - Math.PI / 2, v = (RV[idx] + pulse) * R
        ctx.lineTo(cx + Math.cos(a) * v, cy + Math.sin(a) * v)
      }
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
      gr.addColorStop(0, 'rgba(225,6,0,.3)'); gr.addColorStop(1, 'rgba(225,6,0,.05)')
      ctx.fillStyle = gr; ctx.fill()
      ctx.strokeStyle = 'rgba(225,6,0,.65)'; ctx.lineWidth = 1.5; ctx.stroke()
      for (let i = 0; i < n; i++) {
        const a = i * step - Math.PI / 2, v = (RV[i] + pulse) * R
        const dx = cx + Math.cos(a) * v, dy = cy + Math.sin(a) * v
        ctx.beginPath(); ctx.arc(dx, dy, 3, 0, Math.PI * 2); ctx.fillStyle = RC[i]; ctx.fill()
        const lx = cx + Math.cos(a) * (R + 16), ly = cy + Math.sin(a) * (R + 16)
        ctx.font = "bold 7px 'JetBrains Mono'"; ctx.fillStyle = RC[i]
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(RA[i], lx, ly)
      }
      t++
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [W, H])
  return <canvas id={id} ref={ref} style={{ display: 'block', maxWidth: '100%' }} />
}

export default function MomentumRadar() {
  return (
    <div className="sec">
      <div className="sec-ey"><div className="sec-ln" /><span className="sec-lb">STORY MOMENTUM RADAR</span></div>
      <div className="sec-tt">CLUSTER ANALYSIS</div>
      <div className="radar-sec">
        <RadarCanvas id="hradar" W={300} H={300} />
        <div className="rl">
          {ITEMS.map(item => (
            <div key={item.name} className="rl-item">
              <div className="rl-dot" style={{ background: item.color, boxShadow: `0 0 8px ${item.shadow}` }} />
              <div>
                <div className="rl-name">{item.name}</div>
                <div className="rl-sub">{item.sub}</div>
              </div>
              <div className="rl-sc" style={{ color: item.color }}>{item.score}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export { RadarCanvas }
