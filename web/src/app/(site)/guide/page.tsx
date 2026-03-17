'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'

// ── Data ──────────────────────────────────────────────────────────────────────

const BEGINNER_CARDS = [
  {
    number: '01',
    title: 'The Championship',
    icon: '🏆',
    body: 'Formula 1 runs two parallel championships — Drivers and Constructors. The Drivers\' Championship crowns the best individual; the Constructors\' Championship rewards the team that scores the most combined points across both cars.',
    accent: '#E8002D',
  },
  {
    number: '02',
    title: 'Points System',
    icon: '📊',
    body: 'Points are awarded to the top 10 finishers: 25-18-15-12-10-8-6-4-2-1. An extra point goes to the driver setting the fastest lap — if they finish in the top 10. Sprint races award half points to the top 8.',
    accent: '#FF8000',
  },
  {
    number: '03',
    title: 'The Cars',
    icon: '🏎️',
    body: 'F1 cars are the fastest regulated circuit racing cars on the planet. They generate more downforce than their own weight, can pull 5G in corners, and accelerate 0–100 mph in under 2 seconds. Each car is worth over $15 million.',
    accent: '#27F4D2',
  },
  {
    number: '04',
    title: 'Pit Stops',
    icon: '🔧',
    body: 'Teams must use at least two different tyre compounds during a dry race. Pit stops typically take 2–3 seconds for a tyre change. Strategy — when to pit and which compound to use — is often the difference between winning and losing.',
    accent: '#F59E0B',
  },
  {
    number: '05',
    title: 'DRS',
    icon: '🔓',
    body: 'The Drag Reduction System opens a flap on the rear wing to reduce drag. It can only be used in designated zones when a driver is within 1 second of the car ahead. It adds roughly 10–15 km/h of top speed and is key to overtaking.',
    accent: '#A78BFA',
  },
  {
    number: '06',
    title: 'Safety Car',
    icon: '🚗',
    body: 'When there\'s an incident on track, the Safety Car or Virtual Safety Car neutralises the race. No overtaking is permitted behind the Safety Car. Teams often pit during these periods to gain a strategic advantage.',
    accent: '#4ADE80',
  },
]

const RACE_WEEKEND = [
  {
    day: 'Thu',
    sessions: [
      { name: 'Media Day', type: 'media', desc: 'Drivers and team principals meet the press. No track action.' },
    ],
  },
  {
    day: 'Fri',
    sessions: [
      { name: 'FP1', type: 'practice', desc: '60 minutes. Teams gather baseline data, test setups, and run rookies (mandatory once per season).' },
      { name: 'FP2', type: 'practice', desc: '60 minutes. Race simulation runs and longer tyre assessments. Critical for race strategy planning.' },
    ],
  },
  {
    day: 'Sat',
    sessions: [
      { name: 'FP3', type: 'practice', desc: '60 minutes. Final setup tweaks and qualifying preparation. Short, sharp runs.' },
      { name: 'Qualifying', type: 'qualifying', desc: 'Three knockout segments (Q1/Q2/Q3). Sets the grid. Q1 eliminates P16–20, Q2 eliminates P11–15, Q3 decides pole.' },
    ],
  },
  {
    day: 'Sun',
    sessions: [
      { name: 'Race', type: 'race', desc: 'Minimum 305km distance. Cars must complete a minimum of 2 pit stops in wet conditions, 1 in dry. Winner takes 25 points.' },
    ],
  },
]

const SPRINT_WEEKEND = [
  { day: 'Fri', sessions: [{ name: 'FP1', type: 'practice', desc: 'Only free practice session of the weekend.' }, { name: 'Sprint Qualifying', type: 'qualifying', desc: 'Sets the Sprint grid. Three knockout segments, same format as Qualifying.' }] },
  { day: 'Sat', sessions: [{ name: 'Sprint', type: 'sprint', desc: '100km race. Top 8 score points (8-7-6-5-4-3-2-1). No mandatory pit stops.' }, { name: 'Qualifying', type: 'qualifying', desc: 'Sets the main race grid.' }] },
  { day: 'Sun', sessions: [{ name: 'Race', type: 'race', desc: 'Full Grand Prix distance.' }] },
]

const CHANGES_2026 = [
  {
    category: 'POWER UNIT',
    color: '#E8002D',
    icon: '⚡',
    title: '50/50 Power Split',
    before: '~160kW electrical deployment',
    after: '~350kW electrical deployment',
    detail: 'The most radical PU change in F1 history. Equal power from ICE and ERS means the MGU-K is now a genuine performance device, not just energy recovery. The MGU-H is removed, simplifying the unit.',
  },
  {
    category: 'AERODYNAMICS',
    color: '#FF8000',
    icon: '💨',
    title: 'Active Rear Wing',
    before: 'DRS: manual activation, 1s gap rule',
    after: 'ARW: automatic above 290 km/h',
    detail: 'DRS is abolished. The new Active Rear Wing automatically opens on straights and closes in corners, giving all cars the benefit — not just the chasing car. Designed to increase overtaking without controversy.',
  },
  {
    category: 'CHASSIS',
    color: '#27F4D2',
    icon: '🏎️',
    title: 'Slimmer, Lighter Cars',
    before: '798kg minimum weight, 5.6m long',
    after: '768kg minimum weight, ~5.2m long',
    detail: 'Cars get 30kg lighter and noticeably shorter. This directly addresses the "too big to race" criticism of the current generation. Narrower chassis improves mechanical grip and makes wheel-to-wheel racing more feasible.',
  },
  {
    category: 'TYRES',
    color: '#A78BFA',
    icon: '🔄',
    title: 'New Tyre Compounds',
    before: 'C1–C5 range, 4 dry specs per event',
    after: 'Revised compounds, 3 specs per event',
    detail: 'Pirelli redesigns compounds from scratch around the new car philosophy. Reduced blanket temperatures and revised construction to work with the lighter, higher-ERS cars. Simplified selection process for teams.',
  },
  {
    category: 'REGULATIONS',
    color: '#4ADE80',
    icon: '📋',
    title: 'Cost Cap Tightened',
    before: '$135M operational cap (2024)',
    after: '$130M cap, stricter enforcement',
    detail: 'The Financial Regulations continue to tighten, closing loopholes around driver salaries and marketing activities. The FIA adds two new cost cap auditors and introduces real-time reporting requirements.',
  },
  {
    category: 'NEW ENTRANT',
    color: '#F59E0B',
    icon: '🆕',
    title: 'GM / Cadillac Joins',
    before: '10 teams, all European/Japanese PU',
    after: '11 teams, American manufacturer enters',
    detail: 'General Motors enters as the 11th constructor via the Cadillac brand, the first American manufacturer in F1 since 2015. They partner with Ferrari for power units initially while developing their own engine for the future.',
  },
]

const GLOSSARY_CATEGORIES = [
  {
    category: 'Race Strategy',
    color: '#FF8000',
    terms: [
      { term: 'Undercut', def: 'Pitting earlier than a rival to gain track position by emerging on fresh, faster tyres before they pit.', detail: 'Works when pit stop time loss is less than the gap to the car ahead. Most effective when tyres are degrading heavily.' },
      { term: 'Overcut', def: 'Staying out longer than a rival, hoping to benefit from their tyre change being slower or traffic costing them time.', detail: 'Works when the car ahead pits into traffic, or when staying out on older but still competitive tyres allows pushing harder.' },
      { term: 'Free Stop', def: 'A pit stop made under Safety Car or VSC where the time cost is minimal because all cars slow down.', detail: 'Teams monitor the Safety Car delta closely. A free stop can transform a race — turning a one-stop into a two-stop at almost no cost.' },
      { term: 'Split Strategy', def: 'Running the two cars on different tyre strategies to cover multiple scenarios and learn which works best.', detail: 'Teams with strong cars often split strategy to gain information. If one strategy wins, they\'ve covered both. If neither is clearly better, they have more data.' },
      { term: 'Tyre Window', def: 'The operating temperature range in which a tyre produces maximum grip.', detail: 'Outside the window (too cold or too hot) the tyres slide and wear faster. Getting tyres "into the window" quickly after a pit stop is critical.' },
      { term: 'Stacking', def: 'When a team calls both cars in to pit on the same lap, one behind the other.', detail: 'The second car always loses time waiting. Teams try to avoid stacking but sometimes it\'s unavoidable under a Safety Car.' },
    ],
  },
  {
    category: 'Tyres',
    color: '#F59E0B',
    terms: [
      { term: 'Graining', def: 'Rubber tearing off the tyre surface in chunks due to excessive sliding, causing vibration and reduced grip.', detail: 'Usually temporary — the tyre can "come back" once it clears the granules. Common in cool conditions or when drivers push too hard early.' },
      { term: 'Blistering', def: 'Heat bubbles forming under the tyre surface due to overheating. Unlike graining, blistering is permanent damage.', detail: 'Blistered tyres typically require an immediate pit stop. Caused by running too high a downforce level or aggressive driving on the wrong compound.' },
      { term: 'Deg', def: 'Short for degradation — the rate at which tyre performance falls off over a stint.', detail: 'High-deg tracks like Barcelona force teams into more pit stops. Low-deg tracks like Monaco allow one-stop strategies.' },
      { term: 'Cliff', def: 'The point at which a tyre suddenly loses grip very rapidly, ending the useful life of the stint.', detail: 'Drivers must know when they\'re approaching the cliff and either push harder (to lap before it hits) or manage (to extend the stint).' },
      { term: 'Bedding In', def: 'The first lap or two on fresh tyres where the tyre is brought up to temperature.', detail: 'Drivers typically manage pace on their out-lap to heat the tyres evenly before pushing. Aggressive driving on cold tyres causes graining.' },
      { term: 'Prime / Option', def: 'Historic terms for the harder (prime) and softer (option) compounds at each race. Now called Hard/Medium/Soft.', detail: 'Pirelli selects three of the five available compounds for each race based on track characteristics.' },
    ],
  },
  {
    category: 'Car & Technical',
    color: '#27F4D2',
    terms: [
      { term: 'Downforce', def: 'Aerodynamic force pressing the car into the ground, generated by wings and floor, enabling higher cornering speeds.', detail: 'More downforce = faster corners but more drag on straights. Teams balance the two based on circuit characteristics.' },
      { term: 'Ground Effect', def: 'Aerodynamic principle where airflow under the car creates a low-pressure zone, sucking the car to the track.', detail: 'Reintroduced in 2022. Generates downforce with less drag than wings, and is less sensitive to following another car — key to overtaking.' },
      { term: 'Rake', def: 'The nose-down angle of the car. High rake means the rear sits higher than the front.', detail: 'High-rake cars historically generated more rear downforce but were harder to set up. The 2022 regulations largely neutralised rake as a design philosophy.' },
      { term: 'Porpoising', def: 'Rapid oscillating bounce caused by the ground effect stall and re-stall at high speed.', detail: 'Plagued the 2022 season opener. The FIA introduced ride height directives which reduced the phenomenon but teams still battle it.' },
      { term: 'DRS', def: 'Drag Reduction System — opens a rear wing flap to reduce drag when within 1 second of the car ahead.', detail: 'Activated in DRS zones. Adds ~10–15 km/h. Controversial but effective overtaking aid. Replaced by Active Rear Wing in 2026.' },
      { term: 'ERS', def: 'Energy Recovery System — harvests energy under braking and from the turbo, stored and deployed as additional power.', detail: 'Provides up to 160kW of extra power in 2025. In 2026, this rises to ~350kW as the regulations reach 50/50 ICE/ERS split.' },
      { term: 'MGU-K', def: 'Motor Generator Unit – Kinetic. Recovers energy under braking and deploys it as additional power.', detail: 'Limited to 120kW deployment currently. The 2026 MGU-K is far more powerful at ~350kW, fundamentally changing how drivers accelerate.' },
      { term: 'Parc Fermé', def: 'Controlled environment entered after qualifying where no setup changes to the car are permitted.', detail: 'Teams can make minor repairs and must use the same setup in the race as in qualifying. Limits strategic flexibility.' },
    ],
  },
  {
    category: 'Race Control',
    color: '#E8002D',
    terms: [
      { term: 'VSC', def: 'Virtual Safety Car — all cars must drive at a prescribed delta time. No physical safety car on track.', detail: 'Used for minor incidents. Cars maintain position but must slow significantly. Delta times are shown on driver steering wheels.' },
      { term: 'Delta Time', def: 'The time difference between a driver and a target lap time, used to manage pace behind Safety Car.', detail: 'Drivers must stay within a +/- tolerance of the delta. Going too fast risks a penalty; too slow risks a snap. Some drivers game it strategically.' },
      { term: 'Black Flag', def: 'Disqualification — the driver must immediately return to the pits and retire from the race.', detail: 'Rare. Usually for dangerous driving, ignoring red flags, or technical infringements discovered mid-race.' },
      { term: 'Black/White Flag', def: 'A formal warning for unsportsmanlike behaviour. A second occurrence typically results in a time penalty.', detail: 'Issued by race control for things like blocking on a qualifying lap, weaving to defend, or impeding another car.' },
      { term: 'Snap Oversteer', def: 'Sudden, violent loss of rear grip. At F1 speeds this is nearly impossible to catch.', detail: 'Causes many offs. Usually caused by a kerb disturbing the rear, lifting off the throttle mid-corner, or a mechanical failure.' },
      { term: 'Track Limits', def: 'The defined boundaries of the racing surface. Exceeding them consistently results in lap time deletion or penalties.', detail: 'Defined by white lines. The FIA monitors every corner on every lap. Persistent violation results in warnings, then time penalties.' },
    ],
  },
  {
    category: 'Regulations & Governance',
    color: '#A78BFA',
    terms: [
      { term: 'FIA', def: 'Fédération Internationale de l\'Automobile. The governing body that writes and enforces all F1 regulations.', detail: 'Separate from Formula 1 Management (FOM) which manages commercial rights. The FIA stewards make race decisions; appeals go to the FIA Court of Appeal.' },
      { term: 'Cost Cap', def: 'Maximum budget teams can spend on car development and operations per season ($135M in 2024).', detail: 'Introduced in 2021. Excludes driver salaries and a few other items. Breaches result in fines and/or constructor point deductions.' },
      { term: 'Concorde Agreement', def: 'The commercial contract between F1 teams, FOM, and FIA governing prize money distribution and governance rights.', detail: 'Teams sign the Concorde Agreement to participate. It sets out commercial terms, prize money structure, and voting rights on regulation changes.' },
      { term: 'Token System', def: 'Historical mechanism limiting the number of development changes a team could make to their car per season.', detail: 'Used in 2021–2022 for power units to limit spending during COVID. Largely phased out as cost cap became the main restriction.' },
      { term: 'Homologation', def: 'The process of certifying a component meets FIA standards and is approved for use.', detail: 'Safety-critical components like helmets, HANS devices, and tyres must be homologated. Components can be homologated then frozen (not further developed).' },
      { term: 'Scrutineering', def: 'The FIA technical inspection of cars before and after sessions to verify compliance with regulations.', detail: 'Post-race scrutineering is why teams wait on the podium — the top finishers\' cars are checked before results are confirmed.' },
    ],
  },
]

const SESSION_COLORS: Record<string, string> = {
  practice: '#3671C6',
  qualifying: '#F59E0B',
  race: '#E8002D',
  sprint: '#FF8000',
  media: '#6b7280',
}

// Top-down car zones — x/y/w/h as percentages of SVG viewBox (0 0 400 800)
const CAR_ZONES_TOPDOWN = [
  {
    id: 'front-wing',
    label: 'Front Wing',
    color: '#E8002D',
    shape: 'M 680,100 L 740,100 L 740,300 L 680,300 Z',
    labelX: 710, labelY: 200,
    reg: 'Max 1,050mm wide. Generates ~25% of total downforce. The most complex component on the car — teams spend millions on tiny endplate geometry variations. 2026: simplified outwash rules to reduce dirty air.',
  },
  {
    id: 'nose',
    label: 'Nose Cone',
    color: '#FF8000',
    shape: 'M 620,160 L 680,140 L 680,260 L 620,240 Z',
    labelX: 650, labelY: 200,
    reg: 'Strict crash structure requirements — must absorb 60kJ of energy. Houses the front wing attachment and front jack point. Teams cannot share nose designs between constructors.',
  },
  {
    id: 'front-tyres',
    label: 'Front Tyres',
    color: '#4ADE80',
    shape: 'M 555,90 L 610,90 L 610,160 L 555,160 Z',
    labelX: 582, labelY: 125,
    reg: 'Pirelli spec. 305/670-13. 18-inch rims since 2022. Teams receive 13 sets per driver per weekend. Tyre compound selection is declared before the season begins.',
  },
  {
    id: 'front-tyres-r',
    label: 'Front Tyres',
    color: '#4ADE80',
    shape: 'M 555,240 L 610,240 L 610,310 L 555,310 Z',
    labelX: 582, labelY: 275,
    reg: 'Pirelli spec. 305/670-13.',
  },
  {
    id: 'front-suspension',
    label: 'Front Suspension',
    color: '#F59E0B',
    shape: 'M 510,130 L 555,110 L 555,165 L 510,175 Z',
    labelX: 532, labelY: 148,
    reg: 'Push-rod or pull-rod layouts permitted. Geometry declared at season start, cannot be changed. Carbon fibre wishbones mandatory. 2026: teams exploring new geometries for lighter car dynamics.',
  },
  {
    id: 'front-suspension-r',
    label: 'Front Suspension',
    color: '#F59E0B',
    shape: 'M 510,225 L 555,235 L 555,290 L 510,270 Z',
    labelX: 532, labelY: 255,
    reg: 'Push-rod or pull-rod layouts permitted.',
  },
  {
    id: 'cockpit',
    label: 'Cockpit & Halo',
    color: '#27F4D2',
    shape: 'M 400,150 L 510,140 L 510,260 L 400,250 Z',
    labelX: 455, labelY: 200,
    reg: 'Halo mandatory since 2018 — titanium structure withstanding 125kN. Cockpit dimensions strictly regulated for driver safety and extraction. Biometric gloves and HANS device mandatory.',
  },
  {
    id: 'sidepods',
    label: 'Sidepods',
    color: '#A78BFA',
    shape: 'M 300,100 L 510,140 L 510,160 L 300,160 Z',
    labelX: 405, labelY: 130,
    reg: 'House radiators and cooling. Teams have aerodynamic freedom here — Mercedes zero-sidepod design was legal in 2022. Strict overall volume rules prevent extreme interpretations from 2023.',
  },
  {
    id: 'sidepods-r',
    label: 'Sidepods',
    color: '#A78BFA',
    shape: 'M 300,240 L 510,260 L 510,240 L 300,240 Z',
    labelX: 405, labelY: 255,
    reg: 'House radiators and cooling.',
  },
  {
    id: 'floor',
    label: 'Floor & Tunnels',
    color: '#FF8000',
    shape: 'M 200,165 L 510,155 L 510,245 L 200,235 Z',
    labelX: 355, labelY: 200,
    reg: '2026: revised floor geometry. Venturi tunnels generate ~40% of total downforce via ground effect. Regulated for minimum ride height. No active suspension permitted. Most performance-sensitive area on the car.',
  },
  {
    id: 'rear-tyres',
    label: 'Rear Tyres',
    color: '#4ADE80',
    shape: 'M 130,90 L 200,90 L 200,170 L 130,170 Z',
    labelX: 165, labelY: 130,
    reg: 'Pirelli spec. 325/705-13 — wider than front. 18-inch rims. Rear tyres degrade faster due to traction loads. Compound selection is a key strategic variable.',
  },
  {
    id: 'rear-tyres-r',
    label: 'Rear Tyres',
    color: '#4ADE80',
    shape: 'M 130,230 L 200,230 L 200,310 L 130,310 Z',
    labelX: 165, labelY: 270,
    reg: 'Pirelli spec. 325/705-13 — wider than front.',
  },
  {
    id: 'rear-suspension',
    label: 'Rear Suspension',
    color: '#F59E0B',
    shape: 'M 200,100 L 260,115 L 260,175 L 200,170 Z',
    labelX: 230, labelY: 140,
    reg: 'Pull-rod layout dominant at rear. Works differently to front — lower pickup points suit rear aerodynamic philosophy. Gearbox acts as stressed member of the rear suspension structure.',
  },
  {
    id: 'rear-suspension-r',
    label: 'Rear Suspension',
    color: '#F59E0B',
    shape: 'M 200,230 L 260,225 L 260,285 L 200,300 Z',
    labelX: 230, labelY: 260,
    reg: 'Pull-rod layout dominant at rear.',
  },
  {
    id: 'power-unit',
    label: 'Power Unit',
    color: '#E8002D',
    shape: 'M 260,155 L 400,150 L 400,250 L 260,245 Z',
    labelX: 330, labelY: 200,
    reg: '2026: 1.6L V6 turbo hybrid, 50/50 ICE/ERS split (~850bhp). Suppliers: Mercedes, Ferrari, Renault, Honda, Ford. Max 4 units per driver per season before grid penalties apply.',
  },
  {
    id: 'diffuser',
    label: 'Diffuser',
    color: '#60A5FA',
    shape: 'M 80,145 L 130,130 L 130,270 L 80,255 Z',
    labelX: 105, labelY: 200,
    reg: 'Expands airflow from tunnels, creating low pressure. Height and length strictly regulated. Working with the floor, exits ~30% of car\'s total downforce. No beam wing permitted since 2022.',
  },
  {
    id: 'rear-wing',
    label: 'Rear Wing',
    color: '#E8002D',
    shape: 'M 50,110 L 80,100 L 80,300 L 50,290 Z',
    labelX: 65, labelY: 200,
    reg: 'Max 950mm wide. DRS flap reduces drag. 2026: replaced by Active Rear Wing — opens automatically above 290 km/h. All cars benefit equally, unlike DRS which required a 1-second gap to activate.',
  },
]

function InteractiveCar({ color = '#E8002D' }: { color?: string }) {
  const [active, setActive] = useState<string | null>(null)
  // Deduplicate active zone (left/right versions point to same data)
  const activeZone = CAR_ZONES_TOPDOWN.find(z => z.id === active)
    ?? CAR_ZONES_TOPDOWN.find(z => active?.startsWith(z.id.replace('-r', '')))

  // Get unique zones for the info panel (deduplicate left/right)
  const uniqueId = active?.endsWith('-r') ? active.slice(0, -2) : active
  const displayZone = CAR_ZONES_TOPDOWN.find(z => z.id === uniqueId) ?? activeZone

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
      {/* Top-down SVG */}
      <div>
        <div style={{
          fontSize: 8, fontFamily: 'var(--font-mono)',
          letterSpacing: '.16em', color: 'var(--t3)', marginBottom: 12,
        }}>
          TOP-DOWN VIEW · HOVER ANY ZONE TO INSPECT REGULATIONS
        </div>
        <div style={{
          background: 'rgba(0,0,0,.35)',
          borderRadius: 16,
          border: '1px solid var(--b1)',
          padding: 16,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Grid texture */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }} />

          <svg
            viewBox="0 0 760 400"
            width="100%"
            style={{ display: 'block' }}
          >
            {/* Car body base — horizontal ellipse */}
            <ellipse cx="380" cy="200" rx="310" ry="115" fill="#0d1117" stroke="rgba(255,255,255,.06)" strokeWidth="1" />

            {/* Direction arrow — pointing right (front of car) */}
            <path d="M 718,196 L 718,204 L 730,204 L 730,210 L 740,200 L 730,190 L 730,196 Z"
              fill="rgba(255,255,255,.15)" />
            <text x="726" y="225" textAnchor="middle" fill="rgba(255,255,255,.2)" fontSize="7" fontFamily="monospace">FRONT</text>

            {/* Center line */}
            <line x1="50" y1="200" x2="740" y2="200"
              stroke="rgba(255,255,255,.06)" strokeWidth="0.5" strokeDasharray="4 4" />

            {/* ── Zones ── */}
            {CAR_ZONES_TOPDOWN.map(zone => {
              const isSameGroup = active && (
                zone.id === active ||
                zone.id === active + '-r' ||
                active === zone.id + '-r' ||
                (active.endsWith('-r') && zone.id === active.slice(0, -2))
              )
              const zoneColor = zone.color
              return (
                <g key={zone.id}>
                  <path
                    d={zone.shape}
                    fill={isSameGroup ? `${zoneColor}30` : `${zoneColor}08`}
                    stroke={isSameGroup ? zoneColor : `${zoneColor}50`}
                    strokeWidth={isSameGroup ? 1.5 : 0.8}
                    strokeDasharray={isSameGroup ? 'none' : '2 3'}
                    style={{ cursor: 'pointer', transition: 'all .18s' }}
                    onMouseEnter={() => setActive(zone.id)}
                    onMouseLeave={() => setActive(null)}
                  />
                  {!zone.id.endsWith('-r') && (
                    <text
                      x={zone.labelX}
                      y={zone.labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={isSameGroup ? zoneColor : `${zoneColor}60`}
                      fontSize="9"
                      fontFamily="monospace"
                      style={{ pointerEvents: 'none', transition: 'fill .18s' }}
                    >
                      {zone.label.toUpperCase()}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Info panel */}
      <div style={{
        border: `1px solid ${displayZone ? displayZone.color + '40' : 'var(--b1)'}`,
        borderRadius: 16,
        background: displayZone
          ? `linear-gradient(145deg, ${displayZone.color}08, rgba(0,0,0,.3))`
          : 'rgba(0,0,0,.2)',
        padding: '20px',
        minHeight: 260,
        transition: 'all .3s ease',
        display: 'flex', flexDirection: 'column',
        justifyContent: displayZone ? 'flex-start' : 'center',
        position: 'sticky', top: 'calc(var(--header-h) + 20px)',
      }}>
        {displayZone ? (
          <motion.div
            key={displayZone.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Color accent */}
            <div style={{
              width: 32, height: 3, borderRadius: 2,
              background: displayZone.color, marginBottom: 14,
            }} />
            <div style={{
              fontSize: 8, fontFamily: 'var(--font-mono)',
              letterSpacing: '.18em', color: 'var(--t3)', marginBottom: 6,
            }}>
              TECHNICAL REGULATIONS
            </div>
            <div style={{
              fontFamily: 'var(--font-bebas)', fontSize: 22,
              color: displayZone.color, letterSpacing: '.05em', marginBottom: 14,
            }}>
              {displayZone.label.toUpperCase()}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--t2)',
              lineHeight: 1.75,
            }}>
              {displayZone.reg}
            </div>
          </motion.div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <svg viewBox="0 0 60 80" width="40" style={{ opacity: 0.15, display: 'block', margin: '0 auto 12px' }}>
              <ellipse cx="30" cy="40" rx="18" ry="36" fill="none" stroke="white" strokeWidth="1.5" />
              <ellipse cx="30" cy="15" rx="14" ry="8" fill="none" stroke="white" strokeWidth="1" />
              <ellipse cx="30" cy="65" rx="16" ry="9" fill="none" stroke="white" strokeWidth="1" />
            </svg>
            <div style={{
              fontSize: 9, fontFamily: 'var(--font-mono)',
              letterSpacing: '.14em', color: 'var(--t3)',
            }}>
              HOVER A ZONE TO INSPECT
            </div>
            <div style={{
              fontSize: 10, color: 'var(--t3)', marginTop: 8,
              lineHeight: 1.6,
            }}>
              {CAR_ZONES_TOPDOWN.filter(z => !z.id.endsWith('-r')).length} zones · click to explore regulations
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
      <div style={{ width: 32, height: 1, background: 'var(--red)' }} />
      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.24em', color: 'var(--t3)', textTransform: 'uppercase' }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
    </div>
  )
}

function WeekendCalendar({ schedule }: { schedule: typeof RACE_WEEKEND }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${schedule.length}, 1fr)`, border: '1px solid var(--b1)', borderRadius: 12, overflow: 'hidden' }}>
      {schedule.map((day, di) => (
        <div key={`hdr-${di}`} style={{
          padding: '10px 14px', background: 'rgba(255,255,255,.03)',
          borderRight: di < schedule.length - 1 ? '1px solid var(--b1)' : 'none',
          borderBottom: '1px solid var(--b1)',
          display: 'flex', alignItems: 'baseline', gap: 8,
        }}>
          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 22, color: 'var(--t1)', letterSpacing: '.04em' }}>{day.day}</span>
          <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--t3)', letterSpacing: '.1em' }}>
            {['DAY 1', 'DAY 2', 'DAY 3', 'DAY 4'][di] ?? ''}
          </span>
        </div>
      ))}
      {schedule.map((day, di) => (
        <DayColumn key={`col-${di}`} day={day} di={di} total={schedule.length} />
      ))}
    </div>
  )
}

function DayColumn({ day, di, total }: { day: { day: string; sessions: { name: string; type: string; desc: string }[] }; di: number; total: number }) {
  const [activeSession, setActiveSession] = useState<number | null>(null)
  return (
    <div style={{ borderRight: di < total - 1 ? '1px solid var(--b1)' : 'none', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 160, background: 'rgba(0,0,0,.15)' }}>
      {day.sessions.map((session, si) => {
        const c = SESSION_COLORS[session.type] ?? '#888'
        const isOpen = activeSession === si
        return (
          <div key={si} onClick={() => setActiveSession(isOpen ? null : si)} style={{ borderRadius: 8, border: `1px solid ${isOpen ? c + '50' : c + '25'}`, background: isOpen ? `${c}12` : `${c}08`, cursor: 'pointer', transition: 'all .18s' }}>
            <div style={{ borderLeft: `3px solid ${c}`, padding: '8px 10px' }}>
              <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 13, color: c, letterSpacing: '.06em', lineHeight: 1 }}>{session.name}</div>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 10, color: 'var(--t2)', lineHeight: 1.55, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${c}20` }}>{session.desc}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GlossaryTerm({ term, def, detail, color }: { term: string; def: string; detail: string; color: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div onClick={() => setOpen(o => !o)} style={{ borderBottom: '1px solid rgba(255,255,255,.05)', padding: '10px 0', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color, letterSpacing: '.08em', minWidth: 140, flexShrink: 0, fontWeight: 700 }}>{term}</span>
        <span style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.55, flex: 1 }}>{def}</span>
        <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0, marginLeft: 8, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>›</span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
            <div style={{ marginTop: 8, paddingLeft: 152, fontSize: 10, color: 'var(--t3)', lineHeight: 1.65, fontStyle: 'italic' }}>{detail}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ChangeCard({ change, index }: { change: typeof CHANGES_2026[0]; index: number }) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
    >
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          border: `1px solid ${open ? change.color + '50' : 'var(--b1)'}`,
          borderRadius: 16,
          background: open
            ? `linear-gradient(135deg, ${change.color}10, rgba(0,0,0,.3))`
            : 'rgba(0,0,0,.2)',
          padding: '18px 20px',
          cursor: 'pointer',
          transition: 'all .25s ease',
          position: 'relative',
        }}
      >
        {/* Top accent */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 2, background: change.color,
          opacity: open ? 0.8 : 0.3,
          transition: 'opacity .25s',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ fontSize: 24, flexShrink: 0 }}>{change.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 6,
            }}>
              <div>
                <div style={{
                  fontSize: 8, fontFamily: 'var(--font-mono)',
                  letterSpacing: '.16em', color: change.color,
                  marginBottom: 3,
                }}>
                  {change.category}
                </div>
                <div style={{
                  fontFamily: 'var(--font-bebas)', fontSize: 17,
                  color: 'var(--t1)', letterSpacing: '.04em',
                }}>
                  {change.title}
                </div>
              </div>
              <span style={{
                fontSize: 12, color: 'var(--t3)',
                transform: open ? 'rotate(90deg)' : 'none',
                transition: 'transform .2s',
              }}>›</span>
            </div>

            {/* Before / After */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 8, marginTop: 10,
            }}>
              <div style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.06)',
              }}>
                <div style={{ fontSize: 7, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 3 }}>BEFORE</div>
                <div style={{ fontSize: 10, color: 'var(--t2)', lineHeight: 1.4 }}>{change.before}</div>
              </div>
              <div style={{
                padding: '8px 10px', borderRadius: 8,
                background: `${change.color}10`,
                border: `1px solid ${change.color}30`,
              }}>
                <div style={{ fontSize: 7, letterSpacing: '.14em', color: change.color, marginBottom: 3 }}>2026</div>
                <div style={{ fontSize: 10, color: 'var(--t1)', lineHeight: 1.4 }}>{change.after}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                marginTop: 14, paddingTop: 14,
                borderTop: `1px solid ${change.color}25`,
                fontSize: 12, color: 'var(--t2)', lineHeight: 1.7,
              }}>
                {change.detail}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GuidePage() {
  const [weekendType, setWeekendType] = useState<'standard' | 'sprint'>('standard')
  const [glossarySearch, setGlossarySearch] = useState('')
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0])
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -60])

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BgCanvas />
      </div>
      {/* Red ambient wash */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(232,0,45,.1), transparent 65%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
        <Header />

        <div ref={heroRef} style={{ position: 'relative', overflow: 'hidden' }}>
          <motion.div
            style={{ opacity: heroOpacity, y: heroY }}
          >
            <div style={{
              maxWidth: 1100, margin: '0 auto',
              padding: 'calc(var(--header-h) + 20px) 24px 48px',
              textAlign: 'center',
            }}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  border: '1px solid var(--red)',
                  padding: '4px 12px', borderRadius: 4, marginBottom: 20,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }} />
                  <span style={{
                    fontSize: 8, fontFamily: 'var(--font-mono)',
                    letterSpacing: '.22em', color: 'var(--red)',
                  }}>
                    FIA TECHNICAL REGULATIONS · 2026 SEASON
                  </span>
                </div>

                <h1 style={{
                  fontFamily: 'var(--font-bebas)',
                  fontSize: 'clamp(40px, 7vw, 100px)',
                  lineHeight: 0.9,
                  letterSpacing: '.02em',
                  margin: '0 0 20px',
                }}>
                  THE F1 FIELD <span style={{ color: 'var(--red)' }}>MANUAL</span>
                </h1>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[
                    { href: '#basics', label: 'The Basics', num: '01' },
                    { href: '#weekend', label: 'Race Weekend', num: '02' },
                    { href: '#car', label: 'The Car', num: '03' },
                    { href: '#2026', label: '2026 Changes', num: '04' },
                    { href: '#glossary', label: 'Glossary', num: '05' },
                  ].map(l => (
                    <a
                      key={l.href}
                      href={l.href}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '7px 16px', borderRadius: 6,
                        border: '1px solid var(--b1)',
                        background: 'rgba(255,255,255,.02)',
                        fontSize: 10, fontFamily: 'var(--font-mono)',
                        letterSpacing: '.1em', color: 'var(--t2)',
                        textDecoration: 'none', transition: 'all .16s ease',
                      }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.borderColor = 'rgba(232,0,45,.4)'; el.style.color = 'var(--t1)'; el.style.background = 'rgba(232,0,45,.05)' }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.borderColor = 'var(--b1)'; el.style.color = 'var(--t2)'; el.style.background = 'rgba(255,255,255,.02)' }}
                    >
                      <span style={{ color: 'var(--red)', fontSize: 8 }}>{l.num}</span>
                      {l.label}
                    </a>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px', display: 'grid', gap: 80 }}>

          {/* ══════════ BASICS ══════════ */}
          <section id="basics">
            <SectionLabel>01 · The Basics</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {BEGINNER_CARDS.map((card, i) => (
                <motion.div
                  key={card.number}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  whileHover={{ y: -4 }}
                >
                  <div style={{
                    border: '1px solid var(--b1)',
                    borderRadius: 18,
                    padding: '22px',
                    background: 'rgba(0,0,0,.24)',
                    height: '100%',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Number watermark */}
                    <div style={{
                      position: 'absolute', top: -10, right: 10,
                      fontFamily: 'var(--font-bebas)', fontSize: 80,
                      color: card.accent, opacity: 0.06,
                      lineHeight: 1, pointerEvents: 'none',
                      userSelect: 'none',
                    }}>
                      {card.number}
                    </div>
                    {/* Accent bar */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      height: 2, background: card.accent, opacity: 0.6,
                    }} />

                    <div style={{ fontSize: 24, marginBottom: 14 }}>{card.icon}</div>
                    <div style={{
                      fontFamily: 'var(--font-bebas)', fontSize: 20,
                      color: 'var(--t1)', letterSpacing: '.04em',
                      marginBottom: 10,
                    }}>
                      {card.title.toUpperCase()}
                    </div>
                    <div style={{
                      fontSize: 12, color: 'var(--t2)', lineHeight: 1.7,
                    }}>
                      {card.body}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── Pull quote 1 ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={{
              padding: '40px 0',
              borderTop: '1px solid var(--b1)',
              borderBottom: '1px solid var(--b1)',
              position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: 3, background: 'var(--red)',
            }} />
            <blockquote style={{
              margin: 0, paddingLeft: 28,
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(24px, 3.5vw, 44px)',
              lineHeight: 1.2, letterSpacing: '.02em',
              color: 'var(--t1)',
            }}>
              "An F1 car generates enough downforce to drive upside down at 150mph. It corners at forces that would cause most people to black out."
            </blockquote>
            <div style={{
              paddingLeft: 28, marginTop: 14,
              fontSize: 9, fontFamily: 'var(--font-mono)',
              letterSpacing: '.16em', color: 'var(--t3)',
            }}>
              FIA TECHNICAL BRIEFING · 2026 REGULATIONS
            </div>
          </motion.div>

          {/* ══════════ RACE WEEKEND ══════════ */}
          <section id="weekend">
            <SectionLabel>02 · Race Weekend Format</SectionLabel>

            <div style={{ display: 'flex', gap: 0, marginBottom: 24, border: '1px solid var(--b1)', borderRadius: 8, width: 'fit-content', overflow: 'hidden' }}>
              {[{ key: 'standard', label: 'Standard Weekend' }, { key: 'sprint', label: 'Sprint Weekend' }].map(opt => (
                <button key={opt.key} onClick={() => setWeekendType(opt.key as any)} style={{
                  padding: '8px 20px', background: weekendType === opt.key ? 'rgba(232,0,45,.12)' : 'transparent',
                  border: 'none', borderRight: opt.key === 'standard' ? '1px solid var(--b1)' : 'none',
                  color: weekendType === opt.key ? 'var(--red)' : 'var(--t3)',
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.14em', cursor: 'pointer', transition: 'all .18s',
                }}>{opt.label.toUpperCase()}</button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={weekendType} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <WeekendCalendar schedule={weekendType === 'sprint' ? SPRINT_WEEKEND : RACE_WEEKEND} />
              </motion.div>
            </AnimatePresence>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
              <div style={{ border: '1px solid var(--b1)', borderRadius: 12, padding: '16px 18px', background: 'rgba(0,0,0,.2)' }}>
                <div style={{ fontSize: 8, letterSpacing: '.18em', color: 'var(--t3)', marginBottom: 12 }}>SESSION TYPES</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {[
                    { type: 'practice', label: 'Practice', desc: 'Data gathering, setup work' },
                    { type: 'qualifying', label: 'Qualifying', desc: 'Sets the grid order' },
                    { type: 'sprint', label: 'Sprint', desc: '100km points race (sprint weekends only)' },
                    { type: 'race', label: 'Race', desc: '305km+ championship points' },
                  ].map(s => (
                    <div key={s.type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 3, height: 28, borderRadius: 2, background: SESSION_COLORS[s.type], flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 12, color: SESSION_COLORS[s.type], letterSpacing: '.06em' }}>{s.label.toUpperCase()}</div>
                        <div style={{ fontSize: 10, color: 'var(--t3)' }}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ border: '1px solid rgba(245,158,11,.25)', borderRadius: 12, padding: '16px 18px', background: 'rgba(245,158,11,.04)' }}>
                <div style={{ fontSize: 8, letterSpacing: '.16em', color: '#F59E0B', marginBottom: 12 }}>QUALIFYING FORMAT</div>
                {[
                  { phase: 'Q1', dur: '18 min', cut: 'P16–P20 eliminated (5 cars)' },
                  { phase: 'Q2', dur: '15 min', cut: 'P11–P15 eliminated (5 cars)' },
                  { phase: 'Q3', dur: '12 min', cut: 'Top 10 fight for pole' },
                ].map((q, i) => (
                  <div key={q.phase} style={{ display: 'grid', gridTemplateColumns: '36px 52px 1fr', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                    <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 14, color: '#F59E0B' }}>{q.phase}</span>
                    <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{q.dur}</span>
                    <span style={{ fontSize: 10, color: 'var(--t2)' }}>{q.cut}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ══════════ THE CAR ══════════ */}
          <section id="car">
            <SectionLabel>03 · Anatomy of an F1 Car</SectionLabel>
            <p style={{
              fontSize: 13, color: 'var(--t2)', lineHeight: 1.7,
              marginBottom: 28,
            }}>
              Every component on an F1 car is governed by the FIA Technical Regulations — a 400+ page document defining permitted dimensions, materials, and constructions. Hover the zones below to explore what the rules say about each part.
            </p>
            <InteractiveCar color="#E8002D" />
          </section>

          {/* ── Pull quote 2 ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 48, alignItems: 'center',
              padding: '32px 0',
              borderTop: '1px solid var(--b1)',
              borderBottom: '1px solid var(--b1)',
            }}
          >
            <blockquote style={{
              margin: 0,
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(22px, 3vw, 38px)',
              lineHeight: 1.25, letterSpacing: '.02em',
              color: 'var(--t1)',
              borderLeft: '3px solid #FF8000',
              paddingLeft: 24,
            }}>
              "The 2026 power unit is the most radical technical change since turbo engines returned in 2014. 350kW from the electric motor alone."
            </blockquote>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { value: '850', unit: 'bhp', label: 'Total Power Output' },
                { value: '50/50', unit: '', label: 'ICE to ERS Split' },
                { value: '30kg', unit: 'lighter', label: 'vs 2025 Car' },
                { value: '11', unit: 'teams', label: 'On the Grid' },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '14px 16px',
                  border: '1px solid var(--b1)',
                  borderRadius: 12,
                  background: 'rgba(0,0,0,.2)',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-bebas)',
                    fontSize: 28, lineHeight: 1,
                    color: '#FF8000',
                  }}>
                    {s.value}
                    {s.unit && <span style={{ fontSize: 14, marginLeft: 4, color: 'var(--t2)' }}>{s.unit}</span>}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4, letterSpacing: '.1em' }}>
                    {s.label.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ══════════ 2026 CHANGES ══════════ */}
          <section id="2026">
            <SectionLabel>04 · 2026 Rule Changes</SectionLabel>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 14, marginBottom: 14,
            }}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                style={{
                  border: '1px solid rgba(232,0,45,.25)',
                  borderRadius: 16, padding: '20px 22px',
                  background: 'rgba(232,0,45,.04)',
                  gridColumn: '1 / -1',
                }}
              >
                <div style={{
                  fontSize: 8, letterSpacing: '.18em',
                  color: 'var(--red)', marginBottom: 10,
                }}>
                  REGULATION CYCLE
                </div>
                <div style={{
                  fontFamily: 'var(--font-bebas)', fontSize: 18,
                  color: 'var(--t1)', letterSpacing: '.04em',
                  marginBottom: 10,
                }}>
                  2026 IS THE BIGGEST TECHNICAL RESET SINCE 2022
                </div>
                <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7, margin: 0 }}>
                  The 2022 regulations introduced ground-effect aerodynamics to improve racing. 2026 goes further — new power units, active aerodynamics, lighter cars, and a new manufacturer. It's the most comprehensive regulation change in a decade, designed to close the performance gap between teams and reduce costs simultaneously.
                </p>
              </motion.div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {CHANGES_2026.map((change, i) => (
                <ChangeCard key={change.category} change={change} index={i} />
              ))}
            </div>
          </section>

          {/* ══════════ GLOSSARY ══════════ */}
          <section id="glossary">
            <SectionLabel>05 · Glossary</SectionLabel>

            <div style={{ position: 'relative', marginBottom: 24 }}>
              <input type="text" value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)} placeholder="Search terms..."
                style={{ width: '100%', padding: '11px 16px 11px 38px', background: 'rgba(0,0,0,.3)', border: '1px solid var(--b1)', borderRadius: 8, color: 'var(--t1)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
              />
              <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.35 }}>🔍</span>
            </div>

            {glossarySearch ? (
              <div style={{ display: 'grid', gap: 2 }}>
                {GLOSSARY_CATEGORIES.flatMap(cat =>
                  cat.terms.filter(t => t.term.toLowerCase().includes(glossarySearch.toLowerCase()) || t.def.toLowerCase().includes(glossarySearch.toLowerCase()))
                    .map(t => ({ ...t, catColor: cat.color }))
                ).map(item => (
                  <GlossaryTerm key={item.term} term={item.term} def={item.def} detail={item.detail} color={item.catColor} />
                ))}
                {GLOSSARY_CATEGORIES.flatMap(c => c.terms).filter(t => t.term.toLowerCase().includes(glossarySearch.toLowerCase()) || t.def.toLowerCase().includes(glossarySearch.toLowerCase())).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px', color: 'var(--t3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>No terms matching "{glossarySearch}"</div>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 32 }}>
                {GLOSSARY_CATEGORIES.map(cat => (
                  <div key={cat.category}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${cat.color}30` }}>
                      <div style={{ width: 28, height: 2, background: cat.color, borderRadius: 2 }} />
                      <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 18, color: cat.color, letterSpacing: '.06em' }}>{cat.category.toUpperCase()}</span>
                      <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--t3)', letterSpacing: '.1em' }}>{cat.terms.length} TERMS</span>
                    </div>
                    <div style={{ display: 'grid', gap: 1 }}>
                      {cat.terms.map(t => (
                        <GlossaryTerm key={t.term} term={t.term} def={t.def} detail={t.detail} color={cat.color} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        <Footer />
      </div>
    </>
  )
}