'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Ticker from '@/components/Ticker'
import Footer from '@/components/Footer'

// ── Types ──────────────────────────────────────────────────────────────────────
type DriverPrediction = {
  driver_code: string
  team: string
  predicted_position: number
  win_probability: number
  podium_probability: number
  points_expected: number
  confidence: number
  elo_rating: number
  grid_position: number | null
  gap_to_pole_ms: number | null
  rolling_avg_finish: number
  is_upset_pick: boolean
  upset_score: number | null
  actual_position: number | null
  actual_points: number | null
  position_error: number | null
}

type ChampionshipRow = {
  driver_code: string
  team: string
  actual_points: number
  projected_total: number
  races_done: number
  races_remaining: number
}

type RacePrediction = {
  season: number
  round: number
  gp_name: string
  circuit: string
  model_version: string
  confidence: number
  simulation_runs: number
  data_weight_2026: number
  predicted_at: string
  has_actuals: boolean
  drivers: DriverPrediction[]
  championship: ChampionshipRow[]
  accuracy: {
    mae_position: number | null
    winner_correct: boolean | null
    podium_hits: number | null
    top5_hits: number | null
    brier_score: number | null
  } | null
}

// ── Team colours ───────────────────────────────────────────────────────────────
const TEAM_COLORS: Record<string, string> = {
  'Mercedes': '#27F4D2',
  'Red Bull Racing': '#3671C6',
  'Ferrari': '#E8002D',
  'McLaren': '#FF8000',
  'Aston Martin': '#229971',
  'Alpine': '#FF87BC',
  'Williams': '#64C4FF',
  'Racing Bulls': '#6692FF',
  'Kick Sauber': '#52E252',
  'Haas F1 Team': '#B6BABD',
  'Cadillac': '#C8A951',
}
const teamColor = (team: string) => TEAM_COLORS[team] ?? '#888'

const mono  = 'var(--font-mono)'
const bebas = 'var(--font-bebas)'

// ── Mock data for UI development ───────────────────────────────────────────────
const MOCK: RacePrediction = {
  season: 2026, round: 2, gp_name: 'Chinese Grand Prix', circuit: 'Shanghai',
  model_version: 'v3_bayesian_ridge_mc', confidence: 0.35, simulation_runs: 500,
  data_weight_2026: 0.10, predicted_at: new Date().toISOString(),
  has_actuals: false, accuracy: null,
  championship: [
    { driver_code: 'ANT', team: 'Mercedes',        actual_points: 43, projected_total: 430, races_done: 2, races_remaining: 22 },
    { driver_code: 'RUS', team: 'Mercedes',        actual_points: 43, projected_total: 336, races_done: 2, races_remaining: 22 },
    { driver_code: 'HAM', team: 'Ferrari',         actual_points: 27, projected_total: 268, races_done: 2, races_remaining: 22 },
    { driver_code: 'LEC', team: 'Ferrari',         actual_points: 27, projected_total: 245, races_done: 2, races_remaining: 22 },
    { driver_code: 'GAS', team: 'Alpine',          actual_points: 9,  projected_total: 198, races_done: 2, races_remaining: 22 },
  ],
  drivers: [
    { driver_code:'ANT', team:'Mercedes',        predicted_position:1,  win_probability:0.200, podium_probability:0.470, points_expected:14.1, confidence:0.35, elo_rating:1520, grid_position:1,  gap_to_pole_ms:0,    rolling_avg_finish:8.2,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'RUS', team:'Mercedes',        predicted_position:2,  win_probability:0.176, podium_probability:0.462, points_expected:12.2, confidence:0.35, elo_rating:1570, grid_position:2,  gap_to_pole_ms:222,  rolling_avg_finish:4.1,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'LEC', team:'Ferrari',         predicted_position:3,  win_probability:0.109, podium_probability:0.321, points_expected:10.1, confidence:0.35, elo_rating:1590, grid_position:4,  gap_to_pole_ms:364,  rolling_avg_finish:4.8,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'HAM', team:'Ferrari',         predicted_position:4,  win_probability:0.106, podium_probability:0.343, points_expected:10.0, confidence:0.35, elo_rating:1560, grid_position:3,  gap_to_pole_ms:351,  rolling_avg_finish:5.1,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'PIA', team:'McLaren',         predicted_position:5,  win_probability:0.085, podium_probability:0.239, points_expected:6.5,  confidence:0.35, elo_rating:1540, grid_position:5,  gap_to_pole_ms:486,  rolling_avg_finish:5.5,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'NOR', team:'McLaren',         predicted_position:6,  win_probability:0.065, podium_probability:0.244, points_expected:6.3,  confidence:0.35, elo_rating:1640, grid_position:6,  gap_to_pole_ms:544,  rolling_avg_finish:3.2,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'VER', team:'Red Bull Racing', predicted_position:7,  win_probability:0.062, podium_probability:0.208, points_expected:6.8,  confidence:0.35, elo_rating:1680, grid_position:8,  gap_to_pole_ms:938,  rolling_avg_finish:2.8,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'GAS', team:'Alpine',          predicted_position:8,  win_probability:0.049, podium_probability:0.151, points_expected:7.4,  confidence:0.35, elo_rating:1490, grid_position:7,  gap_to_pole_ms:809,  rolling_avg_finish:9.1,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'HAD', team:'Red Bull Racing', predicted_position:9,  win_probability:0.029, podium_probability:0.097, points_expected:4.3,  confidence:0.35, elo_rating:1430, grid_position:9,  gap_to_pole_ms:1057, rolling_avg_finish:11.2, is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'BEA', team:'Haas F1 Team',   predicted_position:10, win_probability:0.023, podium_probability:0.085, points_expected:3.8,  confidence:0.35, elo_rating:1410, grid_position:10, gap_to_pole_ms:1228, rolling_avg_finish:13.1, is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'HUL', team:'Kick Sauber',    predicted_position:11, win_probability:0.008, podium_probability:0.041, points_expected:1.9,  confidence:0.35, elo_rating:1450, grid_position:11, gap_to_pole_ms:1290, rolling_avg_finish:12.3, is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'COL', team:'Alpine',          predicted_position:12, win_probability:0.004, podium_probability:0.022, points_expected:1.2,  confidence:0.35, elo_rating:1400, grid_position:12, gap_to_pole_ms:1340, rolling_avg_finish:14.1, is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
  ]
}

// ── Confidence bar ─────────────────────────────────────────────────────────────
function ConfidenceMeter({ value }: { value: number }) {
  const pct   = Math.round(value * 100)
  const color = pct < 40 ? '#F59E0B' : pct < 70 ? '#38BDF8' : '#4ADE80'
  const label = pct < 40 ? 'LOW CONFIDENCE' : pct < 70 ? 'BUILDING' : 'HIGH CONFIDENCE'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .6s ease' }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: mono, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
        {pct}% — {label}
      </span>
    </div>
  )
}

// ── Win probability bar ────────────────────────────────────────────────────────
function ProbBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = (value / Math.max(max, 0.01)) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
      <div style={{ width: 28, textAlign: 'right', fontSize: 9, color: 'rgba(255,255,255,.35)', fontFamily: mono }}>{label}</div>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .8s ease' }} />
      </div>
      <div style={{ width: 36, fontSize: 10, color, fontFamily: mono, textAlign: 'right' }}>
        {(value * 100).toFixed(1)}%
      </div>
    </div>
  )
}

// ── Podium card ────────────────────────────────────────────────────────────────
function PodiumCard({ driver, position, mounted }: { driver: DriverPrediction; position: 1|2|3; mounted: boolean }) {
  const color  = teamColor(driver.team)
  const delays = { 1: 200, 2: 400, 3: 600 }
  const sizes  = { 1: 72,  2: 56,  3: 48  }
  const labels = { 1: 'RACE WINNER', 2: 'PODIUM P2', 3: 'PODIUM P3' }
  const podiumH = { 1: 120, 2: 80, 3: 60 }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'none' : 'translateY(20px)',
      transition: `opacity .5s ease ${delays[position]}ms, transform .5s ease ${delays[position]}ms`,
    }}>
      <div style={{
        width: '100%', padding: '14px 16px',
        background: position === 1
          ? `linear-gradient(135deg, ${color}25 0%, rgba(0,0,0,.4) 100%)`
          : 'rgba(0,0,0,.3)',
        border: `1px solid ${color}35`,
        borderBottom: 'none',
        borderRadius: '8px 8px 0 0',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: 10, top: 4,
          fontFamily: bebas, fontSize: 64, lineHeight: 1,
          color: `${color}12`, pointerEvents: 'none', letterSpacing: '.02em',
        }}>P{position}</div>

        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.16em', marginBottom: 6 }}>
          {labels[position]}
        </div>
        <div style={{ fontFamily: bebas, fontSize: sizes[position], color, lineHeight: .9, letterSpacing: '.02em' }}>
          {driver.driver_code}
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', fontFamily: mono, letterSpacing: '.06em', marginTop: 4 }}>
          {driver.team}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
          <div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,.25)', fontFamily: mono, letterSpacing: '.1em' }}>WIN</div>
            <div style={{ fontFamily: bebas, fontSize: 22, color, lineHeight: 1 }}>
              {(driver.win_probability * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,.25)', fontFamily: mono, letterSpacing: '.1em' }}>PODIUM</div>
            <div style={{ fontFamily: bebas, fontSize: 22, color: 'rgba(255,255,255,.6)', lineHeight: 1 }}>
              {(driver.podium_probability * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,.25)', fontFamily: mono, letterSpacing: '.1em' }}>GRID</div>
            <div style={{ fontFamily: bebas, fontSize: 22, color: 'rgba(255,255,255,.6)', lineHeight: 1 }}>
              P{driver.grid_position}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        width: '100%',
        height: podiumH[position],
        background: position === 1
          ? `${color}25`
          : position === 2 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.04)',
        border: `1px solid ${color}25`,
        borderTop: `3px solid ${color}`,
        borderRadius: '0 0 6px 6px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 8,
      }}>
        <span style={{ fontFamily: bebas, fontSize: 28, color: `${color}60`, letterSpacing: '.06em' }}>
          {position}
        </span>
      </div>
    </div>
  )
}

// ── Driver row ─────────────────────────────────────────────────────────────────
function DriverRow({ driver, index, maxWin, mounted }: {
  driver: DriverPrediction; index: number; maxWin: number; mounted: boolean
}) {
  const color   = teamColor(driver.team)
  const isTop3  = driver.predicted_position <= 3
  const isDone  = driver.actual_position !== null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 48px 110px 1fr 120px 120px 44px 44px',
      alignItems: 'center',
      padding: '10px 16px',
      borderBottom: '1px solid rgba(255,255,255,.03)',
      background: isTop3 ? `${color}07` : index % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent',
      borderLeft: isTop3 ? `2px solid ${color}55` : '2px solid transparent',
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'none' : 'translateX(-8px)',
      transition: `opacity .3s ease ${Math.min(index * 30, 400)}ms, transform .3s ease ${Math.min(index * 30, 400)}ms`,
    }}>
      <div style={{
        fontFamily: bebas, fontSize: isTop3 ? 18 : 13,
        color: index === 0 ? '#F59E0B' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : 'rgba(255,255,255,.25)',
      }}>
        {index + 1}
      </div>

      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: mono }}>
        P{driver.grid_position ?? '—'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <div style={{ width: 2, height: 14, background: color, borderRadius: 1, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: bebas, fontSize: 14, color: '#fff', letterSpacing: '.04em', lineHeight: 1 }}>
            {driver.driver_code}
            {driver.is_upset_pick && (
              <span style={{ fontSize: 9, color: '#F59E0B', marginLeft: 5, fontFamily: mono }}>⚡</span>
            )}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.04em' }}>
            {driver.team}
          </div>
        </div>
      </div>

      <div style={{ paddingRight: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${(driver.win_probability / Math.max(maxWin, 0.01)) * 100}%`,
              height: '100%', background: color, borderRadius: 2,
              transition: 'width .8s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, color, fontFamily: mono, minWidth: 38, textAlign: 'right' }}>
            {(driver.win_probability * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div style={{ paddingRight: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${driver.podium_probability * 100}%`,
              height: '100%', background: 'rgba(167,139,250,.6)', borderRadius: 2,
              transition: 'width .8s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, color: '#A78BFA', fontFamily: mono, minWidth: 38, textAlign: 'right' }}>
            {(driver.podium_probability * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <div style={{ fontSize: 10, color: driver.points_expected > 5 ? '#F59E0B' : 'rgba(255,255,255,.3)', fontFamily: mono }}>
        {driver.points_expected.toFixed(1)}P
      </div>

      <div>
        {isDone ? (
          <div style={{
            fontSize: 10, fontFamily: mono,
            color: Math.abs(driver.position_error ?? 0) <= 2 ? '#4ADE80' : '#E10600',
          }}>
            P{driver.actual_position}
          </div>
        ) : (
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,.15)', fontFamily: mono }}>TBD</div>
        )}
      </div>
    </div>
  )
}

// ── Accuracy card ──────────────────────────────────────────────────────────────
function AccuracyCard({ accuracy }: { accuracy: NonNullable<RacePrediction['accuracy']> }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
      gap: 1, marginTop: 1,
    }}>
      {[
        { label: 'WINNER',        value: accuracy.winner_correct ? '✓' : '✗',                                               color: accuracy.winner_correct ? '#4ADE80' : '#E10600' },
        { label: 'PODIUM HITS',   value: `${accuracy.podium_hits}/3`,                                                        color: (accuracy.podium_hits ?? 0) >= 2 ? '#4ADE80' : '#F59E0B' },
        { label: 'TOP 5 HITS',    value: `${accuracy.top5_hits}/5`,                                                          color: '#38BDF8' },
        { label: 'AVG POS ERROR', value: accuracy.mae_position ? parseFloat(String(accuracy.mae_position)).toFixed(2) : '—', color: (parseFloat(String(accuracy.mae_position ?? 99))) < 3 ? '#4ADE80' : '#F59E0B' },
      ].map(k => (
        <div key={k.label} style={{ padding: '12px 16px', background: 'rgba(0,0,0,.3)', borderBottom: `2px solid ${k.color}30` }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.14em', marginBottom: 4 }}>
            {k.label}
          </div>
          <div style={{ fontFamily: bebas, fontSize: 24, color: k.color, lineHeight: 1 }}>{k.value}</div>
        </div>
      ))}
    </div>
  )
}

// ── Championship table ─────────────────────────────────────────────────────────
function ChampionshipTable({ rows }: { rows: ChampionshipRow[] }) {
  const maxP = rows[0]?.projected_total ?? 1
  return (
    <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,.35)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 2, height: 14, background: '#F59E0B', borderRadius: 1 }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>CHAMPIONSHIP PROJECTION</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,.15)', fontFamily: mono, marginLeft: 'auto' }}>
          {rows[0]?.races_done ?? 0} done · {rows[0]?.races_remaining ?? 0} remaining · based on current pace
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 140px 1fr 80px 80px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
        {['#', 'DRIVER', 'PROJECTED PACE', 'ACTUAL', 'EST FINAL'].map(h => (
          <div key={h} style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>{h}</div>
        ))}
      </div>
      {rows.slice(0, 10).map((row, i) => {
        const color = teamColor(row.team)
        return (
          <div key={row.driver_code} style={{ display: 'grid', gridTemplateColumns: '32px 140px 1fr 80px 80px', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', background: i % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent' }}>
            <div style={{ fontFamily: bebas, fontSize: i < 3 ? 16 : 12, color: i === 0 ? '#F59E0B' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'rgba(255,255,255,.25)' }}>{i + 1}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 2, height: 12, background: color, borderRadius: 1 }} />
              <div>
                <div style={{ fontFamily: bebas, fontSize: 13, color: '#fff', letterSpacing: '.04em' }}>{row.driver_code}</div>
                <div style={{ fontSize: 7, color: 'rgba(255,255,255,.25)', fontFamily: mono }}>{row.team}</div>
              </div>
            </div>
            <div style={{ paddingRight: 16 }}>
              <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(row.projected_total / maxP) * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .8s ease' }} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: mono }}>{row.actual_points}pts</div>
            <div style={{ fontSize: 11, fontFamily: bebas, color: i === 0 ? '#F59E0B' : 'rgba(255,255,255,.55)', letterSpacing: '.02em' }}>~{row.projected_total}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PredictionsPage() {
  const [data, setData]           = useState<RacePrediction | null>(null)
  const [loading, setLoading]     = useState(true)
  const [mounted, setMounted]     = useState(false)
  const [useMock, setUseMock]     = useState(false)
  const [season, setSeason]       = useState(2026)
  const [availableRounds, setAvailableRounds] = useState<{round: number; gp_name: string}[]>([])
  const [selectedRound, setSelectedRound]     = useState<number | null>(null)
  const [accuracy, setAccuracy]   = useState<any[]>([])
  const [showHistory, setShowHistory]           = useState(false)
  const [showChampionship, setShowChampionship] = useState(false)

  // Load available rounds from predictions table
  useEffect(() => {
    fetch(`/api/predictions/rounds?season=${season}`)
      .then(r => r.json())
      .then(d => {
        if (d.rounds?.length) {
          setAvailableRounds(d.rounds)
          setSelectedRound(d.rounds[0].round)
        }
      })
      .catch(() => {
        setAvailableRounds([{ round: 2, gp_name: 'Chinese Grand Prix' }])
        setSelectedRound(2)
      })
  }, [season])

  // Load prediction for selected round
  useEffect(() => {
    if (!selectedRound) return
    setLoading(true)
    setMounted(false)
    fetch(`/api/predictions?season=${season}&round=${selectedRound}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setUseMock(true); setData(MOCK) }
        else { setUseMock(false); setData(d) }
      })
      .catch(() => { setUseMock(true); setData(MOCK) })
      .finally(() => {
        setLoading(false)
        setTimeout(() => setMounted(true), 80)
      })
  }, [season, selectedRound])

  // Load accuracy history
  useEffect(() => {
    fetch('/api/predictions?history=1')
      .then(r => r.json())
      .then(d => { if (d.accuracy_history) setAccuracy(d.accuracy_history) })
      .catch(() => {})
  }, [])

  const top3   = data?.drivers.slice(0, 3) ?? []
  const rest   = data?.drivers.slice(3)    ?? []
  const maxWin = data?.drivers[0]?.win_probability ?? 1
  const upsets = data?.drivers.filter(d => d.is_upset_pick) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <Ticker />

      <main style={{
        width: '100%', maxWidth: 1320, margin: '0 auto',
        padding: 'calc(var(--header-h) + 36px + 36px) 20px 80px',
        display: 'grid', gap: 20,
      }}>

        {/* ── MASTHEAD ── */}
        <div style={{ opacity: mounted ? 1 : 0, transition: 'opacity .4s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 20, height: 1, background: '#E10600' }} />
            <span style={{ fontSize: 9, letterSpacing: '.18em', color: 'rgba(255,255,255,.3)', fontFamily: mono }}>
              RACE INTELLIGENCE · MONTE CARLO · {data?.simulation_runs ?? 500} SIMULATIONS
            </span>
            {useMock && (
              <span style={{ fontSize: 8, letterSpacing: '.1em', color: '#F59E0B', fontFamily: mono, padding: '2px 8px', border: '1px solid rgba(245,158,11,.3)', borderRadius: 3 }}>
                PREVIEW DATA
              </span>
            )}
          </div>

          <div style={{ fontFamily: bebas, fontSize: 'clamp(40px,5.5vw,72px)', letterSpacing: '.02em', lineHeight: .9 }}>
            {data
              ? <>{data.gp_name.replace(' Grand Prix','').toUpperCase()}{' '}
                  <span style={{ color: '#E10600' }}>GP</span>{' '}
                  <span style={{ fontSize: '.42em', color: 'rgba(255,255,255,.2)', letterSpacing: '.08em', verticalAlign: 'middle' }}>{data.season}</span>
                </>
              : <>RACE <span style={{ color: '#E10600' }}>PREDICTIONS</span></>
            }
          </div>

          {data && (
            <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.08em' }}>
                ROUND {data.round} · {data.circuit.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.15)', fontFamily: mono }}>·</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.08em' }}>
                {new Date(data.predicted_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }).toUpperCase()}
              </span>
              {data.has_actuals && (
                <span style={{ fontSize: 9, color: '#4ADE80', fontFamily: mono, letterSpacing: '.1em', padding: '2px 8px', border: '1px solid rgba(74,222,128,.3)', borderRadius: 3 }}>
                  RACE COMPLETE
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── RACE SELECTOR ── */}
        {availableRounds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ padding: '5px 14px', border: '1px solid rgba(225,6,0,.4)', borderRadius: 5, background: 'rgba(225,6,0,.12)', flexShrink: 0 }}>
              <span style={{ color: '#E10600', fontFamily: mono, fontSize: 10, letterSpacing: '.1em' }}>2026</span>
            </div>
            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.08)', flexShrink: 0 }} />
            <div style={{ position: 'relative', minWidth: 0, flex: '1 1 180px', maxWidth: 260 }}>
              <select
                value={selectedRound ?? ''}
                onChange={e => setSelectedRound(parseInt(e.target.value))}
                style={{
                  width: '100%', background: 'rgba(0,0,0,.4)',
                  border: `1px solid rgba(225,6,0,.35)`,
                  borderRadius: 6, color: '#fff',
                  padding: '7px 32px 7px 12px',
                  fontFamily: mono, fontSize: 11, letterSpacing: '.04em',
                  cursor: 'pointer', outline: 'none', appearance: 'none',
                }}
              >
                {availableRounds.map(r => (
                  <option key={r.round} value={r.round}>
                    R{r.round} · {r.gp_name.replace(' Grand Prix', ' GP')}
                  </option>
                ))}
              </select>
              <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(255,255,255,.3)', fontSize: 10 }}>▾</div>
            </div>
            <button
              onClick={() => { setShowHistory(p => !p); setShowChampionship(false) }}
              style={{
                flexShrink: 0,
                background: showHistory ? 'rgba(56,189,248,.1)' : 'transparent',
                border: `1px solid ${showHistory ? 'rgba(56,189,248,.3)' : 'rgba(255,255,255,.08)'}`,
                borderRadius: 5, color: showHistory ? '#38BDF8' : 'rgba(255,255,255,.3)',
                padding: '5px 14px', cursor: 'pointer', fontFamily: mono, fontSize: 10, letterSpacing: '.1em',
                whiteSpace: 'nowrap',
              }}>
              ACCURACY HISTORY
            </button>
            <button
              onClick={() => { setShowChampionship(p => !p); setShowHistory(false) }}
              style={{
                flexShrink: 0,
                background: showChampionship ? 'rgba(245,158,11,.1)' : 'transparent',
                border: `1px solid ${showChampionship ? 'rgba(245,158,11,.3)' : 'rgba(255,255,255,.08)'}`,
                borderRadius: 5, color: showChampionship ? '#F59E0B' : 'rgba(255,255,255,.3)',
                padding: '5px 14px', cursor: 'pointer', fontFamily: mono, fontSize: 10, letterSpacing: '.1em',
                whiteSpace: 'nowrap',
              }}>
              CHAMPIONSHIP
            </button>
          </div>
        )}

        {/* ── ACCURACY HISTORY ── */}
        {showHistory && accuracy.length > 0 && (
          <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,.35)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 2, height: 14, background: '#38BDF8', borderRadius: 1 }} />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>PAST RACE ACCURACY</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 60px 80px 80px 80px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
              {['ROUND', 'RACE', 'WINNER', 'PODIUM', 'TOP 5', 'MAE'].map(h => (
                <div key={h} style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>{h}</div>
              ))}
            </div>
            {accuracy.filter((row: any) => row.winner_correct !== null && row.round !== selectedRound).map((row: any, i: number) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr 60px 80px 80px 80px',
                padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,.03)',
                background: i % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent',
              }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: mono }}>R{row.round}</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono }}>{row.gp_name?.replace(' Grand Prix', ' GP')}</span>
                <span style={{ fontSize: 10, color: row.winner_correct ? '#4ADE80' : '#E10600', fontFamily: mono }}>{row.winner_correct ? '✓' : '✗'}</span>
                <span style={{ fontSize: 10, color: (row.podium_hits ?? 0) >= 2 ? '#4ADE80' : '#F59E0B', fontFamily: mono }}>{row.podium_hits}/3</span>
                <span style={{ fontSize: 10, color: '#38BDF8', fontFamily: mono }}>{row.top5_hits}/5</span>
                <span style={{ fontSize: 10, color: (parseFloat(row.mae_position) ?? 99) < 3 ? '#4ADE80' : '#F59E0B', fontFamily: mono }}>{row.mae_position ? parseFloat(row.mae_position).toFixed(1) : '—'}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── CHAMPIONSHIP ── */}
        {showChampionship && data?.championship?.length && (
          <ChampionshipTable rows={data.championship} />
        )}

        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.18em' }}>
              LOADING PREDICTIONS…
            </span>
          </div>
        ) : (showHistory || showChampionship) ? null : data ? (
          <>
            {/* ── MODEL CONFIDENCE ── */}
            <div style={{
              border: '1px solid rgba(255,255,255,.07)', borderRadius: 8,
              padding: '12px 16px', background: 'rgba(0,0,0,.2)',
              opacity: mounted ? 1 : 0, transition: 'opacity .4s ease .1s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.14em' }}>
                  MODEL CONFIDENCE — grows each race as 2026 data accumulates
                </span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: mono }}>
                  {data.model_version.toUpperCase()} · BAYESIAN + MONTE CARLO
                </span>
              </div>
              <ConfidenceMeter value={data.confidence} />
            </div>

            {/* ── ACCURACY (if race done) ── */}
            {data.accuracy && (
              <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,.35)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 2, height: 14, background: '#4ADE80', borderRadius: 1 }} />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>PREDICTION ACCURACY</span>
                </div>
                <AccuracyCard accuracy={data.accuracy} />
              </div>
            )}

            {/* ── PODIUM PREDICTION ── */}
            <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                padding: '10px 16px', background: 'rgba(0,0,0,.35)',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 2, height: 14, background: '#E10600', borderRadius: 1 }} />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>
                  PREDICTED PODIUM
                </span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.15)', fontFamily: mono, marginLeft: 'auto' }}>
                  Win probability from {data.simulation_runs} simulated races
                </span>
              </div>

              <div style={{ padding: '20px 20px 0', background: 'rgba(0,0,0,.15)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  {top3[1] && <PodiumCard driver={top3[1]} position={2} mounted={mounted} />}
                  {top3[0] && <PodiumCard driver={top3[0]} position={1} mounted={mounted} />}
                  {top3[2] && <PodiumCard driver={top3[2]} position={3} mounted={mounted} />}
                </div>
              </div>
            </div>

            {/* ── UPSET ALERTS ── */}
            {upsets.length > 0 && (
              <div style={{
                border: '1px solid rgba(245,158,11,.2)', borderRadius: 8,
                padding: '12px 16px', background: 'rgba(245,158,11,.05)',
                opacity: mounted ? 1 : 0, transition: 'opacity .4s ease .3s',
              }}>
                <div style={{ fontSize: 9, color: '#F59E0B', fontFamily: mono, letterSpacing: '.14em', marginBottom: 10 }}>
                  ⚡ UPSET ALERTS — drivers outperforming grid expectation
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {upsets.map(u => {
                    const color = teamColor(u.team)
                    return (
                      <div key={u.driver_code} style={{
                        padding: '6px 12px', borderRadius: 5,
                        border: `1px solid ${color}35`,
                        background: `${color}0a`,
                      }}>
                        <span style={{ fontFamily: bebas, fontSize: 14, color, letterSpacing: '.04em' }}>{u.driver_code}</span>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', fontFamily: mono, marginLeft: 6 }}>
                          P{u.grid_position} grid → {(u.win_probability*100).toFixed(1)}% win
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── FULL FIELD TABLE ── */}
            <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                padding: '10px 16px', background: 'rgba(0,0,0,.35)',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 2, height: 14, background: '#E10600', borderRadius: 1 }} />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>FULL FIELD PREDICTION</span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '32px 48px 110px 1fr 120px 120px 44px 44px',
                padding: '6px 16px',
                borderBottom: '1px solid rgba(255,255,255,.05)',
                background: 'rgba(0,0,0,.4)',
              }}>
                {['#', 'GRID', 'DRIVER', 'WIN PROBABILITY', 'PODIUM PROB', 'EXP PTS', 'RESULT'].map((h, i) => (
                  <div key={h} style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>{h}</div>
                ))}
              </div>

              {data.drivers.map((driver, i) => (
                <DriverRow
                  key={driver.driver_code}
                  driver={driver}
                  index={i}
                  maxWin={maxWin}
                  mounted={mounted}
                />
              ))}
            </div>

            {/* ── MODEL NOTES ── */}
            <div style={{
              border: '1px solid rgba(255,255,255,.05)', borderRadius: 8,
              padding: '14px 18px',
              opacity: mounted ? 1 : 0, transition: 'opacity .4s ease .5s',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.14em', marginBottom: 10 }}>
                MODEL NOTES
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {[
                  { label: 'METHOD', value: 'Bayesian Prior + Ridge Regression + Monte Carlo' },
                  { label: 'SIMULATIONS', value: `${data.simulation_runs} race simulations` },
                  { label: '2026 DATA WEIGHT', value: `${(data.data_weight_2026 * 100).toFixed(0)}% (grows each race)` },
                  { label: 'CONFIDENCE', value: `${(data.confidence * 100).toFixed(0)}% — ${data.confidence < 0.4 ? 'Early season, wide intervals' : data.confidence < 0.7 ? 'Mid season, building accuracy' : 'Late season, high accuracy'}` },
                ].map(n => (
                  <div key={n.label}>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em', marginBottom: 3 }}>{n.label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontFamily: mono }}>{n.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.18em' }}>
              NO PREDICTIONS AVAILABLE — RUN predict.py FIRST
            </span>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}