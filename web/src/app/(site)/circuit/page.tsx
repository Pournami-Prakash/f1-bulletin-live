'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'

// ── Monaco 2026 Circuit Data ──────────────────────────────────────────────────

const CIRCUIT = {
  id: 'mc-1929',
  name: 'CIRCUIT DE MONACO',
  gp: 'MONACO GRAND PRIX',
  country: 'Monaco',
  round: 6,
  dates: '5–7 JUN 2026',
  raceTime: '9:00 AM ET',
  established: 1929,
  svgPath: 'M 59.3 64.4 Q 59.1 65.2 59.2 65.6 Q 59.3 65.9 59.5 66.4 Q 59.8 66.9 60.0 67.3 Q 60.2 67.7 60.9 68.5 Q 61.6 69.4 65.2 74.3 Q 68.7 79.1 69.0 79.4 Q 69.2 79.8 69.6 79.9 Q 70.0 80.0 70.4 79.9 Q 70.9 79.7 71.2 79.5 Q 71.5 79.2 71.7 78.8 Q 71.9 78.4 72.0 78.0 Q 72.0 77.5 72.0 77.1 Q 72.0 76.8 72.1 76.5 Q 72.1 76.2 72.3 75.8 Q 72.5 75.4 72.7 75.2 Q 72.9 74.9 73.3 74.3 Q 73.7 73.7 74.0 73.2 Q 74.3 72.8 74.4 72.4 Q 74.5 72.1 74.6 72.0 Q 74.7 71.8 75.0 71.7 Q 75.2 71.7 75.4 71.7 Q 75.7 71.8 75.9 72.0 Q 76.0 72.2 76.1 72.5 Q 76.2 72.8 76.0 73.0 Q 75.9 73.2 75.6 73.4 Q 75.3 73.7 74.4 74.9 Q 73.4 76.0 73.3 76.3 Q 73.2 76.6 73.2 76.9 Q 73.2 77.1 73.2 77.4 Q 73.3 77.6 73.4 77.8 Q 73.5 78.0 73.9 78.2 Q 74.4 78.4 75.0 78.6 Q 75.7 78.8 76.1 78.9 Q 76.4 79.0 76.8 79.2 Q 77.2 79.3 77.7 79.5 Q 78.2 79.7 78.8 79.7 Q 79.4 79.8 79.7 79.6 Q 80.0 79.5 80.1 79.0 Q 80.2 78.5 80.1 75.8 Q 80.0 73.1 79.6 70.3 Q 79.2 67.5 78.7 65.7 Q 78.3 63.9 77.8 62.7 Q 77.3 61.4 76.5 59.9 Q 75.6 58.5 74.7 57.3 Q 73.7 56.0 72.3 54.5 Q 71.0 53.0 69.0 51.8 Q 67.0 50.6 65.8 50.0 Q 64.6 49.4 62.3 48.3 Q 60.1 47.3 58.5 46.7 Q 57.0 46.2 54.7 45.7 Q 52.5 45.1 51.0 44.9 Q 49.6 44.7 48.8 44.5 Q 48.0 44.4 47.9 44.2 Q 47.8 43.9 47.7 43.8 Q 47.7 43.6 47.7 43.3 Q 47.6 43.1 47.5 42.9 Q 47.4 42.7 47.1 42.5 Q 46.8 42.4 46.3 42.3 Q 45.9 42.3 45.4 42.6 Q 44.8 42.9 44.6 42.9 Q 44.3 42.9 40.2 42.4 Q 36.1 41.8 34.1 41.5 Q 32.1 41.2 30.2 40.9 Q 28.4 40.6 27.8 40.6 Q 27.3 40.5 27.0 40.4 Q 26.6 40.4 26.4 40.1 Q 26.1 39.9 25.8 39.1 Q 25.4 38.3 25.0 37.6 Q 24.7 36.8 24.4 36.1 Q 24.2 35.3 24.1 34.8 Q 23.9 34.3 23.8 33.4 Q 23.7 32.4 23.7 30.9 Q 23.7 29.3 23.7 28.9 Q 23.7 28.5 23.8 28.2 Q 23.9 28.0 24.2 27.7 Q 24.4 27.4 24.9 27.1 Q 25.4 26.7 25.8 26.4 Q 26.1 26.1 26.3 25.7 Q 26.4 25.4 26.5 24.9 Q 26.5 24.4 27.1 21.0 Q 27.7 17.7 27.8 17.1 Q 28.0 16.5 28.0 16.3 Q 28.1 16.1 28.1 15.9 Q 28.1 15.6 27.9 15.4 Q 27.8 15.2 27.4 15.0 Q 27.1 14.8 26.8 14.6 Q 26.5 14.4 26.4 14.2 Q 26.3 14.0 26.4 13.5 Q 26.4 13.0 26.8 11.9 Q 27.2 10.8 27.5 10.0 Q 27.9 9.2 28.2 8.5 Q 28.6 7.9 29.1 7.0 Q 29.7 6.2 30.5 5.4 Q 31.2 4.7 31.8 4.4 Q 32.3 4.0 32.9 3.8 Q 33.6 3.5 33.9 3.3 Q 34.2 3.2 34.3 3.0 Q 34.5 2.9 34.7 2.3 Q 34.8 1.8 34.8 1.5 Q 34.7 1.2 34.4 1.1 Q 34.1 0.9 32.9 0.6 Q 31.6 0.2 31.0 0.1 Q 30.3 0.0 29.8 0.0 Q 29.4 0.0 29.0 0.1 Q 28.6 0.1 28.3 0.3 Q 28.1 0.5 27.9 0.7 Q 27.7 0.8 27.7 1.2 Q 27.7 1.6 27.7 1.9 Q 27.6 2.2 27.5 2.5 Q 27.4 2.9 26.7 3.8 Q 26.0 4.6 25.5 5.4 Q 25.0 6.3 24.6 6.9 Q 24.2 7.5 23.8 8.6 Q 23.3 9.8 22.4 13.0 Q 21.5 16.3 21.2 17.3 Q 21.0 18.4 20.8 19.5 Q 20.6 20.6 20.4 22.2 Q 20.2 23.8 20.0 26.0 Q 19.8 28.1 19.8 29.5 Q 19.8 30.8 19.9 31.9 Q 19.9 32.9 20.0 34.0 Q 20.1 35.1 20.3 35.9 Q 20.6 36.7 20.8 37.3 Q 21.0 38.0 21.1 38.5 Q 21.2 38.9 21.3 39.2 Q 21.4 39.6 21.3 40.2 Q 21.3 40.7 21.3 41.1 Q 21.3 41.4 21.4 41.6 Q 21.5 41.8 21.8 42.0 Q 22.1 42.1 22.8 42.3 Q 23.5 42.5 24.1 42.5 Q 24.7 42.5 25.6 42.6 Q 26.4 42.7 27.6 42.9 Q 28.8 43.0 29.9 43.2 Q 30.9 43.4 33.6 44.2 Q 36.3 45.0 37.8 45.4 Q 39.3 45.8 40.7 46.0 Q 42.1 46.3 43.0 46.3 Q 44.0 46.4 44.7 46.7 Q 45.4 46.9 47.6 47.9 Q 49.7 49.0 50.6 49.3 Q 51.6 49.7 52.9 50.0 Q 54.3 50.3 55.4 50.5 Q 56.6 50.7 57.7 50.8 Q 58.7 51.0 59.4 51.2 Q 60.0 51.5 60.7 51.9 Q 61.4 52.4 62.1 53.1 Q 62.7 53.7 63.1 54.3 Q 63.5 54.9 63.6 55.5 Q 63.8 56.1 63.8 56.7 Q 63.7 57.3 63.6 57.9 Q 63.5 58.5 63.3 59.1 Q 63.1 59.8 62.8 60.4 Q 62.4 61.0 62.0 61.4 Q 61.5 61.7 61.0 62.2 Q 60.6 62.6 60.3 62.8 Q 60.1 63.0 59.9 63.2 Q 59.7 63.4 59.5 63.9 Z',
  svgViewBox: '0 0 100 80',
}

const TRACK_STATS = [
  { icon: '🛣️', label: 'Race Distance',        value: '260.286',  unit: 'km'     },
  { icon: '🔄', label: 'Circuit Length',        value: '3.337',    unit: 'km'     },
  { icon: '🔁', label: 'No. of Laps',           value: '78',       unit: 'laps'   },
  { icon: '🏎️', label: 'Lap Record',            value: '1:12.909', unit: 'HAM 2021' },
  { icon: '🛠️', label: 'Pit Stops (2023)',      value: '37',       unit: 'total'  },
  { icon: '🚀', label: 'Full Throttle',         value: '39.78',    unit: '%'      },
  { icon: '💨', label: 'Max Speed',             value: '296',      unit: 'km/h'   },
  { icon: '🔀', label: 'Overtakes (2023)',       value: '22',       unit: 'total'  },
]

const RISK_STATS = [
  { label: 'Safety Car',         pct: 29, color: '#E8002D' },
  { label: 'Virtual Safety Car', pct: 43, color: '#F59E0B' },
  { label: 'Race Incident',      pct: 68, color: '#A78BFA' },
]

const WEATHER = [
  { day: 'FRI', icon: '☀️', hi: 22, lo: 17, hiF: 72, loF: 63, desc: 'Sunny',  wind: '8 km/h' },
  { day: 'SAT', icon: '☀️', hi: 23, lo: 18, hiF: 73, loF: 64, desc: 'Sunny',  wind: '10 km/h' },
  { day: 'SUN', icon: '☀️', hi: 21, lo: 17, hiF: 69, loF: 63, desc: 'Dry',    wind: '8 km/h, gusts 22' },
]
const RACE_DAY_WEATHER = {
  airTemp: '17–21°C',
  trackTemp: '~40°C',
  wind: '8 km/h · gusts 22 km/h',
  rainChance: '<5%',
  note: 'Dry race expected. Track temp could peak mid-40s later in the afternoon.',
}

const QUALIFYING_GRID = [
  { pos: 1,  code: 'ANT', name: 'Antonelli',  team: 'Mercedes',        time: '1:12.051', gap: '—',      elo: 1550.8, color: '#27F4D2' },
  { pos: 2,  code: 'VER', name: 'Verstappen', team: 'Red Bull Racing', time: '1:12.094', gap: '+0.043', elo: 1625.6, color: '#3671C6' },
  { pos: 3,  code: 'HAM', name: 'Hamilton',   team: 'Ferrari',         time: '1:12.279', gap: '+0.228', elo: 1521.9, color: '#E8002D' },
  { pos: 4,  code: 'LEC', name: 'Leclerc',    team: 'Ferrari',         time: '1:12.351', gap: '+0.300', elo: 1562.6, color: '#E8002D', note: 'crashed Tabac' },
  { pos: 5,  code: 'HAD', name: 'Hadjar',     team: 'Red Bull Racing', time: '1:12.434', gap: '+0.383', elo: 1400.7, color: '#3671C6' },
  { pos: 6,  code: 'RUS', name: 'Russell',    team: 'Mercedes',        time: '—',        gap: '—',      elo: 1573.8, color: '#27F4D2' },
  { pos: 7,  code: 'PIA', name: 'Piastri',    team: 'McLaren',         time: '—',        gap: '—',      elo: 1607.9, color: '#FF8000' },
  { pos: 8,  code: 'NOR', name: 'Norris',     team: 'McLaren',         time: '—',        gap: '—',      elo: 1563.5, color: '#FF8000' },
  { pos: 9,  code: 'GAS', name: 'Gasly',      team: 'Alpine',          time: '—',        gap: '—',      elo: 1370.3, color: '#FF87BC' },
  { pos: 10, code: 'LAW', name: 'Lawson',     team: 'Racing Bulls',    time: '—',        gap: '—',      elo: 1397.2, color: '#6692FF' },
]

const CIRCUIT_ANALYTICS = {
  frontHoldRate:    91.7,
  overtakingIndex:  0.21,
  oneStopRate:      52.1,
  twoStopRate:      32.9,
  gridVolatility:   2.1,
  pitLaneDelta:     19,
  firstStopMedian:  20,
  stratArchetype:   'Undercut Friendly',
  commonStrategy:   'Medium → Hard',
  tyreDegSoft:      22.3,
  scProbability:    75,
}

const WIN_PROBABILITY = [
  { code: 'ANT', name: 'Antonelli',  pct: 67, color: '#27F4D2', odds: '1/2',   note: 'Pole · 4 wins in 7 races' },
  { code: 'VER', name: 'Verstappen', pct: 29, color: '#3671C6', odds: '5/2',   note: 'P2 · highest ELO on grid' },
  { code: 'HAM', name: 'Hamilton',   pct: 13, color: '#E8002D', odds: '13/2',  note: 'P3 · 3× Monaco winner' },
  { code: 'LEC', name: 'Leclerc',    pct: 8,  color: '#E8002D', odds: '12/1',  note: 'P4 · crashed Tabac in Q3' },
  { code: 'RUS', name: 'Russell',    pct: 2,  color: '#27F4D2', odds: '66/1',  note: 'P6 · struggled in quali' },
]

const MODEL_PREDICTIONS = {
  modelVersion: 'v4_regaware_ridge_mc',
  runs: 500,
  confidence: 38.5,
  note: 'Bayesian prior + Monte Carlo (500 runs). Confidence 38.5% — early-season model, 5 races of 2026 data.',
  picks: [
    { code: 'VER', name: 'Verstappen', team: 'Red Bull Racing', color: '#3671C6', predictedPos: 1, winPct: 20.7, podiumPct: 44.5, grid: 2, note: 'Model picks VER over pole — circuit-ELO edge' },
    { code: 'ANT', name: 'Antonelli',  team: 'Mercedes',        color: '#27F4D2', predictedPos: 2, winPct: 20.5, podiumPct: 38.7, grid: 1, note: 'Pole favored by market; model sees near-parity' },
    { code: 'HAM', name: 'Hamilton',   team: 'Ferrari',         color: '#E8002D', predictedPos: 3, winPct:  9.6, podiumPct: 37.8, grid: 3, note: '3× Monaco winner; grid matches prediction' },
    { code: 'LEC', name: 'Leclerc',    team: 'Ferrari',         color: '#E8002D', predictedPos: 4, winPct:  6.1, podiumPct: 29.6, grid: 4, note: 'Crash in Q3 hurts but prediction holds grid' },
    { code: 'HAD', name: 'Hadjar',     team: 'Red Bull Racing', color: '#3671C6', predictedPos: 5, winPct:  5.0, podiumPct: 21.6, grid: 5, note: 'Rookie at Monaco; upside in clear air' },
    { code: 'RUS', name: 'Russell',    team: 'Mercedes',        color: '#27F4D2', predictedPos: 6, winPct:  4.8, podiumPct: 19.8, grid: 6, note: 'Midfield result expected from P6' },
  ],
}

const OVERTAKE_MODES = [
  {
    key: 'B',
    label: 'Boost Mode',
    color: '#27F4D2',
    icon: '⚡',
    tagline: 'Deploy anywhere. Attack or defend.',
    body: 'Maximum battery on demand, anywhere on track. With Active Aero banned at Monaco, this is the primary attack weapon — recharge through braking, spend it at the right moment.',
  },
  {
    key: 'O',
    label: 'Overtake Mode',
    color: '#FF8000',
    icon: '🎯',
    tagline: 'The new DRS. Within 1s at the detection point.',
    body: 'Extra ERS fires automatically within 1s of the car ahead at the detection point. At Monaco that\'s before the final corner — the only real overtake window. Proximity-triggered, like a modern DRS.',
  },
]

const TYRES = [
  {
    compound: 'C3',
    name: 'Hard',
    color: '#e8e8e8',
    textColor: '#111',
    description: 'Long lasting. Most durable compound — for managing the opening stint.',
    pitAdvantage: 'Race stopper. Gives the longest stint windows but slowest peak pace.',
  },
  {
    compound: 'C4',
    name: 'Medium',
    color: '#F59E0B',
    textColor: '#fff',
    description: 'Balanced performance and durability. Key strategic tyre for race day.',
    pitAdvantage: 'Primary race tyre. Best compromise between pace and longevity.',
  },
  {
    compound: 'C5',
    name: 'Soft',
    color: '#E8002D',
    textColor: '#fff',
    description: 'Fastest compound on circuit. Used in qualifying and early stint.',
    pitAdvantage: 'Qualifying default. Degrades quickly in race conditions.',
  },
]

const STRATEGY_2026 = {
  qualifying: 'Softs',
  race: 'Flex strategy — no mandatory pit stops',
  pitstopTime: '23s',
  notes: [
    '29% Safety Car probability (F1.com 2026 official)',
    'Free to run 0–2 stops with no compound obligations',
    'Active Aero (Straight Mode) banned for the full circuit',
    'Battery deployment capped in tight street sectors',
  ],
}

const MONACO_RULES_2026 = [
  {
    icon: '❌',
    title: 'Active Aero Banned',
    verdict: 'BANNED',
    tag: '2026 RULE CHANGE',
    color: '#E8002D',
    body: 'The FIA confirmed the new 2026 Straight Mode is completely banned in Monaco. No straight is long enough to meet the 3-second safety threshold. Wings remain in closed position (high downforce) throughout — preventing dangerously high speeds at the tunnel exit.',
  },
  {
    icon: '🔓',
    title: 'Mandatory Pit Stop',
    verdict: 'SCRAPPED',
    tag: '2026 RULE CHANGE',
    color: '#F59E0B',
    body: 'The two-stop mandate is gone. Teams are free to run any strategy across all 78 laps — zero stops, one stop, or two. This opens the door for bold calls and a much more unpredictable strategic battle than recent Monaco races.',
  },
  {
    icon: '🔧',
    title: 'Mercedes Engine Loophole',
    verdict: 'CLOSED',
    tag: '2026 RULE CHANGE',
    color: '#27F4D2',
    body: 'Mercedes previously exploited a compression ratio gain under hot racing temperatures vs. ambient FIA measurement conditions. As of June 1st that loophole was closed — penalising Mercedes-powered teams (Mercedes, Williams, McLaren) by ~0.04 power unit strength at Monaco.',
  },
  {
    icon: '🔋',
    title: 'Battery Deployment',
    verdict: 'CAPPED',
    tag: '2026 RULE CHANGE',
    color: '#A78BFA',
    body: 'Maximum battery deployment has been reduced in Monaco\'s tight street sectors to help keep speeds under control. The manual Overtake Mode still fires within 1 second of the car ahead at the detection point — the closest thing to DRS at Monaco.',
  },
  {
    icon: '🔀',
    title: 'Passing Chances',
    verdict: '2 PER RACE AVG',
    tag: 'CIRCUIT NATURE',
    color: '#888888',
    body: 'Monaco averages roughly 2 on-track passes per race under normal dry conditions. In 2025: 4 total overtakes all race. In 2023 (wet): 22. With Active Aero banned in 2026, Overtake Mode (electrical proximity boost) is the only passing tool — making grid position even more decisive than usual.',
  },
]

const MODEL_PICK = MODEL_PREDICTIONS.picks[0]

const PAST_RESULTS = [
  {
    year: 2025,
    pole: 'Norris', poleTeam: 'McLaren',
    podium: [
      { pos: 1, name: 'Norris',   team: 'McLaren' },
      { pos: 2, name: 'Leclerc',  team: 'Ferrari' },
      { pos: 3, name: 'Piastri',  team: 'McLaren' },
    ],
    stops: 2, compounds: ['M', 'M', 'H'],
    note: 'Mandatory 3-tyre rule',
    fastestLap: 'Norris · final lap',
  },
  {
    year: 2024,
    pole: 'Leclerc', poleTeam: 'Ferrari',
    podium: [
      { pos: 1, name: 'Leclerc', team: 'Ferrari' },
      { pos: 2, name: 'Piastri', team: 'McLaren' },
      { pos: 3, name: 'Sainz',   team: 'Ferrari' },
    ],
    stops: 1, compounds: ['M', 'H'],
    note: 'Leclerc first Monaco win',
    fastestLap: 'Hamilton · 1:14.165 · Lap 63',
  },
  {
    year: 2023,
    pole: 'Verstappen', poleTeam: 'Red Bull Racing',
    podium: [
      { pos: 1, name: 'Verstappen', team: 'Red Bull Racing' },
      { pos: 2, name: 'Alonso',     team: 'Aston Martin' },
      { pos: 3, name: 'Ocon',       team: 'Alpine' },
    ],
    stops: 1, compounds: ['M', 'I'],
    note: 'Rain from lap 55 — intermediates decisive',
    fastestLap: 'Hamilton · 1:15.650 · Lap 33',
  },
  {
    year: 2022,
    pole: 'Leclerc', poleTeam: 'Ferrari',
    podium: [
      { pos: 1, name: 'Perez',   team: 'Red Bull Racing' },
      { pos: 2, name: 'Sainz',   team: 'Ferrari' },
      { pos: 3, name: 'Leclerc', team: 'Ferrari' },
    ],
    stops: 2, compounds: ['M', 'H', 'H'],
    note: 'Undercut on Leclerc decides race',
    fastestLap: 'Norris · 1:14.693 · Lap 67',
  },
  {
    year: 2021,
    pole: 'Verstappen', poleTeam: 'Red Bull Racing',
    podium: [
      { pos: 1, name: 'Verstappen', team: 'Red Bull Racing' },
      { pos: 2, name: 'Sainz',      team: 'Ferrari' },
      { pos: 3, name: 'Norris',     team: 'McLaren' },
    ],
    stops: 1, compounds: ['M', 'H'],
    note: 'Dominant from pole',
    fastestLap: 'Hamilton · 1:12.909 · Lap 73 · lap record',
  },
]

const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#3671C6',
  Ferrari: '#E8002D',
  McLaren: '#FF8000',
  Mercedes: '#27F4D2',
  'Aston Martin': '#229971',
}
const tc = (t: string) => TEAM_COLORS[t] ?? '#888'

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
      <div style={{ width: 32, height: 1, background: 'var(--red)' }} />
      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.24em', color: 'var(--t3)', textTransform: 'uppercase' }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
    </div>
  )
}

function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,.07)', borderRadius: 6, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${pct}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        style={{ height: '100%', background: color, borderRadius: 6 }}
      />
    </div>
  )
}

function TyreCard({ tyre, selected, onClick }: { tyre: typeof TYRES[0]; selected: boolean; onClick: () => void }) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -4 }}
      style={{
        border: `1px solid ${selected ? tyre.color + '70' : 'var(--b1)'}`,
        borderRadius: 16,
        padding: '20px',
        background: selected ? `${tyre.color}0d` : 'rgba(0,0,0,.22)',
        cursor: 'pointer',
        transition: 'all .22s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: tyre.color, opacity: selected ? 1 : 0.3,
        transition: 'opacity .22s',
      }} />

      {/* Tyre circle visual */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          border: `3px solid ${tyre.color}`,
          background: `${tyre.color}15`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 13, color: tyre.color, lineHeight: 1 }}>{tyre.compound}</span>
          <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: tyre.color, opacity: 0.7, letterSpacing: '.06em' }}>PIRELLI</span>
        </div>
        <div>
          <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: tyre.color, marginBottom: 3 }}>
            {tyre.compound} COMPOUND
          </div>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 20, color: 'var(--t1)', letterSpacing: '.04em' }}>
            {tyre.name.toUpperCase()}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.65, margin: 0 }}>
        {tyre.description}
      </p>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              marginTop: 12, paddingTop: 12,
              borderTop: `1px solid ${tyre.color}25`,
              fontSize: 11, color: 'var(--t3)',
              lineHeight: 1.6, fontStyle: 'italic',
            }}>
              {tyre.pitAdvantage}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function RuleCard({ rule, index }: { rule: typeof MONACO_RULES_2026[0]; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      onClick={() => setOpen(o => !o)}
      style={{
        border: `1px solid ${open ? rule.color + '50' : 'var(--b1)'}`,
        borderRadius: 14,
        padding: '16px 18px',
        background: open ? `${rule.color}0a` : 'rgba(0,0,0,.2)',
        cursor: 'pointer',
        transition: 'all .22s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: rule.color, opacity: open ? 0.8 : 0.28, transition: 'opacity .22s' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{rule.icon}</span>
          <div>
            <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.16em', color: rule.color, marginBottom: 2 }}>
              {rule.tag}
            </div>
            <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 17, color: 'var(--t1)', letterSpacing: '.04em' }}>
              {rule.title.toUpperCase()}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 14,
            letterSpacing: '.1em',
            color: rule.color,
            padding: '2px 8px',
            border: `1px solid ${rule.color}50`,
            borderRadius: 4,
            background: `${rule.color}12`,
          }}>{rule.verdict}</span>
          <span style={{ fontSize: 13, color: 'var(--t3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <p style={{
              margin: 0, marginTop: 12, paddingTop: 12,
              borderTop: `1px solid ${rule.color}20`,
              fontSize: 12, color: 'var(--t2)', lineHeight: 1.72,
            }}>
              {rule.body}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CircuitPage() {
  const [activeTyre, setActiveTyre] = useState<number | null>(null)
  const [activeResult, setActiveResult] = useState<number>(0)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BgCanvas />
      </div>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 40% at 50% -5%, rgba(232,0,45,.09), transparent 65%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
        <Header />

        {/* ── Hero ── */}
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          padding: 'calc(var(--header-h) + 32px) 24px 0',
        }}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            {/* Badge row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                border: '1px solid var(--red)', padding: '4px 12px',
                borderRadius: 4,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)' }} />
                <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.2em', color: 'var(--red)' }}>
                  ROUND {CIRCUIT.round} · 2026 SEASON
                </span>
              </div>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)' }}>
                {CIRCUIT.dates} · RACE {CIRCUIT.raceTime}
              </span>
            </div>

            {/* Hero grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'end', marginBottom: 48 }}>
              <div>
                <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.22em', color: 'var(--t3)', marginBottom: 6 }}>
                  CIRCUIT DE MONACO · EST. {CIRCUIT.established}
                </div>
                <h1 style={{
                  fontFamily: 'var(--font-bebas)',
                  fontSize: 'clamp(44px, 8vw, 110px)',
                  lineHeight: 0.88, letterSpacing: '.02em',
                  margin: '0 0 16px',
                }}>
                  {CIRCUIT.gp.split(' ').map((word, i) => (
                    <span key={i} style={{ color: i === 0 ? 'var(--red)' : 'var(--t1)', display: 'inline-block', marginRight: '0.15em' }}>
                      {word}
                    </span>
                  ))}
                </h1>
                <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, maxWidth: 540, margin: 0 }}>
                  The most iconic street circuit in Formula 1. Impossibly narrow, unforgiving barriers, and a 3.3 km lap that demands perfection on every rotation. Monaco rewards qualifying pace above all else — the grid rarely shuffles after the lights go out.
                </p>
              </div>

              {/* Circuit SVG */}
              <div style={{
                width: 220, height: 176, flexShrink: 0,
                background: 'rgba(0,0,0,.3)',
                border: '1px solid var(--b1)',
                borderRadius: 14, padding: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: 'linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }} />
                <svg viewBox={CIRCUIT.svgViewBox} width="180" height="150" style={{ display: 'block' }}>
                  <path
                    d={CIRCUIT.svgPath}
                    fill="none"
                    stroke="rgba(255,255,255,.15)"
                    strokeWidth="1.5"
                  />
                  <path
                    d={CIRCUIT.svgPath}
                    fill="none"
                    stroke="#E8002D"
                    strokeWidth="2.2"
                    strokeDasharray="4 200"
                    strokeDashoffset="-1"
                    opacity="0.9"
                  />
                  <path
                    d={CIRCUIT.svgPath}
                    fill="none"
                    stroke="#FF8000"
                    strokeWidth="1.4"
                    strokeDasharray="2 6"
                    opacity="0.35"
                  />
                </svg>
                <div style={{
                  position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
                  fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)',
                }}>
                  CIRCUIT DE MONACO
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Content ── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px', display: 'grid', gap: 72 }}>

          {/* ══ WEATHER ══ */}
          <section id="weather">
            <SectionLabel>01 · Race Weekend Weather</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* 3-day forecast */}
              <div style={{ border: '1px solid var(--b1)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {WEATHER.map((w, i) => (
                    <motion.div
                      key={w.day}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, delay: i * 0.08 }}
                      style={{
                        padding: '18px 14px',
                        borderRight: i < 2 ? '1px solid var(--b1)' : 'none',
                        background: w.day === 'SUN' ? 'rgba(232,0,45,.04)' : 'rgba(0,0,0,.18)',
                        textAlign: 'center',
                        position: 'relative',
                      }}
                    >
                      {w.day === 'SUN' && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--red)' }} />
                      )}
                      <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.16em', color: w.day === 'SUN' ? 'var(--red)' : 'var(--t3)', marginBottom: 8 }}>
                        {w.day}{w.day === 'SUN' ? ' · RACE' : ''}
                      </div>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{w.icon}</div>
                      <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 22, color: 'var(--t1)', lineHeight: 1 }}>{w.hi}°C</div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>{w.lo}°C lo</div>
                      <div style={{ fontSize: 9, color: 'var(--t2)' }}>{w.hiF}/{w.loF}°F</div>
                      <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--t3)', marginTop: 6, letterSpacing: '.04em' }}>{w.wind}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Race day detail */}
              <div style={{
                border: '1px solid rgba(39,244,210,.2)',
                borderRadius: 14,
                padding: '20px 22px',
                background: 'rgba(39,244,210,.03)',
              }}>
                <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.18em', color: '#27F4D2', marginBottom: 16 }}>
                  RACE DAY DETAIL · SUN 15:00 LOCAL
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  {[
                    { label: 'Air Temp',     value: RACE_DAY_WEATHER.airTemp    },
                    { label: 'Track Temp',   value: RACE_DAY_WEATHER.trackTemp  },
                    { label: 'Wind',         value: RACE_DAY_WEATHER.wind       },
                    { label: 'Rain Chance',  value: RACE_DAY_WEATHER.rainChance },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 3 }}>{s.label.toUpperCase()}</div>
                      <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 17, color: 'var(--t1)', letterSpacing: '.04em' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.65, margin: 0, fontStyle: 'italic' }}>
                  {RACE_DAY_WEATHER.note}
                </p>
              </div>
            </div>
          </section>

          {/* ══ TRACK STATS ══ */}
          <section id="stats">
            <SectionLabel>02 · Track Stats</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {TRACK_STATS.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                  style={{
                    border: '1px solid var(--b1)',
                    borderRadius: 14,
                    padding: '18px 16px',
                    background: 'rgba(0,0,0,.22)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                    background: 'linear-gradient(90deg, rgba(232,0,45,.4), transparent)',
                  }} />
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{stat.icon}</div>
                  <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 26, color: 'var(--t1)', lineHeight: 1, letterSpacing: '.02em' }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)', letterSpacing: '.06em', marginTop: 2 }}>
                    {stat.unit}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t2)', marginTop: 6, letterSpacing: '.04em' }}>
                    {stat.label}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Safety car probabilities */}
            <div style={{
              marginTop: 14,
              border: '1px solid rgba(232,0,45,.2)',
              borderRadius: 14,
              padding: '20px 22px',
              background: 'rgba(232,0,45,.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <span style={{ fontSize: 18 }}>🚨</span>
                <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 16, color: 'var(--t1)', letterSpacing: '.06em' }}>
                  INCIDENT PROBABILITY
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                {RISK_STATS.map(r => (
                  <div key={r.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--t2)', letterSpacing: '.04em' }}>{r.label}</span>
                      <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 16, color: r.color }}>{r.pct}%</span>
                    </div>
                    <AnimatedBar pct={r.pct} color={r.color} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ══ QUALIFYING GRID + ANALYTICS ══ */}
          <section id="grid">
            <SectionLabel>03 · Starting Grid &amp; Analytics</SectionLabel>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              {/* Qualifying Grid */}
              <div style={{ border: '1px solid var(--b1)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)', background: 'rgba(255,255,255,.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.18em', color: 'var(--t3)' }}>QUALIFYING · TOP 10</span>
                  <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.1em', color: 'var(--red)' }}>RACE IN ~3 HRS</span>
                </div>
                {QUALIFYING_GRID.map((d, i) => (
                  <motion.div
                    key={d.code}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 3px 36px 1fr 70px 60px',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 16px',
                      borderBottom: i < 9 ? '1px solid rgba(255,255,255,.04)' : 'none',
                      background: i === 0 ? `${d.color}0a` : 'transparent',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-bebas)', fontSize: i < 3 ? 16 : 13, color: i === 0 ? d.color : 'var(--t3)', textAlign: 'right' }}>P{d.pos}</span>
                    <div style={{ width: 3, height: 18, borderRadius: 2, background: d.color }} />
                    <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 14, color: d.color, letterSpacing: '.06em' }}>{d.code}</span>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--t1)' }}>{d.name}</span>
                      {d.note && <span style={{ fontSize: 8, color: '#F59E0B', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>{d.note}</span>}
                    </div>
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: i === 0 ? d.color : 'var(--t3)', textAlign: 'right' }}>{d.time}</span>
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t3)', textAlign: 'right' }}>{d.gap}</span>
                  </motion.div>
                ))}
              </div>

              {/* Win probability + ELO */}
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ border: '1px solid rgba(245,158,11,.2)', borderRadius: 14, padding: '18px 20px', background: 'rgba(245,158,11,.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                    <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.18em', color: '#F59E0B' }}>WIN PROBABILITY · RACE DAY</span>
                    <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--t3)', letterSpacing: '.1em' }}>SOURCE: BETTING MARKETS</span>
                  </div>
                  {WIN_PROBABILITY.map((d, i) => (
                    <div key={d.code} style={{ marginBottom: i < WIN_PROBABILITY.length - 1 ? 13 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <div style={{ width: 3, height: 14, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 15, color: 'var(--t1)', letterSpacing: '.04em', flexShrink: 0 }}>{d.name}</span>
                          <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.note}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t3)' }}>{d.odds}</span>
                          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 18, color: d.color }}>{d.pct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 5, background: 'rgba(255,255,255,.06)', borderRadius: 4 }}>
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${d.pct}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.07 }}
                          style={{ height: '100%', background: d.color, borderRadius: 4, opacity: 0.8 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* ELO top 5 */}
                <div style={{ border: '1px solid rgba(39,244,210,.15)', borderRadius: 14, padding: '18px 20px', background: 'rgba(39,244,210,.02)' }}>
                  <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.18em', color: '#27F4D2', marginBottom: 12 }}>ELO RATING · TOP GRID DRIVERS</div>
                  {QUALIFYING_GRID.slice(0, 6).sort((a, b) => b.elo - a.elo).map((d, i) => (
                    <div key={d.code} style={{ display: 'grid', gridTemplateColumns: '36px 3px 1fr 60px', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
                      <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 12, color: 'var(--t3)', textAlign: 'right' }}>#{i + 1}</span>
                      <div style={{ width: 3, height: 14, borderRadius: 2, background: d.color }} />
                      <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 14, color: 'var(--t1)', letterSpacing: '.04em' }}>{d.name}</span>
                      <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 16, color: d.color, textAlign: 'right' }}>{d.elo.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Circuit analytics */}
            <div style={{ border: '1px solid rgba(167,139,250,.2)', borderRadius: 14, padding: '20px 22px', background: 'rgba(167,139,250,.03)' }}>
              <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.18em', color: '#A78BFA', marginBottom: 18 }}>CIRCUIT ANALYTICS · FROM RACE DATA</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
                {[
                  { label: 'Front Hold Rate',  value: `${CIRCUIT_ANALYTICS.frontHoldRate}%`,  sub: 'pole → win',         color: '#E8002D' },
                  { label: 'Overtaking Index', value: CIRCUIT_ANALYTICS.overtakingIndex,       sub: 'out of 1.0',         color: '#A78BFA' },
                  { label: '1-Stop Rate',      value: `${CIRCUIT_ANALYTICS.oneStopRate}%`,     sub: 'of recent races',    color: '#F59E0B' },
                  { label: 'Pit Lane Delta',   value: `${CIRCUIT_ANALYTICS.pitLaneDelta}s`,    sub: 'time lost stopping', color: '#27F4D2' },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{s.sub}</div>
                    <div style={{ fontSize: 9, color: 'var(--t2)', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Strategy Archetype',  value: CIRCUIT_ANALYTICS.stratArchetype },
                  { label: 'Most Common Strategy', value: CIRCUIT_ANALYTICS.commonStrategy },
                  { label: 'Soft Deg per Lap',     value: `${CIRCUIT_ANALYTICS.tyreDegSoft} ms` },
                ].map(s => (
                  <div key={s.label} style={{ padding: '10px 14px', border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, background: 'rgba(0,0,0,.2)' }}>
                    <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                    <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 16, color: 'var(--t1)', letterSpacing: '.04em' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ══ MODEL PREDICTIONS ══ */}
          <section id="model">
            <SectionLabel>04 · F1 Bulletin Model Prediction</SectionLabel>
            <div style={{ border: '1px solid rgba(255,136,0,.2)', borderRadius: 14, padding: '20px 22px', background: 'rgba(255,136,0,.03)', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.18em', color: '#FF8000' }}>OUR MODEL · MONTE CARLO {MODEL_PREDICTIONS.runs} RUNS</span>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--t3)' }}>MODEL: {MODEL_PREDICTIONS.modelVersion}</span>
                  <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: '#F59E0B' }}>CONFIDENCE: {MODEL_PREDICTIONS.confidence}%</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'CONFIDENCE', val: `${MODEL_PREDICTIONS.confidence}%`, color: '#F59E0B' },
                  { label: 'MC RUNS', val: `${MODEL_PREDICTIONS.runs}`, color: '#A78BFA' },
                  { label: 'MODEL', val: MODEL_PREDICTIONS.modelVersion, color: 'var(--t3)' },
                ].map(c => (
                  <div key={c.label} style={{ padding: '4px 12px', border: `1px solid ${c.color}35`, borderRadius: 20, display: 'flex', gap: 7, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)' }}>{c.label}</span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: c.color }}>{c.val}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 0, border: '1px solid var(--b1)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '36px 3px 44px 1fr 80px 80px 80px', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid var(--b1)' }}>
                  {['PRED', '', 'CODE', 'DRIVER', 'WIN%', 'PODIUM%', 'NOTE'].map(h => (
                    <span key={h} style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)' }}>{h}</span>
                  ))}
                </div>
                {MODEL_PREDICTIONS.picks.map((d, i) => (
                  <motion.div
                    key={d.code}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.06 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 3px 44px 1fr 80px 80px 80px',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 16px',
                      borderBottom: i < MODEL_PREDICTIONS.picks.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                      background: i === 0 ? `${d.color}0d` : 'transparent',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 16, color: i === 0 ? d.color : 'var(--t3)', textAlign: 'right' }}>P{d.predictedPos}</span>
                    <div style={{ width: 3, height: 18, borderRadius: 2, background: d.color }} />
                    <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 14, color: d.color, letterSpacing: '.06em' }}>{d.code}</span>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--t1)' }}>{d.name}</span>
                      <span style={{ fontSize: 8, color: 'var(--t3)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>grid P{d.grid}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 18, color: d.color, textAlign: 'right' }}>{d.winPct}%</span>
                    <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 16, color: 'var(--t2)', textAlign: 'right' }}>{d.podiumPct}%</span>
                    <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>{d.note}</span>
                  </motion.div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, background: 'rgba(0,0,0,.2)' }}>
                  <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 3 }}>MODEL PICK TO WIN</div>
                  <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 20, color: MODEL_PICK.color }}>{MODEL_PICK.name.toUpperCase()} · {MODEL_PICK.winPct}%</div>
                </div>
                <div style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, background: 'rgba(0,0,0,.2)' }}>
                  <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 3 }}>MARKET PICK TO WIN</div>
                  <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 20, color: '#27F4D2' }}>ANTONELLI · 67%</div>
                </div>
                <div style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, background: 'rgba(0,0,0,.2)' }}>
                  <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 3 }}>MODEL VS MARKET</div>
                  <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 17, color: '#F59E0B' }}>VER UNDERVALUED AT 5/2</div>
                </div>
              </div>
            </div>
          </section>

          {/* ══ TYRE GUIDE ══ */}
          <section id="tyres">
            <SectionLabel>05 · Pirelli Tyre Selection</SectionLabel>

            <div style={{
              marginBottom: 18, padding: '14px 18px',
              border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 10,
              background: 'rgba(255,255,255,.02)',
              display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 4 }}>
                  QUALIFYING TYRE
                </div>
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 17, color: '#E8002D', letterSpacing: '.04em' }}>
                  {STRATEGY_2026.qualifying}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 4 }}>
                  RACE STRATEGY
                </div>
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 17, color: '#F59E0B', letterSpacing: '.04em' }}>
                  {STRATEGY_2026.race}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 4 }}>
                  PIT STOP TIME
                </div>
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 17, color: '#27F4D2', letterSpacing: '.04em' }}>
                  {STRATEGY_2026.pitstopTime}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 6 }}>
                  STRATEGY NOTES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {STRATEGY_2026.notes.map((n, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--red)', fontSize: 10, marginTop: 1 }}>—</span>
                      <span style={{ fontSize: 10, color: 'var(--t2)', lineHeight: 1.5 }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {TYRES.map((tyre, i) => (
                <TyreCard
                  key={tyre.compound}
                  tyre={tyre}
                  selected={activeTyre === i}
                  onClick={() => setActiveTyre(activeTyre === i ? null : i)}
                />
              ))}
            </div>
            <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 10, fontStyle: 'italic', fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>
              Monaco always receives the 3 softest Pirelli compounds for maximum grip on its slow, technical layout. Click a tyre to expand.
            </p>
          </section>

          {/* ══ OVERTAKE MODES ══ */}
          <section id="overtake">
            <SectionLabel>06 · New Overtaking Tools · 2026</SectionLabel>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              {['ZERO DRS ZONES', 'BOOST DEPLOYS ANYWHERE', '1s PROXIMITY FOR O-MODE', 'ACTIVE AERO BANNED'].map(tag => (
                <div key={tag} style={{ padding: '5px 12px', border: '1px solid var(--b1)', borderRadius: 20, fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.12em', color: 'var(--t3)' }}>{tag}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {OVERTAKE_MODES.map((m, i) => (
                <motion.div
                  key={m.key}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  style={{
                    border: `1px solid ${m.color}35`,
                    borderRadius: 16,
                    padding: '22px',
                    background: `${m.color}07`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: m.color }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                    {/* Key badge */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `${m.color}20`, border: `1px solid ${m.color}50`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-bebas)', fontSize: 20, color: m.color,
                      flexShrink: 0,
                    }}>
                      {m.key}
                    </div>
                    <div>
                      <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: m.color, marginBottom: 3 }}>
                        {m.icon} ERS DEPLOY MODE
                      </div>
                      <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 20, color: 'var(--t1)', letterSpacing: '.04em', lineHeight: 1 }}>
                        {m.label.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 10, color: m.color, marginTop: 3, fontStyle: 'italic' }}>
                        {m.tagline}
                      </div>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--t2)', lineHeight: 1.72 }}>
                    {m.body}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ══ 2026 RULE CHANGES ══ */}
          <section id="rules">
            <SectionLabel>07 · 2026 Monaco-Specific Rules</SectionLabel>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {MONACO_RULES_2026.map((rule, i) => (
                <div key={rule.title} style={{ gridColumn: i === 4 ? 'span 2' : 'span 1' }}>
                  <RuleCard rule={rule} index={i} />
                </div>
              ))}
            </div>
          </section>

          {/* ══ PAST RESULTS ══ */}
          <section id="results">
            <SectionLabel>08 · Recent Race Results</SectionLabel>

            {/* Year tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid var(--b1)', borderRadius: 8, width: 'fit-content', overflow: 'hidden' }}>
              {PAST_RESULTS.map((r, i) => (
                <button
                  key={r.year}
                  onClick={() => setActiveResult(i)}
                  style={{
                    padding: '8px 22px',
                    background: activeResult === i ? 'rgba(232,0,45,.12)' : 'transparent',
                    border: 'none',
                    borderRight: i < PAST_RESULTS.length - 1 ? '1px solid var(--b1)' : 'none',
                    color: activeResult === i ? 'var(--red)' : 'var(--t3)',
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    letterSpacing: '.1em', cursor: 'pointer', transition: 'all .16s',
                  }}
                >
                  {r.year}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeResult}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {(() => {
                  const r = PAST_RESULTS[activeResult]
                  const compoundColors: Record<string, string> = { M: '#F59E0B', H: '#e8e8e8', S: '#E8002D', I: '#39b2ff', W: '#39b2ff' }
                  const compoundNames: Record<string, string> = { M: 'MED', H: 'HARD', S: 'SOFT', I: 'INT', W: 'WET' }
                  return (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {/* Podium row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {r.podium.map(p => {
                          const heights = ['72px', '52px', '42px']
                          const labels = ['🥇', '🥈', '🥉']
                          const isWinner = p.pos === 1
                          return (
                            <div key={p.pos} style={{ border: `1px solid ${isWinner ? tc(p.team) + '60' : 'var(--b1)'}`, borderRadius: 12, overflow: 'hidden', background: isWinner ? `${tc(p.team)}0d` : 'rgba(0,0,0,.18)', position: 'relative' }}>
                              <div style={{ height: heights[p.pos - 1], background: `${tc(p.team)}18`, borderBottom: `2px solid ${tc(p.team)}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
                                <span style={{ fontSize: isWinner ? 28 : 22 }}>{labels[p.pos - 1]}</span>
                              </div>
                              <div style={{ padding: '10px 12px' }}>
                                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: isWinner ? 20 : 16, color: 'var(--t1)', letterSpacing: '.04em', lineHeight: 1 }}>{p.name}</div>
                                <div style={{ fontSize: 8, color: 'var(--t3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{p.team}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        {/* Pole */}
                        <div style={{ border: '1px solid var(--b1)', borderRadius: 12, padding: '12px 14px', background: 'rgba(0,0,0,.18)' }}>
                          <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: '#F59E0B', marginBottom: 6 }}>POLE</div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div style={{ width: 3, height: 16, borderRadius: 2, background: tc(r.poleTeam), flexShrink: 0 }} />
                            <div>
                              <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 15, color: 'var(--t1)', letterSpacing: '.04em' }}>{r.pole}</div>
                              <div style={{ fontSize: 7, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{r.poleTeam}</div>
                            </div>
                          </div>
                        </div>

                        {/* Strategy */}
                        <div style={{ border: '1px solid var(--b1)', borderRadius: 12, padding: '12px 14px', background: 'rgba(0,0,0,.18)' }}>
                          <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: '#FF8000', marginBottom: 8 }}>STRATEGY · {r.stops} STOP{r.stops !== 1 ? 'S' : ''}</div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            {r.compounds.map((c, ci) => (
                              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                {ci > 0 && <span style={{ color: 'var(--t3)', fontSize: 9 }}>→</span>}
                                <div style={{ padding: '2px 7px', borderRadius: 4, background: `${compoundColors[c]}22`, border: `1px solid ${compoundColors[c]}55`, fontSize: 8, fontFamily: 'var(--font-mono)', color: compoundColors[c], letterSpacing: '.06em' }}>
                                  {compoundNames[c]}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: 8, color: 'var(--t3)', marginTop: 6, fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>{r.note}</div>
                        </div>

                        {/* Fastest lap */}
                        <div style={{ border: '1px solid var(--b1)', borderRadius: 12, padding: '12px 14px', background: 'rgba(0,0,0,.18)' }}>
                          <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.14em', color: '#27F4D2', marginBottom: 6 }}>FASTEST LAP</div>
                          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>{r.fastestLap}</div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </motion.div>
            </AnimatePresence>
          </section>

        </div>

        <Footer />
      </div>
    </>
  )
}
