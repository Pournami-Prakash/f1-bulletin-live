'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

type DriverPrediction = {
  driver_code: string; team: string; predicted_position: number
  win_probability: number; podium_probability: number; points_expected: number
  confidence: number; elo_rating: number; grid_position: number | null
  gap_to_pole_ms: number | null; rolling_avg_finish: number
  is_upset_pick: boolean; upset_score: number | null
  actual_position: number | null; actual_points: number | null; position_error: number | null
}
type ChampionshipRow = {
  driver_code: string; team: string; actual_points: number
  projected_total: number; races_done: number; races_remaining: number
}
type RacePrediction = {
  season: number; round: number; gp_name: string; circuit: string
  model_version: string; confidence: number; simulation_runs: number
  data_weight_2026: number; predicted_at: string; has_actuals: boolean
  drivers: DriverPrediction[]; championship: ChampionshipRow[]
  accuracy: { mae_position: number | null; winner_correct: boolean | null; podium_hits: number | null; top5_hits: number | null; brier_score: number | null } | null
}

const TEAM_COLORS: Record<string, string> = {
  'Mercedes': '#27F4D2', 'Red Bull Racing': '#3671C6', 'Ferrari': '#E8002D',
  'McLaren': '#FF8000', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
  'Williams': '#64C4FF', 'Racing Bulls': '#6692FF', 'Kick Sauber': '#52E252',
  'Haas F1 Team': '#B6BABD', 'Cadillac': '#C8A951', 'Audi': '#C8A951',
}
const teamColor = (team: string) => TEAM_COLORS[team] ?? '#888'
const mono  = 'var(--font-mono)'
const bebas = 'var(--font-bebas)'

const CDN = 'https://media.formula1.com/image/upload/c_fill,w_720/q_auto/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/v1740000000/common/f1/2026'

const DRIVER_IMAGES: Record<string, string> = {
  VER: `${CDN}/redbullracing/maxver01/2026redbullracingmaxver01right.webp`,
  HAM: `${CDN}/ferrari/lewham01/2026ferrarilewham01right.webp`,
  LEC: `${CDN}/ferrari/chalec01/2026ferrarichalec01right.webp`,
  NOR: `${CDN}/mclaren/lannor01/2026mclarenlannor01right.webp`,
  PIA: `${CDN}/mclaren/oscpia01/2026mclarenoscpia01right.webp`,
  RUS: `${CDN}/mercedes/georus01/2026mercedesgeorus01right.webp`,
  ANT: `${CDN}/mercedes/andant01/2026mercedesandant01right.webp`,
  SAI: `${CDN}/williams/carsai01/2026williamscarsai01right.webp`,
  ALO: `${CDN}/astonmartin/feralo01/2026astonmartinferalo01right.webp`,
  STR: `${CDN}/astonmartin/lanstr01/2026astonmartinlanstr01right.webp`,
  GAS: `${CDN}/alpine/piegas01/2026alpinepiegas01right.webp`,
  OCO: `${CDN}/haasf1team/estoco01/2026haasf1teamestoco01right.webp`,
  HAD: `${CDN}/redbullracing/isahad01/2026redbullracingisahad01right.webp`,
  LAW: `${CDN}/racingbulls/lialaw01/2026racingbullslialaw01right.webp`,
  ALB: `${CDN}/williams/alealb01/2026williamsalealb01right.webp`,
  HUL: `${CDN}/audi/nichul01/2026audinichul01right.webp`,
  BEA: `${CDN}/haasf1team/olibea01/2026haasf1teamolibea01right.webp`,
  BOR: `${CDN}/audi/gabbor01/2026audigabbor01right.webp`,
  COL: `${CDN}/alpine/fracol01/2026alpinefracol01right.webp`,
  TSU: `${CDN}/racingbulls/yuktsu01/2026racingbullsyuktsu01right.webp`,
  BOT: `${CDN}/cadillac/valbot01/2026cadillacvalbot01right.webp`,
  DOO: `${CDN}/alpine/piegas01/2026alpinepiegas01right.webp`,
  LIN: `${CDN}/racingbulls/lialaw01/2026racingbullslialaw01right.webp`,
}

const MOCK: RacePrediction = {
  season: 2026, round: 2, gp_name: 'Chinese Grand Prix', circuit: 'Shanghai',
  model_version: 'v3_bayesian_ridge_mc', confidence: 0.35, simulation_runs: 500,
  data_weight_2026: 0.10, predicted_at: new Date().toISOString(),
  has_actuals: false, accuracy: null,
  championship: [
    { driver_code: 'ANT', team: 'Mercedes',      actual_points: 47, projected_total: 322, races_done: 2, races_remaining: 22 },
    { driver_code: 'RUS', team: 'Mercedes',      actual_points: 51, projected_total: 303, races_done: 2, races_remaining: 22 },
    { driver_code: 'HAM', team: 'Ferrari',       actual_points: 33, projected_total: 257, races_done: 2, races_remaining: 22 },
    { driver_code: 'LEC', team: 'Ferrari',       actual_points: 34, projected_total: 232, races_done: 2, races_remaining: 22 },
    { driver_code: 'NOR', team: 'McLaren',       actual_points: 15, projected_total: 177, races_done: 2, races_remaining: 22 },
  ],
  drivers: [
    { driver_code:'ANT', team:'Mercedes',        predicted_position:1,  win_probability:0.240, podium_probability:0.430, points_expected:12.5, confidence:0.35, elo_rating:1520, grid_position:1,  gap_to_pole_ms:0,    rolling_avg_finish:8.2,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'RUS', team:'Mercedes',        predicted_position:2,  win_probability:0.163, podium_probability:0.418, points_expected:11.5, confidence:0.35, elo_rating:1570, grid_position:2,  gap_to_pole_ms:222,  rolling_avg_finish:4.1,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'HAM', team:'Ferrari',         predicted_position:3,  win_probability:0.119, podium_probability:0.376, points_expected:10.8, confidence:0.35, elo_rating:1560, grid_position:3,  gap_to_pole_ms:351,  rolling_avg_finish:5.1,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'LEC', team:'Ferrari',         predicted_position:4,  win_probability:0.089, podium_probability:0.316, points_expected:9.0,  confidence:0.35, elo_rating:1590, grid_position:4,  gap_to_pole_ms:364,  rolling_avg_finish:4.8,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'PIA', team:'McLaren',         predicted_position:5,  win_probability:0.076, podium_probability:0.257, points_expected:7.8,  confidence:0.35, elo_rating:1540, grid_position:5,  gap_to_pole_ms:486,  rolling_avg_finish:5.5,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'NOR', team:'McLaren',         predicted_position:6,  win_probability:0.061, podium_probability:0.232, points_expected:7.3,  confidence:0.35, elo_rating:1640, grid_position:6,  gap_to_pole_ms:544,  rolling_avg_finish:3.2,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'VER', team:'Red Bull Racing', predicted_position:7,  win_probability:0.042, podium_probability:0.154, points_expected:5.0,  confidence:0.35, elo_rating:1680, grid_position:8,  gap_to_pole_ms:938,  rolling_avg_finish:2.8,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'GAS', team:'Alpine',          predicted_position:8,  win_probability:0.035, podium_probability:0.133, points_expected:5.6,  confidence:0.35, elo_rating:1490, grid_position:7,  gap_to_pole_ms:809,  rolling_avg_finish:9.1,  is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'HAD', team:'Red Bull Racing', predicted_position:9,  win_probability:0.028, podium_probability:0.099, points_expected:4.2,  confidence:0.35, elo_rating:1430, grid_position:9,  gap_to_pole_ms:1057, rolling_avg_finish:11.2, is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'BEA', team:'Haas F1 Team',   predicted_position:10, win_probability:0.024, podium_probability:0.085, points_expected:3.8,  confidence:0.35, elo_rating:1410, grid_position:10, gap_to_pole_ms:1228, rolling_avg_finish:13.1, is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'HUL', team:'Kick Sauber',    predicted_position:11, win_probability:0.008, podium_probability:0.041, points_expected:1.9,  confidence:0.35, elo_rating:1450, grid_position:11, gap_to_pole_ms:1290, rolling_avg_finish:12.3, is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
    { driver_code:'COL', team:'Alpine',          predicted_position:12, win_probability:0.004, podium_probability:0.022, points_expected:1.2,  confidence:0.35, elo_rating:1400, grid_position:12, gap_to_pole_ms:1340, rolling_avg_finish:14.1, is_upset_pick:false, upset_score:null, actual_position:null, actual_points:null, position_error:null },
  ]
}

function ConfidenceTimeline({ value, racesTotal = 24, racesDone = 2 }: {
  value: number; racesTotal?: number; racesDone?: number
}) {
  const pct   = Math.round(value * 100)
  const color = pct < 40 ? '#F59E0B' : pct < 70 ? '#38BDF8' : '#4ADE80'
  const milestones = [
    { race: 1,  label: 'R1',  note: 'Bayesian prior' },
    { race: 8,  label: 'R8',  note: 'XGBoost active' },
    { race: 16, label: 'R16', note: 'Calibration' },
    { race: 24, label: 'R24', note: 'Full data' },
  ]
  return (
    <div>
      <div style={{ position: 'relative', height: 24, marginBottom: 6 }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'rgba(255,255,255,.06)', borderRadius: 1, transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, width: `${(racesDone / racesTotal) * 100}%`, height: 2, background: color, borderRadius: 1, transform: 'translateY(-50%)', transition: 'width .6s ease', boxShadow: `0 0 8px ${color}60` }} />
        {milestones.map(m => {
          const pos = ((m.race - 1) / (racesTotal - 1)) * 100
          const isPast = racesDone >= m.race
          const isCurrent = racesDone === m.race
          return (
            <div key={m.race} style={{ position: 'absolute', top: '50%', left: `${pos}%`, transform: 'translate(-50%, -50%)' }}>
              <div style={{ width: isCurrent ? 10 : 6, height: isCurrent ? 10 : 6, borderRadius: '50%', background: isPast ? color : 'rgba(255,255,255,.1)', border: isCurrent ? `2px solid ${color}` : 'none', boxShadow: isCurrent ? `0 0 12px ${color}` : 'none', transition: 'all .3s' }} />
            </div>
          )
        })}
        <div style={{ position: 'absolute', top: '50%', left: `${((racesDone - 1) / (racesTotal - 1)) * 100}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, boxShadow: `0 0 16px ${color}` }} />
        </div>
      </div>
      <div style={{ position: 'relative', height: 28 }}>
        {milestones.map(m => {
          const pos = ((m.race - 1) / (racesTotal - 1)) * 100
          const isPast = racesDone >= m.race
          return (
            <div key={m.race} style={{ position: 'absolute', left: `${pos}%`, transform: 'translateX(-50%)', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: isPast ? color : 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.08em' }}>{m.label}</div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,.15)', fontFamily: mono, whiteSpace: 'nowrap' }}>{m.note}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PodiumCard({ driver, position, mounted }: { driver: DriverPrediction; position: 1 | 2 | 3; mounted: boolean }) {
  const color    = teamColor(driver.team)
  const delays   = { 1: 100, 2: 200, 3: 300 }
  const imgSrc   = DRIVER_IMAGES[driver.driver_code]
  const nameSize = { 1: 64, 2: 52, 3: 44 }
  const labels   = { 1: 'RACE WINNER', 2: 'PODIUM P2', 3: 'PODIUM P3' }
  const podiumH  = { 1: 120, 2: 68, 3: 48 }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(24px)', transition: `opacity .5s ease ${delays[position]}ms, transform .5s ease ${delays[position]}ms` }}>
      <div style={{ width: '100%', background: position === 1 ? `linear-gradient(160deg, ${color}22 0%, rgba(0,0,0,.5) 100%)` : 'rgba(0,0,0,.35)', border: `1px solid ${color}30`, borderBottom: 'none', borderRadius: '10px 10px 0 0', position: 'relative', overflow: 'hidden', padding: '16px 16px 0' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: position === 1 ? 3 : 1, background: color, opacity: position === 1 ? 0.9 : 0.4 }} />
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.18em', marginBottom: 8 }}>{labels[position]}</div>

        {/* ── Driver image: contain + bottom so full body shows ── */}
        <div style={{ position: 'relative', height: position === 1 ? 280 : position === 2 ? 240 : 220, marginLeft: -16, marginRight: -16, overflow: 'hidden', background: `${color}06` }}>
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={driver.driver_code}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'top center',
                filter: position !== 1 ? 'brightness(0.75) saturate(0.8)' : 'none',
              }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 80 100" width={position === 1 ? 80 : 60} style={{ opacity: 0.15 }}>
                <ellipse cx="40" cy="28" rx="18" ry="20" fill="white" />
                <path d="M10 100 Q10 60 40 55 Q70 60 70 100Z" fill="white" />
              </svg>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: `linear-gradient(transparent, ${position === 1 ? color + '18' : 'rgba(0,0,0,.5)'})` }} />
        </div>

        <div style={{ padding: '12px 0 14px' }}>
          <div style={{ fontFamily: bebas, fontSize: nameSize[position], color, lineHeight: 0.88, letterSpacing: '.02em' }}>{driver.driver_code}</div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,.35)', fontFamily: mono, letterSpacing: '.06em', marginTop: 3 }}>{driver.team}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>WIN</div>
              <div style={{ fontFamily: bebas, fontSize: 20, color, lineHeight: 1 }}>{(driver.win_probability * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>PODIUM</div>
              <div style={{ fontFamily: bebas, fontSize: 20, color: 'rgba(255,255,255,.5)', lineHeight: 1 }}>{(driver.podium_probability * 100).toFixed(0)}%</div>
            </div>
            <div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>GRID</div>
              <div style={{ fontFamily: bebas, fontSize: 20, color: 'rgba(255,255,255,.5)', lineHeight: 1 }}>P{driver.grid_position}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ width: '100%', height: podiumH[position], background: position === 1 ? `${color}20` : position === 2 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.03)', border: `1px solid ${color}20`, borderTop: `3px solid ${color}`, borderRadius: '0 0 8px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 10 }}>
        <span style={{ fontFamily: bebas, fontSize: 32, letterSpacing: '.04em', color: position === 1 ? '#F59E0B' : position === 2 ? '#C0C0C0' : '#CD7F32' }}>{position}</span>
      </div>
    </div>
  )
}

function DriverRow({ driver, index, mounted }: { driver: DriverPrediction; index: number; mounted: boolean }) {
  const color  = teamColor(driver.team)
  const isTop3 = driver.predicted_position <= 3
  const isDone = driver.actual_position !== null
  // Color: green if actual = predicted, amber if within 3, red if more than 3 off
  const posDiff     = isDone ? Math.abs((driver.actual_position ?? 0) - driver.predicted_position) : 0
  const resultColor = !isDone ? 'rgba(255,255,255,.2)' : posDiff === 0 ? '#4ADE80' : posDiff <= 3 ? '#F59E0B' : '#E10600'

  return (
    <>
      <div className="pred-row-desktop" style={{ display: 'grid', gridTemplateColumns: '32px 44px 120px 1fr 130px 68px 52px', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', background: isTop3 ? `${color}08` : index % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent', borderLeft: isTop3 ? `2px solid ${color}55` : '2px solid transparent', opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateX(-8px)', transition: `opacity .3s ease ${Math.min(index * 25, 350)}ms, transform .3s ease ${Math.min(index * 25, 350)}ms` }}>
        <div style={{ fontFamily: bebas, fontSize: isTop3 ? 18 : 13, color: index === 0 ? '#F59E0B' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : 'rgba(255,255,255,.22)' }}>{index + 1}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.28)', fontFamily: mono }}>P{driver.grid_position ?? '—'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 2, height: 14, background: color, borderRadius: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: bebas, fontSize: 14, color: '#fff', letterSpacing: '.04em', lineHeight: 1 }}>
              {driver.driver_code}
              {driver.is_upset_pick && <span style={{ fontSize: 9, color: '#F59E0B', marginLeft: 5, fontFamily: mono }}>⚡</span>}
            </div>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,.25)', fontFamily: mono, letterSpacing: '.04em' }}>{driver.team}</div>
          </div>
        </div>
        <div style={{ paddingRight: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${driver.win_probability * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .8s ease' }} />
            </div>
            <span style={{ fontSize: 10, color, fontFamily: mono, minWidth: 40, textAlign: 'right' }}>{(driver.win_probability * 100).toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,.04)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ width: `${driver.podium_probability * 100}%`, height: '100%', background: 'rgba(167,139,250,.5)', borderRadius: 1, transition: 'width .8s ease' }} />
            </div>
            <span style={{ fontSize: 8, color: '#A78BFA80', fontFamily: mono, minWidth: 40, textAlign: 'right' }}>{(driver.podium_probability * 100).toFixed(0)}% pod</span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: driver.points_expected > 5 ? '#F59E0B' : 'rgba(255,255,255,.28)', fontFamily: mono }}>{driver.points_expected.toFixed(1)} pts</div>
        {/* Result — just show actual position, no error annotation */}
        <div style={{ fontSize: 10, fontFamily: mono }}>
          {isDone
            ? <span style={{ color: resultColor }}>P{driver.actual_position}</span>
            : <span style={{ color: 'rgba(255,255,255,.12)' }}>TBD</span>
          }
        </div>
      </div>

      <div className="pred-row-mobile" style={{ display: 'none', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.04)', background: isTop3 ? `${color}08` : 'transparent', borderLeft: isTop3 ? `2px solid ${color}55` : '2px solid transparent', opacity: mounted ? 1 : 0, transition: `opacity .3s ease ${Math.min(index * 25, 350)}ms` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: bebas, fontSize: 15, color: index === 0 ? '#F59E0B' : 'rgba(255,255,255,.3)', minWidth: 20 }}>{index + 1}</span>
            <div style={{ width: 2, height: 12, background: color, borderRadius: 1 }} />
            <span style={{ fontFamily: bebas, fontSize: 15, color: '#fff', letterSpacing: '.04em' }}>{driver.driver_code}</span>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,.25)', fontFamily: mono }}>P{driver.grid_position}</span>
            {driver.is_upset_pick && <span style={{ fontSize: 9, color: '#F59E0B' }}>⚡</span>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color, fontFamily: mono, fontWeight: 700 }}>{(driver.win_probability * 100).toFixed(1)}%</div>
            {isDone && <div style={{ fontSize: 9, color: resultColor, fontFamily: mono }}>P{driver.actual_position}</div>}
          </div>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${driver.win_probability * 100}%`, height: '100%', background: color, borderRadius: 2 }} />
        </div>
      </div>
    </>
  )
}

function AccuracyCard({ accuracy }: { accuracy: NonNullable<RacePrediction['accuracy']> }) {
  const mae = accuracy.mae_position ? parseFloat(String(accuracy.mae_position)) : null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 1, marginTop: 1 }}>
      {[
        { label: 'WINNER',        value: accuracy.winner_correct ? '✓' : '✗',  color: accuracy.winner_correct ? '#4ADE80' : '#E10600' },
        { label: 'PODIUM HITS',   value: `${accuracy.podium_hits}/3`,           color: (accuracy.podium_hits ?? 0) >= 2 ? '#4ADE80' : '#F59E0B' },
        { label: 'TOP 5 HITS',    value: `${accuracy.top5_hits}/5`,             color: '#38BDF8' },
        { label: 'AVG POS ERROR', value: mae ? mae.toFixed(2) : '—',           color: mae && mae < 3 ? '#4ADE80' : '#F59E0B' },
      ].map(k => (
        <div key={k.label} style={{ padding: '12px 16px', background: 'rgba(0,0,0,.3)', borderBottom: `2px solid ${k.color}30` }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.14em', marginBottom: 4 }}>{k.label}</div>
          <div style={{ fontFamily: bebas, fontSize: 26, color: k.color, lineHeight: 1 }}>{k.value}</div>
        </div>
      ))}
    </div>
  )
}

function ChampionshipStrip({ rows }: { rows: ChampionshipRow[] }) {
  const top3 = rows.slice(0, 3)
  const maxP = rows[0]?.projected_total ?? 1
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {top3.map((row, i) => {
        const color   = teamColor(row.team)
        const medals  = ['#F59E0B', '#C0C0C0', '#CD7F32']
        return (
          <div key={row.driver_code} style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,.3)', border: `1px solid ${color}25`, borderRadius: 8, borderTop: `2px solid ${color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: bebas, fontSize: 13, color: medals[i] }}>{i + 1}</span>
              <div style={{ width: 2, height: 10, background: color, borderRadius: 1 }} />
              <span style={{ fontFamily: bebas, fontSize: 14, color: '#fff', letterSpacing: '.04em' }}>{row.driver_code}</span>
              <span style={{ fontSize: 7, color: 'rgba(255,255,255,.2)', fontFamily: mono, marginLeft: 'auto' }}>{row.team.split(' ')[0]}</span>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ width: `${(row.projected_total / maxP) * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .8s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: mono }}>{row.actual_points} pts now</span>
              <span style={{ fontSize: 9, fontFamily: bebas, color, letterSpacing: '.02em' }}>~{row.projected_total}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChampionshipTable({ rows }: { rows: ChampionshipRow[] }) {
  const maxP = rows[0]?.projected_total ?? 1
  return (
    <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,.35)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 2, height: 14, background: '#F59E0B', borderRadius: 1 }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>FULL CHAMPIONSHIP PROJECTION</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,.15)', fontFamily: mono, marginLeft: 'auto' }}>{rows[0]?.races_done ?? 0} done · {rows[0]?.races_remaining ?? 0} remaining</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 150px 1fr 80px 90px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
        {['#', 'DRIVER', 'PROJECTED PACE', 'ACTUAL', 'EST FINAL'].map(h => (
          <div key={h} style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>{h}</div>
        ))}
      </div>
      {rows.slice(0, 10).map((row, i) => {
        const color = teamColor(row.team)
        return (
          <div key={row.driver_code} style={{ display: 'grid', gridTemplateColumns: '32px 150px 1fr 80px 90px', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', background: i % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent' }}>
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
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: mono }}>{row.actual_points} pts</div>
            <div style={{ fontSize: 11, fontFamily: bebas, color: i === 0 ? '#F59E0B' : 'rgba(255,255,255,.55)', letterSpacing: '.02em' }}>~{row.projected_total}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function PredictionsPage() {
  const [data, setData]         = useState<RacePrediction | null>(null)
  const [loading, setLoading]   = useState(true)
  const [mounted, setMounted]   = useState(false)
  const [useMock, setUseMock]   = useState(false)
  const [season]                = useState(2026)
  const [availableRounds, setAvailableRounds] = useState<{ round: number; gp_name: string }[]>([])
  const [selectedRound, setSelectedRound]     = useState<number | null>(null)
  const [accuracy, setAccuracy]               = useState<any[]>([])
  const [showHistory, setShowHistory]         = useState(false)
  const [showChampionship, setShowChampionship] = useState(false)

  useEffect(() => {
    fetch(`/api/predictions/rounds?season=${season}`)
      .then(r => r.json())
      .then(d => {
        if (d.rounds?.length) {
          const seen = new Set<number>()
          const unique = d.rounds.filter((r: any) => {
            if (seen.has(r.round)) return false
            seen.add(r.round)
            return true
          })
          setAvailableRounds(unique)
          setSelectedRound(unique[0].round)
        }
      })
      .catch(() => {
        setAvailableRounds([{ round: 2, gp_name: 'Chinese Grand Prix' }])
        setSelectedRound(2)
      })
  }, [season])

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
      .finally(() => { setLoading(false); setTimeout(() => setMounted(true), 80) })
  }, [season, selectedRound])

  useEffect(() => {
    fetch('/api/predictions?history=1')
      .then(r => r.json())
      .then(d => { if (d.accuracy_history) setAccuracy(d.accuracy_history) })
      .catch(() => {})
  }, [])

  const top3      = data?.drivers.slice(0, 3) ?? []
  const upsets    = data?.drivers.filter(d => d.is_upset_pick) ?? []
  const racesDone = data?.championship?.[0]?.races_done ?? 2

  return (
    <>
      <style>{`
        @media (max-width: 680px) {
          .pred-row-desktop { display: none !important; }
          .pred-row-mobile  { display: block !important; }
          .pred-podium-order { flex-direction: column !important; gap: 12px !important; }
          .pred-podium-order > * { flex: none !important; width: 100% !important; }
          .pred-champ-strip { flex-direction: column !important; }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
        <main style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: 'calc(var(--header-h) + 32px) 20px 80px', display: 'grid', gap: 18 }}>

          {/* ── MASTHEAD ── */}
          <div style={{ opacity: mounted ? 1 : 0, transition: 'opacity .4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ width: 20, height: 1, background: '#E10600' }} />
              <span style={{ fontSize: 9, letterSpacing: '.18em', color: 'rgba(255,255,255,.3)', fontFamily: mono }}>
                RACE INTELLIGENCE · MONTE CARLO · {data?.simulation_runs ?? 500} SIMULATIONS
              </span>
              {useMock && (
                <span style={{ fontSize: 8, letterSpacing: '.1em', color: '#F59E0B', fontFamily: mono, padding: '2px 8px', border: '1px solid rgba(245,158,11,.3)', borderRadius: 3 }}>
                  PREVIEW DATA — live data unavailable
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>

              <div style={{ minWidth: 100, flexShrink: 0 }} />

              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontFamily: bebas, fontSize: 'clamp(38px,5.5vw,70px)', letterSpacing: '.02em', lineHeight: .9 }}>
                  {data
                    ? <>{data.gp_name.replace(' Grand Prix','').toUpperCase()} <span style={{ color: '#E10600' }}>GP</span> <span style={{ fontSize: '.42em', color: 'rgba(255,255,255,.2)', letterSpacing: '.08em', verticalAlign: 'middle' }}>{data.season}</span></>
                    : <>RACE <span style={{ color: '#E10600' }}>PREDICTIONS</span></>
                  }
                </div>
                {data && (
                  <div style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: mono }}>ROUND {data.round} · {data.circuit.toUpperCase()}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,.12)', fontFamily: mono }}>·</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: mono }}>{new Date(data.predicted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()}</span>
                    {data.has_actuals
                      ? <span style={{ fontSize: 9, color: '#4ADE80', fontFamily: mono, letterSpacing: '.1em', padding: '2px 8px', border: '1px solid rgba(74,222,128,.35)', borderRadius: 3, background: 'rgba(74,222,128,.08)' }}>✓ RACE COMPLETE</span>
                      : <span style={{ fontSize: 9, color: '#F59E0B', fontFamily: mono, letterSpacing: '.1em', padding: '2px 8px', border: '1px solid rgba(245,158,11,.25)', borderRadius: 3, background: 'rgba(245,158,11,.06)' }}>⏳ AWAITING RACE</span>
                    }
                  </div>
                )}
              </div>

              {data ? (
                <div style={{ padding: '8px 14px', border: `1px solid ${data.confidence < 0.4 ? 'rgba(245,158,11,.25)' : data.confidence < 0.7 ? 'rgba(56,189,248,.25)' : 'rgba(74,222,128,.25)'}`, borderRadius: 8, background: 'rgba(0,0,0,.3)', textAlign: 'center', minWidth: 100, flexShrink: 0, marginTop: 8 }}>
                  <div style={{ fontSize: 7, color: 'rgba(255,255,255,.25)', fontFamily: mono, letterSpacing: '.12em', marginBottom: 2 }}>2026 CONFIDENCE</div>
                  <div style={{ fontFamily: bebas, fontSize: 32, lineHeight: 1, color: data.confidence < 0.4 ? '#F59E0B' : data.confidence < 0.7 ? '#38BDF8' : '#4ADE80' }}>{Math.round(data.confidence * 100)}%</div>
                  <div style={{ fontSize: 7, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>
                    {data.confidence < 0.4 ? 'BUILDING' : data.confidence < 0.7 ? 'STABILIZING' : 'HIGH'} · EVIDENCE {data.championship?.[0]?.races_done ?? 0}/22
                  </div>
                </div>
              ) : (
                <div style={{ minWidth: 100, flexShrink: 0 }} />
              )}

            </div>
          </div>

          {/* ── RACE SELECTOR ── */}
          {availableRounds.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ padding: '5px 14px', border: '1px solid rgba(225,6,0,.4)', borderRadius: 5, background: 'rgba(225,6,0,.12)', flexShrink: 0 }}>
                <span style={{ color: '#E10600', fontFamily: mono, fontSize: 10, letterSpacing: '.1em' }}>2026</span>
              </div>
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.08)', flexShrink: 0 }} />
              <div style={{ position: 'relative', minWidth: 0, flex: '1 1 180px', maxWidth: 260 }}>
                <select value={selectedRound ?? ''} onChange={e => setSelectedRound(parseInt(e.target.value))} style={{ width: '100%', background: 'rgba(0,0,0,.4)', border: '1px solid rgba(225,6,0,.35)', borderRadius: 6, color: '#fff', padding: '7px 32px 7px 12px', fontFamily: mono, fontSize: 11, letterSpacing: '.04em', cursor: 'pointer', outline: 'none', appearance: 'none' }}>
                  {availableRounds.map((r, i) => (
                    <option key={`${r.round}-${i}`} value={r.round}>R{r.round} · {r.gp_name.replace(' Grand Prix', ' GP')}</option>
                  ))}
                </select>
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(255,255,255,.3)', fontSize: 10 }}>▾</div>
              </div>
              <button onClick={() => { setShowHistory(p => !p); setShowChampionship(false) }} style={{ flexShrink: 0, background: showHistory ? 'rgba(56,189,248,.1)' : 'transparent', border: `1px solid ${showHistory ? 'rgba(56,189,248,.3)' : 'rgba(255,255,255,.08)'}`, borderRadius: 5, color: showHistory ? '#38BDF8' : 'rgba(255,255,255,.3)', padding: '5px 14px', cursor: 'pointer', fontFamily: mono, fontSize: 10, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>ACCURACY HISTORY</button>
              <button onClick={() => { setShowChampionship(p => !p); setShowHistory(false) }} style={{ flexShrink: 0, background: showChampionship ? 'rgba(245,158,11,.1)' : 'transparent', border: `1px solid ${showChampionship ? 'rgba(245,158,11,.3)' : 'rgba(255,255,255,.08)'}`, borderRadius: 5, color: showChampionship ? '#F59E0B' : 'rgba(255,255,255,.3)', padding: '5px 14px', cursor: 'pointer', fontFamily: mono, fontSize: 10, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>CHAMPIONSHIP ↓</button>
            </div>
          )}

          {/* ── ACCURACY HISTORY ── */}
          {showHistory && accuracy.length > 0 && (
            <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,.35)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 2, height: 14, background: '#38BDF8', borderRadius: 1 }} />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>PAST RACE ACCURACY</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px 80px 70px 60px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
                {['RND', 'RACE', 'WINNER', 'PODIUM', 'TOP 5', 'MAE'].map(h => (
                  <div key={h} style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>{h}</div>
                ))}
              </div>
              {accuracy.filter((row: any) => row.winner_correct !== null).map((row: any, i: number) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px 80px 70px 60px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', background: i % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent' }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: mono }}>R{row.round}</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono }}>{row.gp_name?.replace(' Grand Prix', ' GP')}</span>
                  <span style={{ fontSize: 10, color: row.winner_correct ? '#4ADE80' : '#E10600', fontFamily: mono }}>{row.winner_correct ? '✓' : '✗'}</span>
                  <span style={{ fontSize: 10, color: (row.podium_hits ?? 0) >= 2 ? '#4ADE80' : '#F59E0B', fontFamily: mono }}>{row.podium_hits}/3</span>
                  <span style={{ fontSize: 10, color: '#38BDF8', fontFamily: mono }}>{row.top5_hits}/5</span>
                  <span style={{ fontSize: 10, color: (parseFloat(row.mae_position) ?? 99) < 3.5 ? '#4ADE80' : '#F59E0B', fontFamily: mono }}>{row.mae_position ? parseFloat(row.mae_position).toFixed(1) : '—'}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── FULL CHAMPIONSHIP TABLE ── */}
          {showChampionship && (data?.championship?.length ?? 0) > 0 && (
            <ChampionshipTable rows={data!.championship} />
          )}

          {loading ? (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.18em' }}>LOADING PREDICTIONS…</span>
            </div>
          ) : (showHistory || showChampionship) ? null : data ? (
            <>
              {/* ── ACCURACY (if race done) ── */}
              {data.has_actuals && data.accuracy && (
                <div style={{ border: '1px solid rgba(74,222,128,.2)', borderRadius: 8, overflow: 'hidden', background: 'rgba(74,222,128,.04)' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 2, height: 14, background: '#4ADE80', borderRadius: 1 }} />
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>PREDICTION ACCURACY</span>
                    <span style={{ fontSize: 9, color: '#4ADE80', fontFamily: mono, marginLeft: 'auto', letterSpacing: '.1em' }}>RACE COMPLETE</span>
                  </div>
                  <AccuracyCard accuracy={data.accuracy} />
                </div>
              )}

              {/* ── UPSET ALERTS ── */}
              {upsets.length > 0 && (
                <div style={{ border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, padding: '12px 16px', background: 'rgba(245,158,11,.05)', opacity: mounted ? 1 : 0, transition: 'opacity .4s ease .2s' }}>
                  <div style={{ fontSize: 9, color: '#F59E0B', fontFamily: mono, letterSpacing: '.14em', marginBottom: 10 }}>⚡ UPSET ALERTS — drivers outperforming grid expectation</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {upsets.map(u => {
                      const color = teamColor(u.team)
                      return (
                        <div key={u.driver_code} style={{ padding: '6px 12px', borderRadius: 5, border: `1px solid ${color}35`, background: `${color}0a` }}>
                          <span style={{ fontFamily: bebas, fontSize: 14, color, letterSpacing: '.04em' }}>{u.driver_code}</span>
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', fontFamily: mono, marginLeft: 6 }}>P{u.grid_position} grid → {(u.win_probability * 100).toFixed(1)}% win</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── PODIUM ── */}
              <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,.35)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 2, height: 14, background: '#E10600', borderRadius: 1 }} />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>PREDICTED PODIUM</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.15)', fontFamily: mono, marginLeft: 'auto' }}>Win probability from {data.simulation_runs} simulated races</span>
                </div>
                <div style={{ padding: '20px 20px 0', background: 'rgba(0,0,0,.15)' }}>
                  <div className="pred-podium-order" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    {top3[1] && <div style={{ flex: 1, alignSelf: 'flex-end' }}><PodiumCard driver={top3[1]} position={2} mounted={mounted} /></div>}
                    {top3[0] && <div style={{ flex: 1 }}><PodiumCard driver={top3[0]} position={1} mounted={mounted} /></div>}
                    {top3[2] && <div style={{ flex: 1, alignSelf: 'flex-end', marginTop: '48px' }}><PodiumCard driver={top3[2]} position={3} mounted={mounted} /></div>}
                  </div>
                </div>
              </div>

              {/* ── FULL FIELD TABLE ── */}
              <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,.35)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 2, height: 14, background: '#E10600', borderRadius: 1 }} />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', fontFamily: mono, letterSpacing: '.14em' }}>FULL FIELD PREDICTION</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.15)', fontFamily: mono, marginLeft: 'auto' }}>WIN% IS ABSOLUTE — not relative to leader</span>
                </div>
                <div className="pred-row-desktop" style={{ display: 'grid', gridTemplateColumns: '32px 44px 120px 1fr 130px 68px 52px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
                  {['#', 'GRID', 'DRIVER', 'WIN / PODIUM PROBABILITY', 'EXP PTS', 'RESULT'].map(h => (
                    <div key={h} style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}>{h}</div>
                  ))}
                </div>
                <div className="pred-row-mobile" style={{ display: 'none', padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em' }}># · GRID · DRIVER · WIN%</span>
                </div>
                {data.drivers.map((driver, i) => (
                  <DriverRow key={driver.driver_code} driver={driver} index={i} mounted={mounted} />
                ))}
              </div>

              {/* ── MODEL NOTES ── */}
              <div style={{ border: '1px solid rgba(255,255,255,.05)', borderRadius: 8, padding: '14px 18px', opacity: mounted ? 1 : 0, transition: 'opacity .4s ease .5s' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.14em', marginBottom: 12 }}>MODEL NOTES</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  {[
                    { label: 'METHOD',          value: 'Bayesian Prior + Ridge Regression + Monte Carlo' },
                    { label: 'SIMULATIONS',      value: `${data.simulation_runs.toLocaleString()} race simulations` },
                    { label: '2026 DATA WEIGHT', value: `${(data.data_weight_2026 * 100).toFixed(0)}% (grows each race)` },
                    { label: 'NEXT MILESTONE',   value: racesDone < 8 ? `R8: XGBoost activates (${8 - racesDone} races away)` : racesDone < 16 ? `R16: Calibration kicks in (${16 - racesDone} races away)` : 'Full model active' },
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
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.18em' }}>NO PREDICTIONS AVAILABLE — RUN predict.py FIRST</span>
            </div>
          )}
        </main>
        <Footer />
      </div>
    </>
  )
}
