'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
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

type CircuitWinner = {
  season: number
  round: number
  gp_name: string
  circuit: string
  driver_code: string
  team: string
  grid_position: number | null
  points: string | number | null
}

type CircuitProfile = {
  type: string
  downforce: string
  overtaking: string
  tyreStress: string
  rhythm: string
  setup: string
  raceShape: string
  qualiBias: string
  tyreNote: string
  risk: string
  modelCue: string
  sectors: [string, string, string]
  priorities: { label: string; value: number; note: string }[]
  zones: { label: string; value: string }[]
  tags: string[]
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
  LIN: `${CDN}/racingbulls/lialaw01/2026racingbullslialaw01right.webp`,
}

const FALLBACK_PROFILE: CircuitProfile = {
  type: 'Permanent',
  downforce: 'Medium',
  overtaking: 'Medium',
  tyreStress: 'Medium',
  rhythm: 'Mixed',
  setup: 'Use race-week practice, qualifying, and model signals once available.',
  raceShape: 'The page will lean on live prediction and calendar signals until a dedicated circuit profile is added.',
  qualiBias: 'Balanced',
  tyreNote: 'Tyre behavior depends on live temperature and compound allocation.',
  risk: 'Medium uncertainty until session data lands.',
  modelCue: 'Treat the forecast as a baseline, then reweight once qualifying and stint data arrive.',
  sectors: ['Opening phase', 'Middle sector', 'Run to line'],
  priorities: [
    { label: 'Aero Load', value: 55, note: 'Balanced platform' },
    { label: 'Tyre Care', value: 50, note: 'Watch long-run deg' },
    { label: 'Track Position', value: 55, note: 'Qualifying still matters' },
  ],
  zones: [
    { label: 'Primary Lever', value: 'Clean qualifying' },
    { label: 'Race Swing', value: 'Safety car timing' },
    { label: 'Model Watch', value: 'Practice pace delta' },
  ],
  tags: ['race-week adaptive', 'neutral baseline'],
}

const CIRCUIT_PROFILES: Record<string, CircuitProfile> = {
  melbourne: {
    type: 'Street hybrid', downforce: 'Medium-high', overtaking: 'Medium', tyreStress: 'Medium', rhythm: 'Fast parkland flow',
    setup: 'Albert Park rewards a car that changes direction cleanly without overheating the rear tyres through traction zones.',
    raceShape: 'DRS trains can form, but late safety cars and tyre warmup often disturb the neat version of the model.',
    qualiBias: 'High but not absolute', tyreNote: 'Medium thermal stress; graining risk rises if track temperature is cool.',
    risk: 'Wall proximity and restart timing can move midfield cars several positions.',
    modelCue: 'Give qualifying a strong weight, then watch teams that keep tyre temperature stable on restarts.',
    sectors: ['Fast chicanes and kerb confidence', 'Traction out of slow-medium corners', 'DRS-assisted finish sector'],
    priorities: [
      { label: 'Front Bite', value: 74, note: 'Change of direction' },
      { label: 'Tyre Warmup', value: 66, note: 'Restart sensitivity' },
      { label: 'Straight Speed', value: 58, note: 'DRS defence' },
    ],
    zones: [
      { label: 'Pressure Point', value: 'T1 braking into traffic' },
      { label: 'Strategy Lever', value: 'Safety car pit windows' },
      { label: 'Upset Type', value: 'Restart tyre warmup' },
    ],
    tags: ['parkland', 'restart risk', 'medium deg'],
  },
  shanghai: {
    type: 'Permanent', downforce: 'Medium', overtaking: 'High', tyreStress: 'High', rhythm: 'Long corners and heavy braking',
    setup: 'Shanghai exposes front-left management through the endless opening complex, then asks for traction and braking on the long back straight.',
    raceShape: 'A car that looks gentle over one lap can win the race if it protects the front-left and exits the hairpin well.',
    qualiBias: 'Moderate', tyreNote: 'Front-left load is the dominant tyre story.',
    risk: 'Setup compromises can make practice pace misleading.',
    modelCue: 'Boost long-run consistency and tyre-deg signals over pure qualifying rank.',
    sectors: ['T1-T4 front-left torture', 'Medium-speed balance check', 'Back-straight attack and hairpin braking'],
    priorities: [
      { label: 'Tyre Care', value: 86, note: 'Front-left first' },
      { label: 'Traction', value: 72, note: 'Hairpin exits' },
      { label: 'Race Pace', value: 78, note: 'Stint stability' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'Back straight hairpin' },
      { label: 'Weakness Exposed', value: 'Understeer through T1' },
      { label: 'Model Watch', value: 'Lap-time falloff' },
    ],
    tags: ['front-left', 'long-run track', 'overtaking'],
  },
  suzuka: {
    type: 'Permanent', downforce: 'High', overtaking: 'Medium', tyreStress: 'High', rhythm: 'Linked high-speed corners',
    setup: 'Suzuka magnifies driver confidence through the Esses and punishes cars that cannot hold a stable aero platform.',
    raceShape: 'Passing is possible, but the best race car usually announces itself through sector-one rhythm before Sunday.',
    qualiBias: 'High', tyreNote: 'Sustained lateral load makes thermal control a first-order feature.',
    risk: 'Weather and wind can flip balance from sector to sector.',
    modelCue: 'Raise the value of high-speed corner strength and driver-circuit affinity.',
    sectors: ['Esses rhythm and commitment', 'Degners plus hairpin traction', 'Spoon to 130R aero confidence'],
    priorities: [
      { label: 'Aero Load', value: 91, note: 'Platform stability' },
      { label: 'Driver Rhythm', value: 88, note: 'Linked corners' },
      { label: 'Tyre Stress', value: 82, note: 'Long lateral loads' },
    ],
    zones: [
      { label: 'Signature', value: 'Esses' },
      { label: 'Attack Point', value: 'Casio Triangle' },
      { label: 'Risk', value: 'Wind-sensitive balance' },
    ],
    tags: ['driver track', 'high speed', 'aero truth serum'],
  },
  bahrain: {
    type: 'Permanent', downforce: 'Medium', overtaking: 'High', tyreStress: 'High', rhythm: 'Traction and braking',
    setup: 'Bahrain is rear-limited: braking stability matters, but traction and thermal rear management decide the stint.',
    raceShape: 'Undercuts can bite because degradation is real and passing is available with tyre delta.',
    qualiBias: 'Medium', tyreNote: 'Rear deg is the headline; sliding early can ruin the second half of a stint.',
    risk: 'Night temperature shifts can make FP1 less useful than FP2.',
    modelCue: 'Prioritize race pace, rear tyre deg, and cars that convert DRS passes.',
    sectors: ['Heavy braking into T1', 'Traction through middle sector', 'Rear-limited run to line'],
    priorities: [
      { label: 'Rear Tyres', value: 90, note: 'Thermal limit' },
      { label: 'Braking', value: 76, note: 'T1 and T10' },
      { label: 'ERS / DRS', value: 70, note: 'Passing conversion' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T1 after main straight' },
      { label: 'Trap', value: 'Locking into T10' },
      { label: 'Strategy Lever', value: 'Undercut' },
    ],
    tags: ['rear deg', 'night race', 'overtaking'],
  },
  jeddah: {
    type: 'Street', downforce: 'Medium-low', overtaking: 'Medium-high', tyreStress: 'Medium', rhythm: 'Fast walls, blind commitment',
    setup: 'Jeddah is a confidence track: low drag helps, but the car must stay calm through fast wall-lined direction changes.',
    raceShape: 'Safety car probability and restart positioning can matter as much as baseline pace.',
    qualiBias: 'High', tyreNote: 'Tyres are not the main limiter; traffic and temperature windows matter more.',
    risk: 'High incident sensitivity from blind corners and wall proximity.',
    modelCue: 'Increase chaos and qualifying weights; reliability and clean-air pace matter.',
    sectors: ['Fast wall-lined sweeps', 'DRS chess down the corniche', 'Final-corner traction'],
    priorities: [
      { label: 'Confidence', value: 88, note: 'Walls close in' },
      { label: 'Low Drag', value: 78, note: 'Long flat-out zones' },
      { label: 'Chaos Control', value: 84, note: 'SC / VSC risk' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T27 to T1 DRS game' },
      { label: 'Risk', value: 'Blind high-speed traffic' },
      { label: 'Model Watch', value: 'Clean-lap conversion' },
    ],
    tags: ['street', 'fast walls', 'safety car'],
  },
  miami: {
    type: 'Street hybrid', downforce: 'Medium', overtaking: 'Medium', tyreStress: 'Medium-high', rhythm: 'Traction plus long straight',
    setup: 'Miami asks for rear stability in slow corners and enough efficiency to defend the long DRS run.',
    raceShape: 'The technical middle sector breaks rhythm; cars that overheat rears there become vulnerable later in the lap.',
    qualiBias: 'Medium-high', tyreNote: 'Rear surface temperature can drift quickly in traffic.',
    risk: 'Low-speed mistakes and safety car timing can reshuffle the midfield.',
    modelCue: 'Blend qualifying, traction metrics, and race-start position retention.',
    sectors: ['Opening flow', 'Awkward slow technical section', 'Long DRS and heavy braking'],
    priorities: [
      { label: 'Traction', value: 82, note: 'Slow exits' },
      { label: 'Rear Deg', value: 70, note: 'Traffic sensitivity' },
      { label: 'Straight Speed', value: 74, note: 'DRS defence' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T11 braking' },
      { label: 'Weakness Exposed', value: 'Slow chicane rotation' },
      { label: 'Strategy Lever', value: 'Track position vs tyre offset' },
    ],
    tags: ['street hybrid', 'traction', 'DRS'],
  },
  monaco: {
    type: 'Street', downforce: 'Maximum', overtaking: 'Very low', tyreStress: 'Low', rhythm: 'Precision stop-start',
    setup: 'Monaco is the extreme: mechanical grip, driver confidence, and qualifying track position dominate everything else.',
    raceShape: 'The race is often won before Sunday. Passing is scarce, so pit timing, safety cars, and avoiding wall contact become the only escape hatches.',
    qualiBias: 'Extreme', tyreNote: 'Low degradation; tyres last, track position rules.',
    risk: 'One red flag, one slow stop, or one trapped car can rewrite the order.',
    modelCue: 'Compress race-pace advantage and heavily amplify grid, front-row conversion, and street-circuit precision.',
    sectors: ['Sainte Devote climb and Casino commitment', 'Loews hairpin through tunnel patience', 'Swimming Pool precision to Rascasse'],
    priorities: [
      { label: 'Track Position', value: 98, note: 'Qualifying is king' },
      { label: 'Mechanical Grip', value: 94, note: 'Slow-corner bite' },
      { label: 'Race Pace', value: 34, note: 'Hard to convert' },
    ],
    zones: [
      { label: 'Critical Lap', value: 'Q3 final run' },
      { label: 'Pass Zone', value: 'Rare, mostly strategy' },
      { label: 'Trap', value: 'Traffic and pit timing' },
    ],
    tags: ['street', 'qualifying lock', 'low deg'],
  },
  barcelona: {
    type: 'Permanent', downforce: 'High', overtaking: 'Medium-low', tyreStress: 'High', rhythm: 'Aero benchmark',
    setup: 'Barcelona is the classic all-round test: efficient downforce, tyre stability, and balance through long loaded corners.',
    raceShape: 'The strongest car usually comes through because weak aero balance shows up everywhere over a stint.',
    qualiBias: 'Medium-high', tyreNote: 'High degradation; long-run pace is more predictive than a soft-tyre headline lap.',
    risk: 'Hot track temperatures can exaggerate rear degradation.',
    modelCue: 'Strengthen constructor pace and tyre-deg features; reduce random upset unless weather intervenes.',
    sectors: ['Fast opening load', 'Long corners and balance', 'Traction onto main straight'],
    priorities: [
      { label: 'Aero Load', value: 90, note: 'Benchmark circuit' },
      { label: 'Tyre Care', value: 84, note: 'Loaded corners' },
      { label: 'Race Pace', value: 82, note: 'Usually converts' },
    ],
    zones: [
      { label: 'Weakness Exposed', value: 'Long-corner understeer' },
      { label: 'Pass Zone', value: 'Main straight T1' },
      { label: 'Model Watch', value: 'Stint pace' },
    ],
    tags: ['aero benchmark', 'high deg', 'form track'],
  },
  montreal: {
    type: 'Street hybrid', downforce: 'Medium-low', overtaking: 'High', tyreStress: 'Medium', rhythm: 'Stop-start',
    setup: 'Montreal is braking, traction, kerb ride, and confidence over walls. A slippery but stable car can attack.',
    raceShape: 'Passing and safety cars are live, so the model should leave room for recovery drives and strategy volatility.',
    qualiBias: 'Medium', tyreNote: 'Tyre stress is manageable but traction slides can hurt rears.',
    risk: 'Wall of Champions and safety car timing create genuine variance.',
    modelCue: 'Raise braking stability, ERS efficiency, and chaos probability.',
    sectors: ['Stop-start chicanes', 'Kerb ride and traction', 'Wall-of-Champions pressure'],
    priorities: [
      { label: 'Braking', value: 88, note: 'Repeated heavy stops' },
      { label: 'Kerb Ride', value: 78, note: 'Chicane attack' },
      { label: 'Overtaking', value: 82, note: 'Recovery possible' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'Final chicane approach' },
      { label: 'Risk', value: 'Wall exits' },
      { label: 'Strategy Lever', value: 'SC pit timing' },
    ],
    tags: ['braking', 'kerbs', 'chaos'],
  },
  spielberg: {
    type: 'Permanent', downforce: 'Medium', overtaking: 'High', tyreStress: 'Medium', rhythm: 'Short lap, traction exits',
    setup: 'The Red Bull Ring is short and exposed: tiny gaps, braking confidence, kerb ride, and traction decide track position.',
    raceShape: 'Because laps are short, traffic and track limits can distort practice runs and qualifying margins.',
    qualiBias: 'Medium-high', tyreNote: 'Medium stress; degradation matters less than clean air and penalties.',
    risk: 'Track limits and pack compression create penalty and traffic risk.',
    modelCue: 'Watch quali delta tightly, but keep penalty/track-limit volatility in the uncertainty band.',
    sectors: ['Uphill braking zones', 'Middle kerbs', 'Fast final corners'],
    priorities: [
      { label: 'Braking', value: 82, note: 'T3/T4 attacks' },
      { label: 'Traction', value: 78, note: 'Short exits' },
      { label: 'Discipline', value: 76, note: 'Track limits' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T3 uphill braking' },
      { label: 'Risk', value: 'Track limits' },
      { label: 'Model Watch', value: 'Traffic-adjusted quali' },
    ],
    tags: ['short lap', 'track limits', 'overtaking'],
  },
  silverstone: {
    type: 'Permanent', downforce: 'Medium-high', overtaking: 'Medium', tyreStress: 'High', rhythm: 'High-speed flow',
    setup: 'Silverstone rewards front stability and courage through high-speed sequences without overheating the tyres.',
    raceShape: 'The best high-speed platform should rise, but weather and wind can change the competitive order quickly.',
    qualiBias: 'Medium-high', tyreNote: 'High lateral load; front-left and thermal stability matter.',
    risk: 'Wind direction can transform car balance between sessions.',
    modelCue: 'Raise high-speed corner and tyre-temperature signals; keep weather uncertainty visible.',
    sectors: ['Abbey and Farm commitment', 'Brooklands traction and braking', 'Maggotts-Becketts-Chapel flow'],
    priorities: [
      { label: 'High-Speed Aero', value: 94, note: 'Maggotts / Becketts' },
      { label: 'Tyre Stress', value: 86, note: 'Lateral load' },
      { label: 'Wind Stability', value: 72, note: 'Balance shifts' },
    ],
    zones: [
      { label: 'Signature', value: 'Maggotts-Becketts' },
      { label: 'Pass Zone', value: 'Brooklands / Stowe' },
      { label: 'Risk', value: 'Wind and weather' },
    ],
    tags: ['high speed', 'weather', 'tyre load'],
  },
  spa: {
    type: 'Permanent', downforce: 'Medium-low', overtaking: 'High', tyreStress: 'High', rhythm: 'Long lap, mixed sectors',
    setup: 'Spa is a compromise track: enough low drag for Kemmel, enough stability for Pouhon, and enough tyre care for a long lap.',
    raceShape: 'A fast car can recover here, but mixed-sector compromises make teammate comparisons especially revealing.',
    qualiBias: 'Medium', tyreNote: 'High load and long lap length make degradation and weather timing important.',
    risk: 'Spa weather can make one sector wet and another dry; model uncertainty should stay wide.',
    modelCue: 'Blend straight-line speed, high-speed stability, and wet-weather/chaos probability.',
    sectors: ['La Source to Eau Rouge launch', 'Kemmel and Les Combes attack', 'Pouhon to Blanchimont commitment'],
    priorities: [
      { label: 'Efficiency', value: 88, note: 'Low drag plus load' },
      { label: 'Weather Risk', value: 82, note: 'Microclimates' },
      { label: 'Race Recovery', value: 76, note: 'Passing possible' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'Kemmel into Les Combes' },
      { label: 'Signature', value: 'Eau Rouge / Raidillon' },
      { label: 'Strategy Lever', value: 'Weather timing' },
    ],
    tags: ['long lap', 'weather', 'overtaking'],
  },
  hungaroring: {
    type: 'Permanent', downforce: 'High', overtaking: 'Low', tyreStress: 'Medium-high', rhythm: 'Tight, relentless corners',
    setup: 'Hungaroring behaves like a permanent-street hybrid: maximum downforce, cooling, and clean qualifying are huge.',
    raceShape: 'Race pace matters, but dirty air makes passing difficult, so strategy tries to break stalemates.',
    qualiBias: 'High', tyreNote: 'Heat and traffic can make tyre management uncomfortable.',
    risk: 'Hot weather, cooling limits, and undercut timing can swing the order.',
    modelCue: 'Increase track-position and cooling sensitivity; reduce overtaking recovery assumptions.',
    sectors: ['T1 braking chance', 'Relentless middle-sector corners', 'Final-corner traction'],
    priorities: [
      { label: 'Downforce', value: 92, note: 'Corner density' },
      { label: 'Track Position', value: 86, note: 'Hard passing' },
      { label: 'Cooling', value: 72, note: 'Hot race risk' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T1 or strategy' },
      { label: 'Trap', value: 'Dirty-air train' },
      { label: 'Model Watch', value: 'Qualifying conversion' },
    ],
    tags: ['high downforce', 'track position', 'heat'],
  },
  zandvoort: {
    type: 'Permanent', downforce: 'High', overtaking: 'Low-medium', tyreStress: 'Medium-high', rhythm: 'Banked, committed',
    setup: 'Zandvoort rewards cars that stay balanced through banking, elevation, and wind-sensitive direction changes.',
    raceShape: 'Qualifying is powerful, but banking and weather can create unusual tyre and strategy windows.',
    qualiBias: 'High', tyreNote: 'Banking loads tyres differently; graining can appear if temperatures are awkward.',
    risk: 'Wind, rain, and limited passing raise variance.',
    modelCue: 'Use circuit affinity and quali position aggressively, with weather as a major uncertainty.',
    sectors: ['Tarzan braking', 'Flowing middle banking', 'Final banked launch'],
    priorities: [
      { label: 'Balance', value: 86, note: 'Banking load' },
      { label: 'Qualifying', value: 84, note: 'Track position' },
      { label: 'Weather', value: 70, note: 'Coastal shifts' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'Tarzan T1' },
      { label: 'Signature', value: 'Banked final corner' },
      { label: 'Risk', value: 'Wind shifts' },
    ],
    tags: ['banking', 'coastal wind', 'qualifying'],
  },
  monza: {
    type: 'Permanent', downforce: 'Low', overtaking: 'High', tyreStress: 'Medium', rhythm: 'Power and braking',
    setup: 'Monza is drag efficiency, braking confidence, and kerb control. Excess downforce gets punished every lap.',
    raceShape: 'Slipstream and DRS keep more cars in play, so racecraft and braking stability can beat raw one-lap pace.',
    qualiBias: 'Medium', tyreNote: 'Tyre stress is manageable; straight-line efficiency dominates.',
    risk: 'Turn-one incidents and DRS trains can distort model order.',
    modelCue: 'Raise power/drag efficiency and racecraft; keep recovery probability high.',
    sectors: ['Rettifilo braking', 'Lesmo commitment', 'Ascari and Parabolica launch'],
    priorities: [
      { label: 'Low Drag', value: 96, note: 'Temple of speed' },
      { label: 'Braking', value: 88, note: 'Chicanes' },
      { label: 'Kerbs', value: 76, note: 'Lap time shortcut' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T1 chicane' },
      { label: 'Trap', value: 'Ascari exit' },
      { label: 'Model Watch', value: 'Speed trap vs deg' },
    ],
    tags: ['low drag', 'slipstream', 'braking'],
  },
  madrid: {
    type: 'Street hybrid', downforce: 'Medium-high', overtaking: 'Medium', tyreStress: 'Medium-high', rhythm: 'New-layout discovery',
    setup: 'Madrid is the unknown in the set: the model should lean on street-circuit priors, traction zones, and live practice deltas instead of old circuit memory.',
    raceShape: 'Because there is no mature historical baseline, the first representative long runs should move the forecast more than usual.',
    qualiBias: 'High', tyreNote: 'Expect warmup and rear traction to matter until real stint data proves otherwise.',
    risk: 'High uncertainty from new asphalt, evolving grip, and limited historical race control patterns.',
    modelCue: 'Use neutral circuit memory, increase live-weekend weight, and watch which constructors adapt fastest by FP2.',
    sectors: ['New-surface grip ramp', 'Street braking and traction', 'Late-lap DRS defence'],
    priorities: [
      { label: 'Adaptation', value: 92, note: 'No mature history' },
      { label: 'Traction', value: 78, note: 'Street exits' },
      { label: 'Qualifying', value: 82, note: 'Track position' },
    ],
    zones: [
      { label: 'Model Watch', value: 'FP2 long-run shift' },
      { label: 'Risk', value: 'Track evolution' },
      { label: 'Strategy Lever', value: 'Unknown tyre window' },
    ],
    tags: ['new circuit', 'street hybrid', 'high uncertainty'],
  },
  baku: {
    type: 'Street', downforce: 'Low-medium', overtaking: 'High', tyreStress: 'Medium', rhythm: 'Castle precision plus huge straight',
    setup: 'Baku forces a strange compromise: low drag for the endless straight, but enough rear security to survive the castle section.',
    raceShape: 'Passing is available and chaos is real; safe execution can beat theoretically faster cars.',
    qualiBias: 'Medium-high', tyreNote: 'Tyres are secondary to warmup, safety cars, and straight-line defence.',
    risk: 'Very high safety-car and wall-contact sensitivity.',
    modelCue: 'Widen uncertainty, raise reliability/incident penalties, and reward low-drag efficiency.',
    sectors: ['90-degree street corners', 'Castle squeeze', 'Full-throttle shoreline drag race'],
    priorities: [
      { label: 'Low Drag', value: 90, note: 'Huge straight' },
      { label: 'Wall Risk', value: 88, note: 'Castle / restarts' },
      { label: 'Braking', value: 78, note: 'Street corners' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T1 after main straight' },
      { label: 'Signature', value: 'Castle section' },
      { label: 'Strategy Lever', value: 'Safety car timing' },
    ],
    tags: ['street', 'chaos', 'low drag'],
  },
  singapore: {
    type: 'Street', downforce: 'High', overtaking: 'Low', tyreStress: 'High', rhythm: 'Hot, bumpy, stop-start',
    setup: 'Singapore is attrition by heat, bumps, braking, and traction. The car needs rear stability and cooling as much as pace.',
    raceShape: 'Track position matters, but mistakes and safety cars keep the race alive deep into the night.',
    qualiBias: 'High', tyreNote: 'Heat and rear traction load make degradation important.',
    risk: 'High physical load, walls, and safety car probability.',
    modelCue: 'Raise street-circuit precision, reliability, cooling, and safety-car uncertainty.',
    sectors: ['T1-T5 braking rhythm', 'Bumpy middle traction', 'Final-sector wall discipline'],
    priorities: [
      { label: 'Cooling', value: 88, note: 'Hot night' },
      { label: 'Traction', value: 86, note: 'Rear stability' },
      { label: 'Track Position', value: 84, note: 'Hard passing' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T1 or strategy' },
      { label: 'Risk', value: 'Heat and walls' },
      { label: 'Model Watch', value: 'Long-run rear deg' },
    ],
    tags: ['street', 'heat', 'attrition'],
  },
  austin: {
    type: 'Permanent', downforce: 'Medium-high', overtaking: 'Medium-high', tyreStress: 'High', rhythm: 'Mixed-sector benchmark',
    setup: 'COTA blends Suzuka-like flow, heavy braking, bumps, and tyre degradation into one of the better all-round tests.',
    raceShape: 'Race pace and tyre management can overturn qualifying because multiple passing zones are credible.',
    qualiBias: 'Medium', tyreNote: 'High deg; overheating can collapse pace late in stints.',
    risk: 'Bumps and track limits create hidden pace loss.',
    modelCue: 'Reward all-round cars and tyre-stable long runs more than a single-lap peak.',
    sectors: ['Uphill T1 attack', 'Esses rhythm', 'Back straight and stadium traction'],
    priorities: [
      { label: 'Aero Range', value: 86, note: 'Mixed sectors' },
      { label: 'Tyre Care', value: 82, note: 'Hot stints' },
      { label: 'Overtaking', value: 76, note: 'Recovery routes' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T1 and T12' },
      { label: 'Trap', value: 'Track limits' },
      { label: 'Model Watch', value: 'Long-run pace' },
    ],
    tags: ['all-round', 'tyre deg', 'passing'],
  },
  mexico: {
    type: 'Permanent', downforce: 'High', overtaking: 'Medium', tyreStress: 'Medium', rhythm: 'Low air density',
    setup: 'Mexico runs high wings but low effective downforce because of altitude, making cooling and power-unit behavior unusually important.',
    raceShape: 'Starts and long straight-line efficiency can create a different order than cornering performance suggests.',
    qualiBias: 'Medium-high', tyreNote: 'Tyre stress is moderate; temperature windows and cooling matter.',
    risk: 'Cooling constraints can force lift-and-coast or conservative race modes.',
    modelCue: 'Adjust power-unit and cooling assumptions; raw downforce labels can mislead here.',
    sectors: ['Long main straight', 'Stadium traction', 'Thin-air balance compromise'],
    priorities: [
      { label: 'Cooling', value: 88, note: 'Altitude' },
      { label: 'Power Unit', value: 82, note: 'Thin air' },
      { label: 'Traction', value: 70, note: 'Stadium exits' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T1 slipstream' },
      { label: 'Risk', value: 'Cooling margin' },
      { label: 'Model Watch', value: 'Speed vs temperature' },
    ],
    tags: ['altitude', 'cooling', 'power unit'],
  },
  interlagos: {
    type: 'Permanent', downforce: 'Medium-high', overtaking: 'High', tyreStress: 'Medium-high', rhythm: 'Short lap, weather risk',
    setup: 'Interlagos rewards traction, downhill confidence, and a car that handles bumps while staying efficient up the hill.',
    raceShape: 'Weather, safety cars, and sprint-weekend compression make this one of the easier tracks for surprises.',
    qualiBias: 'Medium', tyreNote: 'Medium-high stress; tyre delta can create passing up the hill.',
    risk: 'Rain and safety cars can rewrite the race quickly.',
    modelCue: 'Keep upset probability elevated and value wet/intermediate adaptability.',
    sectors: ['Senna S opening', 'Middle-sector traction', 'Uphill drag to finish'],
    priorities: [
      { label: 'Traction', value: 82, note: 'Slow exits' },
      { label: 'Weather Risk', value: 86, note: 'Late swings' },
      { label: 'Racecraft', value: 78, note: 'Passing possible' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'Senna S' },
      { label: 'Strategy Lever', value: 'Weather timing' },
      { label: 'Risk', value: 'Restarts' },
    ],
    tags: ['weather', 'short lap', 'overtaking'],
  },
  vegas: {
    type: 'Street', downforce: 'Low', overtaking: 'High', tyreStress: 'Low-medium', rhythm: 'Long straights, cold track',
    setup: 'Vegas is cold-track low-drag street racing: tyre warmup and braking confidence matter more than the circuit map suggests.',
    raceShape: 'Straight-line speed lets cars attack, but cold tyres make out-laps and restarts dangerous.',
    qualiBias: 'Medium', tyreNote: 'Warmup is the tyre story, not classic degradation.',
    risk: 'Cold surface and wall proximity can punish aggressive early laps.',
    modelCue: 'Raise tyre-warmup, straight-speed, and restart uncertainty.',
    sectors: ['Long strip acceleration', 'Heavy braking zones', 'Cold tyre exits'],
    priorities: [
      { label: 'Tyre Warmup', value: 88, note: 'Cold track' },
      { label: 'Low Drag', value: 92, note: 'Long straights' },
      { label: 'Braking', value: 80, note: 'Street stops' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'End of the Strip' },
      { label: 'Risk', value: 'Cold out-laps' },
      { label: 'Model Watch', value: 'Warmup curve' },
    ],
    tags: ['cold track', 'low drag', 'street'],
  },
  lusail: {
    type: 'Permanent', downforce: 'High', overtaking: 'Medium', tyreStress: 'Very high', rhythm: 'Fast loaded corners',
    setup: 'Lusail is tyre-load management. Sustained fast corners punish cars that slide or run too close to the thermal edge.',
    raceShape: 'The race can become a tyre limit exercise more than a pure pace contest.',
    qualiBias: 'Medium-high', tyreNote: 'Very high lateral load; stint rules and compound behavior matter.',
    risk: 'Track limits and tyre-life constraints can distort normal strategy.',
    modelCue: 'Prioritize tyre stress, consistency, and cars that keep pace without sliding.',
    sectors: ['Fast rhythm sections', 'Loaded long corners', 'Main-straight DRS reset'],
    priorities: [
      { label: 'Tyre Load', value: 96, note: 'First-order constraint' },
      { label: 'Aero Load', value: 88, note: 'Fast corners' },
      { label: 'Consistency', value: 82, note: 'No sliding' },
    ],
    zones: [
      { label: 'Risk', value: 'Tyre life' },
      { label: 'Pass Zone', value: 'Main straight' },
      { label: 'Model Watch', value: 'Stint degradation' },
    ],
    tags: ['tyre stress', 'fast corners', 'track limits'],
  },
  yas: {
    type: 'Permanent', downforce: 'Medium', overtaking: 'Medium', tyreStress: 'Medium', rhythm: 'Traction and braking',
    setup: 'Yas Marina rewards rear stability, braking precision, and clean traction out of slow corners.',
    raceShape: 'The layout offers passing chances, but strategy and track position still carry heavy weight.',
    qualiBias: 'Medium-high', tyreNote: 'Medium stress; undercut and tyre warmup matter.',
    risk: 'Twilight conditions change grip and track temperature across the race.',
    modelCue: 'Blend qualifying, traction, and race-start conversion signals.',
    sectors: ['Opening technical corners', 'Back straight braking', 'Hotel-section traction'],
    priorities: [
      { label: 'Traction', value: 80, note: 'Slow exits' },
      { label: 'Braking', value: 76, note: 'Passing zones' },
      { label: 'Track Position', value: 70, note: 'Strategy still key' },
    ],
    zones: [
      { label: 'Pass Zone', value: 'T6/T9 braking' },
      { label: 'Strategy Lever', value: 'Undercut' },
      { label: 'Risk', value: 'Twilight grip shift' },
    ],
    tags: ['twilight', 'traction', 'season finale'],
  },
}

function keyForCircuit(name: string) {
  const value = name.toLowerCase()
  if (value.includes('monaco')) return 'monaco'
  if (value.includes('spa')) return 'spa'
  if (value.includes('silverstone')) return 'silverstone'
  if (value.includes('red bull') || value.includes('spielberg')) return 'spielberg'
  if (value.includes('barcelona')) return 'barcelona'
  if (value.includes('gilles') || value.includes('montr')) return 'montreal'
  if (value.includes('miami')) return 'miami'
  if (value.includes('suzuka')) return 'suzuka'
  if (value.includes('shanghai')) return 'shanghai'
  if (value.includes('albert') || value.includes('melbourne')) return 'melbourne'
  if (value.includes('bahrain') || value.includes('sakhir')) return 'bahrain'
  if (value.includes('jeddah') || value.includes('corniche')) return 'jeddah'
  if (value.includes('hungaroring')) return 'hungaroring'
  if (value.includes('zandvoort')) return 'zandvoort'
  if (value.includes('monza')) return 'monza'
  if (value.includes('madrid')) return 'madrid'
  if (value.includes('baku')) return 'baku'
  if (value.includes('singapore') || value.includes('marina')) return 'singapore'
  if (value.includes('americas') || value.includes('austin')) return 'austin'
  if (value.includes('mexico')) return 'mexico'
  if (value.includes('interlagos') || value.includes('sao paulo') || value.includes('são paulo')) return 'interlagos'
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

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function clampPct(value: number) {
  return `${Math.max(4, Math.min(100, value))}%`
}

function parseIntensity(value: string) {
  const v = value.toLowerCase()
  if (v.includes('very high') || v.includes('maximum') || v.includes('extreme')) return 92
  if (v.includes('high')) return 78
  if (v.includes('medium')) return 58
  if (v.includes('low')) return 32
  return 50
}

const panel = {
  border: '1px solid rgba(255,255,255,.075)',
  borderRadius: 8,
  background: 'rgba(0,0,0,.28)',
} as const

function RaceDna({ profile }: { profile: CircuitProfile }) {
  const values = [
    { label: 'DOWNFORCE', value: parseIntensity(profile.downforce), color: '#E10600' },
    { label: 'OVERTAKE', value: parseIntensity(profile.overtaking), color: '#F59E0B' },
    { label: 'TYRES', value: parseIntensity(profile.tyreStress), color: '#A78BFA' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '132px 1fr', gap: 18, alignItems: 'center' }} className="race-dna">
      <div style={{ width: 132, height: 132, borderRadius: '50%', position: 'relative', display: 'grid', placeItems: 'center', background: `conic-gradient(${values[0].color} ${values[0].value * 1.2}deg, ${values[1].color} 0 ${values[1].value * 2.4}deg, ${values[2].color} 0 360deg)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }}>
        <div style={{ width: 82, height: 82, borderRadius: '50%', background: '#080A0D', display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,.08)' }}>
          <span style={{ fontFamily: bebas, fontSize: 27, color: '#fff', letterSpacing: '.04em' }}>DNA</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {values.map(item => (
          <div key={item.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.35)', letterSpacing: '.12em' }}>{item.label}</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: item.color }}>{item.value}</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,.07)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${item.value}%`, height: '100%', background: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WinnerWall({ winners }: { winners: CircuitWinner[] }) {
  return (
    <section style={{ ...panel, padding: 18, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.14em', marginBottom: 6 }}>RECENT WINNERS</div>
          <div style={{ fontFamily: bebas, fontSize: 32, lineHeight: .9, letterSpacing: '.03em' }}>{winners.length ? 'CIRCUIT MEMORY' : 'NO WINNER MEMORY YET'}</div>
        </div>
        <span style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.28)', letterSpacing: '.1em' }}>FROM LOADED RACE RESULTS</span>
      </div>
      {winners.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr repeat(3, minmax(140px,.72fr))', gap: 10 }} className="winner-wall">
          {winners.slice(0, 4).map((winner, index) => {
            const color = teamColor(winner.team)
            const img = DRIVER_IMAGES[winner.driver_code]
            return (
              <div key={`${winner.season}-${winner.driver_code}-${winner.round}`} style={{ minHeight: index === 0 ? 278 : 210, position: 'relative', overflow: 'hidden', border: `1px solid ${color}44`, borderRadius: 8, background: `linear-gradient(160deg, ${color}24, rgba(0,0,0,.42))`, padding: 14, display: 'grid', alignContent: 'end' }}>
                {img && (
                  <Image
                    src={img}
                    alt={winner.driver_code}
                    fill
                    sizes={index === 0 ? '(max-width: 900px) 100vw, 38vw' : '(max-width: 900px) 50vw, 18vw'}
                    style={{ objectFit: 'cover', objectPosition: 'top center', opacity: index === 0 ? .82 : .58, mixBlendMode: 'screen' }}
                  />
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 28%, rgba(0,0,0,.84) 100%)' }} />
                <div style={{ position: 'relative' }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.48)', letterSpacing: '.14em', marginBottom: 8 }}>{winner.season}</div>
                  <div style={{ fontFamily: bebas, fontSize: index === 0 ? 62 : 42, lineHeight: .82, color }}>{winner.driver_code}</div>
                  <div style={{ marginTop: 8, fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.58)' }}>{winner.team}</div>
                  <div style={{ marginTop: 8, fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.34)' }}>
                    {winner.grid_position ? `Started P${winner.grid_position}` : 'Grid unknown'} · {Number(winner.points || 0).toFixed(0)} pts
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ border: '1px dashed rgba(255,255,255,.12)', borderRadius: 8, padding: 20, fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.34)', letterSpacing: '.08em' }}>
          This circuit has no loaded winner rows yet. It will populate automatically once race results exist in Neon.
        </div>
      )}
    </section>
  )
}

export default function CircuitPage() {
  const [calendar, setCalendar] = useState<CalendarRace[]>([])
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [winners, setWinners] = useState<CircuitWinner[]>([])
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

  const circuitKey = race ? keyForCircuit(race.circuit_name) : 'default'
  const profile = CIRCUIT_PROFILES[circuitKey] ?? FALLBACK_PROFILE

  useEffect(() => {
    if (!circuitKey || circuitKey === 'default') {
      setWinners([])
      return
    }
    fetch(`/api/racing/circuit-history?circuitKey=${circuitKey}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setWinners(Array.isArray(data?.winners) ? data.winners : []))
      .catch(() => setWinners([]))
  }, [circuitKey])

  const track = useMemo(() => {
    if (!race) return null
    return (
      CIRCUITS.find(c => keyForCircuit(c.name) === circuitKey) ??
      CIRCUITS.find(c => Number(c.rd) === race.round) ??
      null
    )
  }, [circuitKey, race])

  const topDrivers = prediction?.drivers.slice(0, 8) ?? []
  const favorite = topDrivers[0]
  const podiumPool = prediction?.drivers.filter(d => d.podium_probability >= 0.18).slice(0, 6) ?? []
  const winSpread = topDrivers.length > 1
    ? Math.max(0, favorite.win_probability - topDrivers[1].win_probability)
    : 0

  const raceShort = race?.race_name.replace(' Grand Prix', '')
  const weekendStatus = race?.is_completed ? 'Completed' : 'Upcoming'
  const forecastTone = prediction
    ? winSpread > 0.18 ? 'Pointed favorite'
      : winSpread > 0.08 ? 'Lean, not lock'
      : 'Open field'
    : 'Awaiting model'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <main style={{ width: '100%', maxWidth: 1240, margin: '0 auto', padding: 'calc(var(--header-h) + 32px) 18px 80px', display: 'grid', gap: 18 }}>
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(360px,.9fr)', gap: 18, alignItems: 'stretch' }} className="circuit-hero">
          <div style={{ ...panel, padding: 24, minHeight: 360, display: 'grid', alignContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(225,6,0,.22), transparent 38%), radial-gradient(circle at 75% 10%, rgba(245,158,11,.16), transparent 32%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 26, height: 1, background: '#E10600' }} />
                <span style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.42)', letterSpacing: '.18em' }}>
                  {loading ? 'LOADING CIRCUIT DOSSIER' : race ? `ROUND ${race.round} · 2026 · ${weekendStatus.toUpperCase()}` : 'CIRCUIT DOSSIER'}
                </span>
              </div>
              <h1 style={{ fontFamily: bebas, fontSize: 'clamp(56px,9vw,118px)', lineHeight: .82, margin: 0, letterSpacing: '.02em', maxWidth: 650 }}>
                {raceShort?.toUpperCase() ?? 'RACE'} <span style={{ color: '#E10600' }}>GP</span>
              </h1>
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {[race?.circuit_name, race?.city, race?.country, formatDate(race?.race_date), formatTime(race?.race_start_utc)].filter(Boolean).map(item => (
                  <span key={item} style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.48)', letterSpacing: '.08em' }}>{item}</span>
                ))}
              </div>
              <p style={{ margin: '26px 0 0', maxWidth: 660, fontFamily: mono, fontSize: 12, lineHeight: 1.75, color: 'rgba(255,255,255,.64)' }}>
                {profile.setup}
              </p>
            </div>

            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 1, marginTop: 24, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, overflow: 'hidden' }}>
              {[
                ['RACE SHAPE', forecastTone],
                ['QUALI WEIGHT', profile.qualiBias],
                ['TYRE STORY', profile.tyreStress],
              ].map(([label, value]) => (
                <div key={label} style={{ background: 'rgba(5,7,10,.82)', padding: '14px 16px' }}>
                  <div style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.28)', letterSpacing: '.14em', marginBottom: 7 }}>{label}</div>
                  <div style={{ fontFamily: bebas, fontSize: 26, letterSpacing: '.03em' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...panel, padding: 18, minHeight: 360, display: 'grid', gridTemplateRows: '1fr auto', gap: 16, overflow: 'hidden' }}>
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 260 }}>
              {track ? (
                <svg viewBox={`0 0 ${track.vw} ${track.vh}`} style={{ width: '100%', maxWidth: 440, overflow: 'visible', filter: 'drop-shadow(0 24px 36px rgba(0,0,0,.55))' }}>
                  <path d={track.d} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={track.d} fill="none" stroke="rgba(255,255,255,.72)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={track.d} fill="none" stroke="#E10600" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 5" />
                  <circle cx={track.sf[0]} cy={track.sf[1]} r="3.2" fill="#F59E0B" />
                </svg>
              ) : (
                <span style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.25)', letterSpacing: '.14em' }}>TRACK MAP UNAVAILABLE</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
              {profile.sectors.map((sector, index) => (
                <div key={sector} style={{ borderTop: '1px solid rgba(225,6,0,.42)', paddingTop: 10 }}>
                  <div style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.28)', letterSpacing: '.12em', marginBottom: 5 }}>SECTOR {index + 1}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,.58)' }}>{sector}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.28)', letterSpacing: '.14em' }}>WEEKEND</span>
          <select
            value={selectedRound ?? ''}
            onChange={event => setSelectedRound(Number(event.target.value))}
            style={{ minWidth: 280, background: 'rgba(0,0,0,.54)', border: '1px solid rgba(225,6,0,.38)', borderRadius: 6, color: '#fff', padding: '9px 12px', fontFamily: mono, fontSize: 11 }}
          >
            {calendar.map(r => (
              <option key={r.round} value={r.round}>R{r.round} · {r.race_name.replace(' Grand Prix', ' GP')}</option>
            ))}
          </select>
          {profile.tags.map(tag => (
            <span key={tag} style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.38)', letterSpacing: '.08em', border: '1px solid rgba(255,255,255,.08)', borderRadius: 999, padding: '7px 10px', background: 'rgba(255,255,255,.025)' }}>
              {tag.toUpperCase()}
            </span>
          ))}
          {prediction && (
            <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.34)', letterSpacing: '.1em' }}>
              MODEL {prediction.model_version} · {prediction.simulation_runs.toLocaleString()} SIMS
            </span>
          )}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,.07)' }}>
          {[
            ['TYPE', profile.type],
            ['DOWNFORCE', profile.downforce],
            ['OVERTAKING', profile.overtaking],
            ['TYRE STRESS', profile.tyreStress],
            ['LENGTH', race?.circuit_length_km ? `${Number(race.circuit_length_km).toFixed(3)} KM` : 'TBD'],
            ['LAPS', race?.race_laps ?? 'TBD'],
            ['DRS ZONES', race?.drs_zones ?? 'TBD'],
            ['SPRINT', race?.is_sprint_weekend ? 'YES' : 'NO'],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: '16px 18px', background: '#080A0D' }}>
              <div style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.24)', letterSpacing: '.14em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: bebas, fontSize: 25, color: label === 'OVERTAKING' ? '#F59E0B' : '#fff', letterSpacing: '.03em' }}>{value}</div>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(320px,.75fr)', gap: 18 }} className="circuit-grid">
          <WinnerWall winners={winners} />
          <div style={{ ...panel, padding: 18, display: 'grid', alignContent: 'center', gap: 18 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.14em', marginBottom: 10 }}>RACE DNA</div>
              <div style={{ fontFamily: bebas, fontSize: 40, lineHeight: .92, letterSpacing: '.03em' }}>{profile.rhythm.toUpperCase()}</div>
            </div>
            <RaceDna profile={profile} />
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(320px,.72fr)', gap: 18 }} className="circuit-grid">
          <div style={{ ...panel, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,.36)', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 2, height: 15, background: '#E10600' }} />
              <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.14em', color: 'rgba(255,255,255,.5)' }}>MODEL OUTLOOK</span>
            </div>
            {topDrivers.length ? topDrivers.map((driver, index) => {
              const color = teamColor(driver.team)
              return (
                <div key={driver.driver_code} style={{ display: 'grid', gridTemplateColumns: '34px 74px minmax(120px,1fr) minmax(110px,.8fr) 70px', gap: 10, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.04)', background: index < 3 ? `${color}0A` : 'transparent' }} className="driver-row">
                  <span style={{ fontFamily: bebas, fontSize: 18, color: index === 0 ? '#F59E0B' : 'rgba(255,255,255,.32)' }}>{index + 1}</span>
                  <span style={{ fontFamily: bebas, fontSize: 22, color }}>{driver.driver_code}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{driver.team}</span>
                  <span style={{ height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 999, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: clampPct(driver.win_probability * 100), height: '100%', background: color }} />
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: '#F59E0B', textAlign: 'right' }}>{pct(driver.win_probability)} WIN</span>
                </div>
              )
            }) : (
              <div style={{ padding: 28, fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.32)', letterSpacing: '.12em' }}>
                NO PREDICTION HAS BEEN WRITTEN FOR THIS ROUND YET
              </div>
            )}
          </div>

          <div style={{ ...panel, padding: 18, display: 'grid', gap: 17, alignContent: 'start' }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.14em', marginBottom: 10 }}>RACE SHAPE</div>
              <p style={{ margin: 0, fontFamily: mono, fontSize: 12, lineHeight: 1.65, color: 'rgba(255,255,255,.62)' }}>{profile.raceShape}</p>
            </div>
            <div>
              <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.14em', marginBottom: 10 }}>MODEL CUE</div>
              <p style={{ margin: 0, fontFamily: mono, fontSize: 12, lineHeight: 1.65, color: 'rgba(255,255,255,.62)' }}>{profile.modelCue}</p>
            </div>
            {favorite && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 14 }}>
                <div style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.25)', letterSpacing: '.12em', marginBottom: 7 }}>CURRENT LEAN</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontFamily: bebas, fontSize: 34, color: teamColor(favorite.team) }}>{favorite.driver_code}</span>
                  <span style={{ fontFamily: mono, fontSize: 11, color: 'rgba(255,255,255,.56)' }}>{pct(favorite.win_probability)} win · {pct(favorite.podium_probability)} podium</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,.8fr) minmax(0,1.2fr) minmax(280px,.8fr)', gap: 18 }} className="circuit-grid">
          <div style={{ ...panel, padding: 18, background: 'linear-gradient(180deg, rgba(225,6,0,.08), rgba(0,0,0,.28))' }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.14em', marginBottom: 18 }}>SETUP PRIORITIES</div>
            <div style={{ display: 'grid', gap: 18 }}>
              {profile.priorities.map(item => (
                <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,.1)', background: `conic-gradient(${item.value > 85 ? '#E10600' : item.value > 70 ? '#F59E0B' : 'rgba(255,255,255,.55)'} ${item.value * 3.6}deg, rgba(255,255,255,.08) 0deg)` }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#080A0D', fontFamily: bebas, fontSize: 18 }}>{item.value}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: bebas, fontSize: 24, lineHeight: .95, letterSpacing: '.03em' }}>{item.label}</div>
                    <div style={{ marginTop: 6, fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.42)' }}>{item.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...panel, padding: 18 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.14em', marginBottom: 15 }}>TRACK-SPECIFIC DOSSIER</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }} className="dossier-cols">
              {[
                ['TYRES', profile.tyreNote],
                ['RISK', profile.risk],
                ['LAP RECORD', race?.lap_record ? `${race.lap_record} · ${race.lap_record_holder ?? ''} ${race.lap_record_year ?? ''}` : 'TBD'],
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '1px solid rgba(225,6,0,.38)', paddingLeft: 12 }}>
                  <div style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.24)', letterSpacing: '.12em', marginBottom: 7 }}>{label}</div>
                  <div style={{ fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,.6)', lineHeight: 1.55 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...panel, padding: 18 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.14em', marginBottom: 15 }}>DECISION POINTS</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {profile.zones.map(item => (
                <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.26)', letterSpacing: '.12em' }}>{item.label.toUpperCase()}</span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,.62)', lineHeight: 1.45 }}>{item.value}</span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, alignItems: 'baseline', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                <span style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.26)', letterSpacing: '.12em' }}>CONFIDENCE</span>
                <span style={{ fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,.62)' }}>{prediction ? pct(prediction.confidence) : 'No model yet'}</span>
              </div>
            </div>
          </div>
        </section>

        {podiumPool.length > 0 && (
          <section style={{ ...panel, padding: 18 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,.3)', letterSpacing: '.14em', marginBottom: 15 }}>PODIUM CONVERSION WATCH</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {podiumPool.map(driver => (
                <div key={driver.driver_code} style={{ border: `1px solid ${teamColor(driver.team)}55`, borderRadius: 8, padding: 14, background: `${teamColor(driver.team)}0D` }}>
                  <div style={{ fontFamily: bebas, fontSize: 32, color: teamColor(driver.team), lineHeight: .9 }}>{driver.driver_code}</div>
                  <div style={{ marginTop: 8, fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.48)' }}>{driver.team}</div>
                  <div style={{ marginTop: 12, fontFamily: mono, fontSize: 11, color: '#F59E0B' }}>{pct(driver.podium_probability)} PODIUM</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
      <style jsx>{`
        @media (max-width: 900px) {
          .circuit-hero,
          .circuit-grid {
            grid-template-columns: 1fr !important;
          }
          .driver-row {
            grid-template-columns: 28px 56px 1fr !important;
          }
          .driver-row span:nth-child(4),
          .driver-row span:nth-child(5) {
            grid-column: 3;
          }
          .dossier-cols {
            grid-template-columns: 1fr !important;
          }
          .winner-wall {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .race-dna {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 560px) {
          main {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          select {
            min-width: 100% !important;
          }
          .winner-wall {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
