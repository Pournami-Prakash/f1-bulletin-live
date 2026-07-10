'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { CIRCUITS } from '@/components/circuit_paths'

type CalendarRace = {
  round: number
  race_name: string
  circuit_name: string
  city?: string
  country?: string
  race_date: string
  race_start_utc: string
  circuit_length_km: number | null
  race_laps: number | null
  lap_record: string | null
  lap_record_holder: string | null
  lap_record_year: number | null
  drs_zones: number | null
  is_sprint_weekend: boolean
  is_completed: boolean
}

type PredictionDriver = {
  driver_code: string
  team: string
  predicted_position: number
  win_probability: number
  podium_probability: number
  grid_position: number | null
  points_expected: number
}

type Prediction = {
  season: number
  round: number
  gp_name: string
  circuit: string
  model_version: string
  confidence: number
  simulation_runs: number
  predicted_at: string
  has_actuals: boolean
  drivers: PredictionDriver[]
}

type CircuitProfile = {
  type: string
  downforce: string
  overtaking: string
  tyreStress: string
  rhythm: string
  setup: string
}

const mono = 'var(--font-mono)'
const bebas = 'var(--font-bebas)'

const TEAM_COLORS: Record<string, string> = {
  Mercedes: '#27F4D2',
  'Red Bull Racing': '#3671C6',
  Ferrari: '#E8002D',
  McLaren: '#FF8000',
  'Aston Martin': '#229971',
  Alpine: '#FF87BC',
  Williams: '#64C4FF',
  'Racing Bulls': '#6692FF',
  'Kick Sauber': '#52E252',
  'Haas F1 Team': '#B6BABD',
  Cadillac: '#C8A951',
  Audi: '#C8A951',
}

const CIRCUIT_PROFILES: Record<string, CircuitProfile> = {
  monaco: { type: 'Street', downforce: 'Maximum', overtaking: 'Very low', tyreStress: 'Low', rhythm: 'Precision stop-start', setup: 'Mechanical grip and qualifying track position dominate.' },
  spa: { type: 'Permanent', downforce: 'Medium-low', overtaking: 'High', tyreStress: 'High', rhythm: 'Long lap, mixed sectors', setup: 'Straight-line efficiency matters without giving away sector-two stability.' },
  silverstone: { type: 'Permanent', downforce: 'Medium-high', overtaking: 'Medium', tyreStress: 'High', rhythm: 'High-speed flow', setup: 'Front stability and tyre temperature control decide stint pace.' },
  spielberg: { type: 'Permanent', downforce: 'Medium', overtaking: 'High', tyreStress: 'Medium', rhythm: 'Short lap, traction exits', setup: 'Brake stability, kerb ride, and traction are worth more than pure corner count.' },
  barcelona: { type: 'Permanent', downforce: 'High', overtaking: 'Medium-low', tyreStress: 'High', rhythm: 'Aero benchmark', setup: 'A strong all-round car usually converts here.' },
  montreal: { type: 'Street hybrid', downforce: 'Medium-low', overtaking: 'High', tyreStress: 'Medium', rhythm: 'Stop-start', setup: 'Traction, braking confidence, and rear stability into chicanes are decisive.' },
  miami: { type: 'Street hybrid', downforce: 'Medium', overtaking: 'Medium', tyreStress: 'Medium-high', rhythm: 'Traction plus long straight', setup: 'Rear tyre control and low-speed traction shape race pace.' },
  suzuka: { type: 'Permanent', downforce: 'High', overtaking: 'Medium', tyreStress: 'High', rhythm: 'Linked high-speed corners', setup: 'Driver confidence through the Esses magnifies small aero gaps.' },
  shanghai: { type: 'Permanent', downforce: 'Medium', overtaking: 'High', tyreStress: 'High', rhythm: 'Long corners and heavy braking', setup: 'Front-left management and traction out of slow hairpins matter.' },
  melbourne: { type: 'Street hybrid', downforce: 'Medium-high', overtaking: 'Medium', tyreStress: 'Medium', rhythm: 'Fast parkland flow', setup: 'Confidence over kerbs and stable direction changes are key.' },
  hungaroring: { type: 'Permanent', downforce: 'High', overtaking: 'Low', tyreStress: 'Medium-high', rhythm: 'Tight, relentless corners', setup: 'Qualifying and cooling can matter as much as race speed.' },
  zandvoort: { type: 'Permanent', downforce: 'High', overtaking: 'Low-medium', tyreStress: 'Medium-high', rhythm: 'Banked, committed', setup: 'Balance through banking and wind sensitivity can swing performance.' },
  monza: { type: 'Permanent', downforce: 'Low', overtaking: 'High', tyreStress: 'Medium', rhythm: 'Power and braking', setup: 'Drag efficiency and braking stability decide the race shape.' },
  baku: { type: 'Street', downforce: 'Low-medium', overtaking: 'High', tyreStress: 'Medium', rhythm: 'Castle precision plus huge straight', setup: 'Low drag matters, but wall risk punishes nervous rear ends.' },
  singapore: { type: 'Street', downforce: 'High', overtaking: 'Low', tyreStress: 'High', rhythm: 'Hot, bumpy, stop-start', setup: 'Rear traction, cooling, and driver consistency are the race.' },
  austin: { type: 'Permanent', downforce: 'Medium-high', overtaking: 'Medium-high', tyreStress: 'High', rhythm: 'Mixed-sector benchmark', setup: 'Aero efficiency and tyre degradation both show up clearly.' },
  mexico: { type: 'Permanent', downforce: 'High', overtaking: 'Medium', tyreStress: 'Medium', rhythm: 'Low air density', setup: 'Cooling and power-unit behavior at altitude reshape normal strengths.' },
  interlagos: { type: 'Permanent', downforce: 'Medium-high', overtaking: 'High', tyreStress: 'Medium-high', rhythm: 'Short lap, weather risk', setup: 'Traction and changeable conditions create upset potential.' },
  vegas: { type: 'Street', downforce: 'Low', overtaking: 'High', tyreStress: 'Low-medium', rhythm: 'Long straights, cold track', setup: 'Tyre warmup and straight-line speed are the main levers.' },
  lusail: { type: 'Permanent', downforce: 'High', overtaking: 'Medium', tyreStress: 'Very high', rhythm: 'Fast loaded corners', setup: 'Tyre load management is the first-order constraint.' },
  yas: { type: 'Permanent', downforce: 'Medium', overtaking: 'Medium', tyreStress: 'Medium', rhythm: 'Traction and braking', setup: 'Rear stability and clean traction out of slow corners help most.' },
}

function keyForCircuit(name: string) {
  const value = name.toLowerCase()
  if (value.includes('monaco')) return 'monaco'
  if (value.includes('spa')) return 'spa'
  if (value.includes('silverstone')) return 'silverstone'
  if (value.includes('red bull')) return 'spielberg'
  if (value.includes('barcelona')) return 'barcelona'
  if (value.includes('gilles') || value.includes('montr')) return 'montreal'
  if (value.includes('miami')) return 'miami'
  if (value.includes('suzuka')) return 'suzuka'
  if (value.includes('shanghai')) return 'shanghai'
  if (value.includes('albert') || value.includes('melbourne')) return 'melbourne'
  if (value.includes('hungaroring')) return 'hungaroring'
  if (value.includes('zandvoort')) return 'zandvoort'
  if (value.includes('monza')) return 'monza'
  if (value.includes('baku')) return 'baku'
  if (value.includes('singapore') || value.includes('marina')) return 'singapore'
  if (value.includes('americas') || value.includes('austin')) return 'austin'
  if (value.includes('mexico')) return 'mexico'
  if (value.includes('interlagos') || value.includes('sao paulo')) return 'interlagos'
  if (value.includes('vegas')) return 'vegas'
  if (value.includes('lusail') || value.includes('qatar')) return 'lusail'
  if (value.includes('yas') || value.includes('abu dhabi')) return 'yas'
  return 'default'
}

function formatDate(value?: string) {
  if (!value) return 'TBD'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
}

function formatTime(value?: string) {
  if (!value) return 'TBD'
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).toUpperCase()
}

function teamColor(team: string) {
  return TEAM_COLORS[team] ?? '#888'
}

export default function CircuitPage() {
  const [calendar, setCalendar] = useState<CalendarRace[]>([])
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/calendar?season=2026')
      .then(r => r.json())
      .then((rows: CalendarRace[]) => {
        const races = Array.isArray(rows) ? rows : []
        setCalendar(races)
        const now = Date.now()
        const upcoming = races.find(r => new Date(r.race_start_utc || r.race_date).getTime() >= now)
        setSelectedRound((upcoming ?? races[races.length - 1])?.round ?? null)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedRound) return
    setPrediction(null)
    fetch(`/api/predictions?season=2026&round=${selectedRound}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Prediction | null) => setPrediction(data?.drivers ? data : null))
      .catch(() => setPrediction(null))
  }, [selectedRound])

  const race = useMemo(
    () => calendar.find(r => r.round === selectedRound) ?? calendar[0],
    [calendar, selectedRound],
  )
  const track = useMemo(
    () => CIRCUITS.find(c => Number(c.rd) === race?.round),
    [race?.round],
  )
  const profile = useMemo(() => {
    if (!race) return null
    return CIRCUIT_PROFILES[keyForCircuit(race.circuit_name)] ?? {
      type: race.circuit_name.toLowerCase().includes('street') ? 'Street' : 'Permanent',
      downforce: 'Medium',
      overtaking: 'Medium',
      tyreStress: 'Medium',
      rhythm: 'Mixed',
      setup: 'Use race-week practice, qualifying, and model signals once available.',
    }
  }, [race])
  const topDrivers = prediction?.drivers.slice(0, 8) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <main style={{ width: '100%', maxWidth: 1180, margin: '0 auto', padding: 'calc(var(--header-h) + 36px) 20px 80px', display: 'grid', gap: 18 }}>
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(280px,.8fr)', gap: 18, alignItems: 'stretch' }}>
          <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, padding: 24, background: 'rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 1, background: '#E10600' }} />
              <span style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.36)', letterSpacing: '.18em' }}>
                {loading ? 'LOADING CIRCUIT' : race ? `ROUND ${race.round} · 2026` : 'CIRCUIT'}
              </span>
            </div>
            <h1 style={{ fontFamily: bebas, fontSize: 'clamp(44px,7vw,86px)', lineHeight: .9, margin: 0, letterSpacing: '.02em' }}>
              {race ? race.race_name.replace(' Grand Prix', '').toUpperCase() : 'RACE'} <span style={{ color: '#E10600' }}>GP</span>
            </h1>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {[race?.circuit_name, race?.country, formatDate(race?.race_date), formatTime(race?.race_start_utc)].filter(Boolean).map(item => (
                <span key={item} style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.42)', letterSpacing: '.08em' }}>{item}</span>
              ))}
            </div>
            <div style={{ marginTop: 22, maxWidth: 560, fontFamily: mono, fontSize: 12, lineHeight: 1.7, color: 'rgba(255,255,255,.55)' }}>
              {profile?.setup}
            </div>
          </div>

          <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, padding: 18, background: 'rgba(0,0,0,.32)', display: 'grid', placeItems: 'center', minHeight: 260 }}>
            {track ? (
              <svg viewBox={`0 0 ${track.vw} ${track.vh}`} style={{ width: '100%', maxWidth: 360, overflow: 'visible' }}>
                <path d={track.d} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                <path d={track.d} fill="none" stroke="#E10600" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={track.sf[0]} cy={track.sf[1]} r="2.8" fill="#F59E0B" />
              </svg>
            ) : (
              <span style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.25)', letterSpacing: '.14em' }}>TRACK MAP UNAVAILABLE</span>
            )}
          </div>
        </section>

        <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.25)', letterSpacing: '.14em' }}>WEEKEND</span>
          <select
            value={selectedRound ?? ''}
            onChange={event => setSelectedRound(Number(event.target.value))}
            style={{ minWidth: 260, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(225,6,0,.35)', borderRadius: 6, color: '#fff', padding: '8px 12px', fontFamily: mono, fontSize: 11 }}
          >
            {calendar.map(r => (
              <option key={r.round} value={r.round}>R{r.round} · {r.race_name.replace(' Grand Prix', ' GP')}</option>
            ))}
          </select>
          {prediction && (
            <span style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.1em' }}>
              MODEL {prediction.model_version} · {prediction.simulation_runs.toLocaleString()} SIMS
            </span>
          )}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,.07)' }}>
          {[
            ['TYPE', profile?.type],
            ['DOWNFORCE', profile?.downforce],
            ['OVERTAKING', profile?.overtaking],
            ['TYRE STRESS', profile?.tyreStress],
            ['LENGTH', race?.circuit_length_km ? `${Number(race.circuit_length_km).toFixed(3)} KM` : 'TBD'],
            ['LAPS', race?.race_laps ?? 'TBD'],
            ['DRS ZONES', race?.drs_zones ?? 'TBD'],
            ['SPRINT', race?.is_sprint_weekend ? 'YES' : 'NO'],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: '16px 18px', background: '#080A0D' }}>
              <div style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.24)', letterSpacing: '.14em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: bebas, fontSize: 24, color: label === 'OVERTAKING' ? '#F59E0B' : '#fff', letterSpacing: '.03em' }}>{value}</div>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,.7fr)', gap: 18 }}>
          <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', background: 'rgba(0,0,0,.35)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 2, height: 14, background: '#E10600' }} />
              <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.14em', color: 'rgba(255,255,255,.5)' }}>MODEL OUTLOOK</span>
            </div>
            {topDrivers.length ? topDrivers.map((driver, index) => {
              const color = teamColor(driver.team)
              return (
                <div key={driver.driver_code} style={{ display: 'grid', gridTemplateColumns: '34px 70px 1fr 72px 72px', gap: 10, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.04)', background: index < 3 ? `${color}08` : 'transparent' }}>
                  <span style={{ fontFamily: bebas, fontSize: 18, color: index === 0 ? '#F59E0B' : 'rgba(255,255,255,.32)' }}>{index + 1}</span>
                  <span style={{ fontFamily: bebas, fontSize: 20, color }}>{driver.driver_code}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.38)' }}>{driver.team}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: '#F59E0B' }}>{(driver.win_probability * 100).toFixed(1)}% WIN</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.34)' }}>P{driver.grid_position ?? '-'}</span>
                </div>
              )
            }) : (
              <div style={{ padding: 28, fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.32)', letterSpacing: '.12em' }}>
                NO PREDICTION HAS BEEN WRITTEN FOR THIS ROUND YET
              </div>
            )}
          </div>

          <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, padding: 18, background: 'rgba(0,0,0,.25)' }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.28)', letterSpacing: '.14em', marginBottom: 14 }}>RACE NOTES</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['RHYTHM', profile?.rhythm],
                ['LAP RECORD', race?.lap_record ? `${race.lap_record} · ${race.lap_record_holder ?? ''} ${race.lap_record_year ?? ''}` : 'TBD'],
                ['STATUS', race?.is_completed ? 'Completed' : 'Upcoming / awaiting completion'],
                ['CONFIDENCE', prediction ? `${Math.round(prediction.confidence * 100)}%` : 'No model yet'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.22)', letterSpacing: '.12em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,.58)', lineHeight: 1.5 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
