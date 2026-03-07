'use client'
import { useEffect, useRef } from 'react'

export default function BgCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const bgc = ref.current
    if (!bgc) return
    const bx = bgc.getContext('2d')!
    let BW = 0, BH = 0, BT = 0, raf = 0

    function rBG() {
      BW = bgc!.width = window.innerWidth
      BH = bgc!.height = window.innerHeight
    }
    rBG()
    window.addEventListener('resize', rBG)

    const orbs = [
      { x: .1, y: .2, r: 560, c: 'rgba(225,6,0,.05)', dx: .00016, dy: .00012 },
      { x: .86, y: .58, r: 490, c: 'rgba(56,189,248,.028)', dx: -.00013, dy: .00017 },
      { x: .44, y: .88, r: 380, c: 'rgba(245,158,11,.022)', dx: .00011, dy: -.00016 },
    ]
    const pts = Array.from({ length: 80 }, () => ({
      x: Math.random() * 3000, y: Math.random() * 3000,
      vx: (Math.random() - .5) * .1, vy: -(Math.random() * .16 + .04),
      r: Math.random() * .7 + .15, a: Math.random() * .12 + .025,
      life: Math.random(), dec: Math.random() * .001 + .0003,
      red: Math.random() > .85,
    }))

    function loop() {
      BT++
      bx.clearRect(0, 0, BW, BH)
      orbs.forEach(o => {
        const x = (o.x + Math.sin(BT * o.dx * 1000) * .1) * BW
        const y = (o.y + Math.cos(BT * o.dy * 1000) * .08) * BH
        const g = bx.createRadialGradient(x, y, 0, x, y, o.r)
        g.addColorStop(0, o.c); g.addColorStop(1, 'transparent')
        bx.fillStyle = g; bx.beginPath(); bx.arc(x, y, o.r, 0, Math.PI * 2); bx.fill()
      })
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.life -= p.dec
        if (p.life <= 0 || p.y < -5) { p.y = BH + 5; p.x = Math.random() * BW; p.life = 1 }
        bx.save(); bx.globalAlpha = p.life * p.a
        bx.fillStyle = p.red ? 'rgba(225,6,0,1)' : 'rgba(255,255,255,1)'
        bx.beginPath(); bx.arc(p.x, p.y, p.r, 0, Math.PI * 2); bx.fill(); bx.restore()
      })
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', rBG) }
  }, [])

  return <canvas id="bgc" ref={ref} />
}
