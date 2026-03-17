'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import Header from '@/components/Header'
import Ticker from '@/components/Ticker'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'
import {
  type TimeseriesPoint, type SentimentProfile, type ControversyProfile,
  type TrendSignal, type Anomaly, type PredictiveSignal, type EntityCorrelation,
  type StoryArc, type ComparisonResult, type ComparisonDimension, type StoryBeat,
  computeSentimentProfile, computeControversyProfile, computeTrendSignal,
  detectAnomalies, computePredictiveSignal, computeCorrelationMatrix,
  computeStoryArc, compareEntities,
} from '@/lib/drivers-analytics'

// ── Types ─────────────────────────────────────────────────────────────────────

type MainTab    = 'stories' | 'drivers' | 'teams'
type WindowMode = 'race' | '14' | '30'
type IntelTab   = 'driver' | 'team'

type Story = {
  story_id?: string | number; story_title?: string; latest_source?: string
  latest_url?: string; latest_event_ts?: string; topic_cluster?: string
  best_priority_tier?: string; is_breaking?: boolean; momentum_score?: number
  events_count?: number; sources_count?: number; driver?: string | null; heat_index?: number
  image_url?: string | null
}
type SummaryEntity = {
  driverName: string; mentions: number; sentimentAvg: number; sentimentDelta: number
  sentimentLabel: string; positiveCount?: number; negativeCount?: number; neutralCount?: number
  topCluster?: string | null; lastDate?: string | null
}
type ControversyRaw = {
  entityName: string; score: number; label?: string; trend?: string; delta?: number
  components?: { sentiment?: number; fia?: number; spike?: number; media?: number }
}
type EnrichedEntity = SummaryEntity & {
  controversyScore: number; influenceScore: number; narrativeGroup: string
  pulse: 'RISING' | 'FALLING' | 'CONTROVERSIAL' | 'MOST DISCUSSED' | 'STABLE'
}

// ── Palette ───────────────────────────────────────────────────────────────────

const EC: Record<string, string> = {
  ANTONELLI: '#27F4D2', RUSSELL: '#27F4D2', LECLERC: '#E8002D', HAMILTON: '#E8002D',
  VERSTAPPEN: '#3671C6', HADJAR: '#3671C6', NORRIS: '#FF8000', PIASTRI: '#FF8000',
  ALONSO: '#229971', STROLL: '#229971', GASLY: '#FF87BC', DOOHAN: '#FF87BC',
  ALBON: '#64C4FF', SAINZ: '#64C4FF', TSUNODA: '#6692FF', LAWSON: '#6692FF',
  HULKENBERG: '#52E252', BORTOLETO: '#52E252', BEARMAN: '#B6BABD', OCON: '#B6BABD',
  'KIMI ANTONELLI': '#27F4D2', 'ISACK HADJAR': '#3671C6', 'JACK DOOHAN': '#FF87BC', 'GABRIEL BORTOLETO': '#52E252',
  'RED BULL': '#3671C6', 'RED BULL RACING': '#3671C6', FERRARI: '#E8002D', MERCEDES: '#27F4D2',
  MCLAREN: '#FF8000', 'ASTON MARTIN': '#229971', ALPINE: '#FF87BC', WILLIAMS: '#64C4FF',
  HAAS: '#B6BABD', 'KICK SAUBER': '#52E252', 'RACING BULLS': '#6692FF', SAUBER: '#52E252',
}
const col = (n: string) => EC[n?.toUpperCase?.()] || '#8b93a7'

const PHASE_C: Record<string, string> = {
  ignition: '#f59e0b', amplification: '#ef4444', peak: '#dc2626',
  resolution: '#60a5fa', dormant: '#6b7280', resurgence: '#a855f7',
}
const SIG_C: Record<string, { c: string; label: string }> = {
  pre_breakout:    { c: '#22c55e', label: 'PRE-BREAKOUT' },
  sentiment_shift: { c: '#f59e0b', label: 'SENTIMENT SHIFT' },
  cooling:         { c: '#60a5fa', label: 'COOLING' },
  recovery:        { c: '#10b981', label: 'RECOVERY' },
  watch:           { c: '#a855f7', label: 'WATCH' },
  stable:          { c: '#6b7280', label: 'STABLE' },
}
const TIER_C:    Record<string, string> = { low: '#6b7280', moderate: '#60a5fa', high: '#f59e0b', critical: '#ef4444' }
const TRAJ_C:    Record<string, string> = { escalating: '#ef4444', 'de-escalating': '#22c55e', sustained: '#f59e0b', new: '#a855f7', resolved: '#6b7280' }
const SENT_ARC_C:Record<string, string> = { improving: '#22c55e', worsening: '#ef4444', volatile: '#f59e0b', flat: '#6b7280' }

// ── Calendar ──────────────────────────────────────────────────────────────────

type Race = { round: number; name: string; shortName: string; city: string; country: string; flag: string; fp1: string; race: string; sprint: boolean }

const CALENDAR_2026: Race[] = [
  { round:1,  name:'Australian Grand Prix',   shortName:'Australia',    city:'Melbourne',   country:'Australia',    flag:'🇦🇺', fp1:'2026-03-06', race:'2026-03-08', sprint:false },
  { round:2,  name:'Chinese Grand Prix',       shortName:'China',        city:'Shanghai',    country:'China',        flag:'🇨🇳', fp1:'2026-03-13', race:'2026-03-15', sprint:true  },
  { round:3,  name:'Japanese Grand Prix',      shortName:'Japan',        city:'Suzuka',      country:'Japan',        flag:'🇯🇵', fp1:'2026-03-27', race:'2026-03-29', sprint:false },
  { round:4,  name:'Bahrain Grand Prix',       shortName:'Bahrain',      city:'Sakhir',      country:'Bahrain',      flag:'🇧🇭', fp1:'2026-04-10', race:'2026-04-12', sprint:false },
  { round:5,  name:'Saudi Arabian Grand Prix', shortName:'Saudi Arabia', city:'Jeddah',      country:'Saudi Arabia', flag:'🇸🇦', fp1:'2026-04-17', race:'2026-04-19', sprint:false },
  { round:6,  name:'Miami Grand Prix',         shortName:'Miami',        city:'Miami',       country:'USA',          flag:'🇺🇸', fp1:'2026-05-01', race:'2026-05-03', sprint:true  },
  { round:7,  name:'Canadian Grand Prix',      shortName:'Canada',       city:'Montreal',    country:'Canada',       flag:'🇨🇦', fp1:'2026-05-22', race:'2026-05-24', sprint:true  },
  { round:8,  name:'Monaco Grand Prix',        shortName:'Monaco',       city:'Monte Carlo', country:'Monaco',       flag:'🇲🇨', fp1:'2026-06-05', race:'2026-06-07', sprint:false },
  { round:9,  name:'Spanish Grand Prix',       shortName:'Spain',        city:'Barcelona',   country:'Spain',        flag:'🇪🇸', fp1:'2026-06-12', race:'2026-06-14', sprint:false },
  { round:10, name:'Austrian Grand Prix',      shortName:'Austria',      city:'Spielberg',   country:'Austria',      flag:'🇦🇹', fp1:'2026-06-26', race:'2026-06-28', sprint:false },
  { round:11, name:'British Grand Prix',       shortName:'Great Britain',city:'Silverstone', country:'UK',           flag:'🇬🇧', fp1:'2026-07-03', race:'2026-07-05', sprint:true  },
  { round:12, name:'Belgian Grand Prix',       shortName:'Belgium',      city:'Spa',         country:'Belgium',      flag:'🇧🇪', fp1:'2026-07-17', race:'2026-07-19', sprint:false },
  { round:13, name:'Hungarian Grand Prix',     shortName:'Hungary',      city:'Budapest',    country:'Hungary',      flag:'🇭🇺', fp1:'2026-07-24', race:'2026-07-26', sprint:false },
  { round:14, name:'Dutch Grand Prix',         shortName:'Netherlands',  city:'Zandvoort',   country:'Netherlands',  flag:'🇳🇱', fp1:'2026-08-21', race:'2026-08-23', sprint:true  },
  { round:15, name:'Italian Grand Prix',       shortName:'Italy',        city:'Monza',       country:'Italy',        flag:'🇮🇹', fp1:'2026-09-04', race:'2026-09-06', sprint:false },
  { round:16, name:'Madrid Grand Prix',        shortName:'Madrid',       city:'Madrid',      country:'Spain',        flag:'🇪🇸', fp1:'2026-09-11', race:'2026-09-13', sprint:false },
  { round:17, name:'Azerbaijan Grand Prix',    shortName:'Azerbaijan',   city:'Baku',        country:'Azerbaijan',   flag:'🇦🇿', fp1:'2026-09-24', race:'2026-09-26', sprint:false },
  { round:18, name:'Singapore Grand Prix',     shortName:'Singapore',    city:'Singapore',   country:'Singapore',    flag:'🇸🇬', fp1:'2026-10-09', race:'2026-10-11', sprint:true  },
  { round:19, name:'United States Grand Prix', shortName:'USA',          city:'Austin',      country:'USA',          flag:'🇺🇸', fp1:'2026-10-23', race:'2026-10-25', sprint:false },
  { round:20, name:'Mexico City Grand Prix',   shortName:'Mexico',       city:'Mexico City', country:'Mexico',       flag:'🇲🇽', fp1:'2026-10-30', race:'2026-11-01', sprint:false },
  { round:21, name:'São Paulo Grand Prix',     shortName:'Brazil',       city:'São Paulo',   country:'Brazil',       flag:'🇧🇷', fp1:'2026-11-06', race:'2026-11-08', sprint:false },
  { round:22, name:'Las Vegas Grand Prix',     shortName:'Las Vegas',    city:'Las Vegas',   country:'USA',          flag:'🇺🇸', fp1:'2026-11-19', race:'2026-11-21', sprint:false },
  { round:23, name:'Qatar Grand Prix',         shortName:'Qatar',        city:'Lusail',      country:'Qatar',        flag:'🇶🇦', fp1:'2026-11-27', race:'2026-11-29', sprint:false },
  { round:24, name:'Abu Dhabi Grand Prix',     shortName:'Abu Dhabi',    city:'Abu Dhabi',   country:'UAE',          flag:'🇦🇪', fp1:'2026-12-04', race:'2026-12-06', sprint:false },
]

function getCurrentRace() {
  const today = new Date(); today.setHours(0,0,0,0)
  for (const r of CALENDAR_2026) {
    const fp1 = new Date(r.fp1); fp1.setHours(0,0,0,0)
    const rd  = new Date(r.race); rd.setHours(23,59,59,0)
    if (today >= fp1 && today <= rd) return { race: r, live: true, daysUntil: 0 }
  }
  for (const r of CALENDAR_2026) {
    const fp1 = new Date(r.fp1); fp1.setHours(0,0,0,0)
    if (fp1 > today) {
      const diff = Math.ceil((fp1.getTime() - today.getTime()) / 86400000)
      return { race: r, live: false, daysUntil: diff }
    }
  }
  return null
}

function raceWindowDays(race: Race) {
  const today = new Date(); today.setHours(0,0,0,0)
  const fp1   = new Date(race.fp1); fp1.setHours(0,0,0,0)
  return Math.max(Math.ceil((today.getTime() - fp1.getTime()) / 86400000) + 1, 4)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sign   = (v?: number) => { const n = +(v??0); return `${n>=0?'+':''}${n.toFixed(3)}` }
const safeNum = (v: unknown, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb }

function hr(hex: string, a: number) {
  if (!hex.startsWith('#')) return `rgba(255,255,255,${a})`
  let h = hex.replace('#','')
  if (h.length===3) h = h.split('').map(c=>c+c).join('')
  const n = parseInt(h,16)
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`
}
function fmtDate(d: string) { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) }
function timeAgo(value: string) {
  const d = new Date(value); if (isNaN(d.getTime())) return value
  const m = Math.floor((Date.now()-d.getTime())/60000)
  if (m<1) return 'just now'; if (m<60) return `${m}m ago`
  const h = Math.floor(m/60); if (h<24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}
function nscore(vals: number[], v: number) {
  const mn = Math.min(...vals,0), mx = Math.max(...vals,1)
  return mx===mn ? 50 : ((v-mn)/(mx-mn))*100
}
function classifyNarrative(c?: string|null) {
  const s = (c||'').toLowerCase()
  if (s.includes('driver')) return 'DRIVER'
  if (s.includes('team'))   return 'TEAM'
  if (s.includes('fia')||s.includes('regulation')) return 'REGULATION'
  if (s.includes('technical')||s.includes('engine')) return 'TECH'
  if (s.includes('race')||s.includes('pace')) return 'PACE'
  return 'GENERAL'
}
function inferNarrative(title: string) {
  const t = title.toLowerCase()
  if (t.includes('pole')||t.includes('qualifying'))           return 'Qualifying'
  if (t.includes('win')||t.includes('victory')||t.includes('podium')) return 'Race Result'
  if (t.includes('championship')||t.includes('title')||t.includes('rival')) return 'Championship'
  if (t.includes('upgrade')||t.includes('car')||t.includes('engine')||t.includes('technical')) return 'Technical'
  if (t.includes('contract')||t.includes('team')||t.includes('seat')) return 'Team News'
  return 'Coverage'
}
function getSourceType(source?: string) {
  const s = String(source??'').toLowerCase()
  if (s.includes('reddit')) return 'reddit'
  if (s.includes('fia')||s.includes('official')||s.includes('formula1.com')) return 'official'
  return 'news'
}
// Map source name → domain for favicon
const SOURCE_DOMAIN: Record<string, string> = {
  'sky sports': 'skysports.com', 'bbc sport': 'bbc.co.uk', 'bbc': 'bbc.co.uk',
  'reddit': 'reddit.com', 'the race': 'the-race.com', 'racefans': 'racefans.net',
  'f1 official': 'formula1.com', 'formula1.com': 'formula1.com', 'autosport': 'autosport.com',
  'wtf1': 'wtf1.com', 'motorsport': 'motorsport.com', 'espn': 'espn.com', 'espn-f1': 'espn.com',
  'gpfans': 'gpfans.com', 'planetf1': 'planetf1.com', 'f1i': 'f1i.com',
  'crash.net': 'crash.net', 'grandprix247': 'grandprix247.com',
  'reuters': 'reuters.com', 'ap': 'apnews.com', 'guardian': 'theguardian.com',
}
function sourceFavicon(source?: string): string {
  if (!source) return ''
  const key = source.toLowerCase().replace(/[^a-z0-9\s.-]/g,'').trim()
  const domain = SOURCE_DOMAIN[key] ?? (key.includes('reddit') ? 'reddit.com' : key.includes('formula1') ? 'formula1.com' : key.replace(/\s+/g,'')+'.com')
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
}

function srcColor(src: string) {
  if (src==='reddit') return '#FF6314'
  if (src==='official') return '#27F4D2'
  return '#60a5fa'
}
function dedupeStories(stories: Story[]): Story[] {
  const seen = new Set<string>()
  return stories.filter(s => {
    const key = (s.story_title??'').toLowerCase().replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim().slice(0,60)
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

type StoryCluster = {
  label: string; stories: Story[]; avgMomentum: number
  drivers: string[]; srcCounts: Record<string,number>
}
function buildStoryClusters(stories: Story[], driverNames: string[]): StoryCluster[] {
  const map = new Map<string,Story[]>()
  for (const s of stories) {
    const label = inferNarrative(s.story_title??'')
    if (!map.has(label)) map.set(label,[])
    map.get(label)!.push(s)
  }
  return Array.from(map.entries()).map(([label, clStories]) => {
    const sorted = [...clStories].sort((a,b)=>safeNum(b.momentum_score)-safeNum(a.momentum_score))
    const avgMomentum = Math.round(clStories.reduce((s,st)=>s+safeNum(st.momentum_score),0)/clStories.length)
    const mentionedDrivers = driverNames.filter(name=>clStories.some(s=>s.story_title?.toUpperCase().includes(name.toUpperCase()))).slice(0,4)
    const srcCounts: Record<string,number> = {}
    for (const s of clStories) { const t=getSourceType(s.latest_source); srcCounts[t]=(srcCounts[t]??0)+1 }
    return { label, stories: sorted, avgMomentum, drivers: mentionedDrivers, srcCounts }
  }).sort((a,b)=>b.stories.length!==a.stories.length ? b.stories.length-a.stories.length : b.avgMomentum-a.avgMomentum)
}

function normSummary(r: any): SummaryEntity {
  return {
    driverName:     r?.driverName??r?.driver_name??r?.entityName??r?.entity_name??'UNKNOWN',
    mentions:       safeNum(r?.mentions??r?.mentionCount??r?.mention_count??0),
    sentimentAvg:   safeNum(r?.sentimentAvg??r?.sentiment_avg??0),
    sentimentDelta: safeNum(r?.sentimentDelta??r?.sentiment_delta??r?.sentimentTrend??0),
    sentimentLabel: r?.sentimentLabel??r?.sentiment_label??'neutral',
    positiveCount:  safeNum(r?.positiveCount??r?.positive_count??0),
    negativeCount:  safeNum(r?.negativeCount??r?.negative_count??0),
    neutralCount:   safeNum(r?.neutralCount??r?.neutral_count??0),
    topCluster:     r?.topCluster??r?.top_cluster??null,
    lastDate:       r?.lastDate??r?.last_mentioned??r?.date??null,
  }
}
function normTs(r: any): TimeseriesPoint {
  return {
    date:          r?.date??r?.signal_date??'',
    mentions:      safeNum(r?.mention_count??r?.mentions),
    sentimentAvg:  safeNum(r?.sentiment_avg??r?.sentimentAvg),
    positiveCount: safeNum(r?.positive_count??r?.positiveCount),
    negativeCount: safeNum(r?.negative_count??r?.negativeCount),
    neutralCount:  safeNum(r?.neutral_count??r?.neutralCount),
  }
}
function normCon(r: any): ControversyRaw {
  return {
    entityName: r?.entityName??r?.entity_name??r?.name??'UNKNOWN',
    score:  safeNum(r?.score??r?.controversyScore??0),
    label:  r?.label??r?.controversyLabel,
    trend:  r?.trend??r?.trendingDirection,
    delta:  safeNum(r?.delta??r?.scoreDelta),
    components: { sentiment:safeNum(r?.components?.sentiment??r?.sentimentScore), fia:safeNum(r?.components?.fia??r?.fiaScore), spike:safeNum(r?.components?.spike??r?.spikeScore), media:safeNum(r?.components?.media??r?.mediaScore) },
  }
}
function sparkPts(data: TimeseriesPoint[], key: 'sentimentAvg'|'mentions', W: number, H: number): string {
  if (data.length<2) return ''
  const vals = data.map(d=>d[key]), mn=Math.min(...vals), mx=Math.max(...vals), range=Math.max(mx-mn,.001)
  return data.map((d,i)=>{
    const x=(i/(data.length-1))*W
    const y=H-((d[key]-mn)/range)*(H*.85)-H*.075
    return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useEntityTs(tab: IntelTab, name: string|null, days=30) {
  const [data,setData] = useState<TimeseriesPoint[]>([])
  const [loading,setLoading] = useState(false)
  useEffect(() => {
    if (!name) { setData([]); return }
    let mounted=true; setLoading(true)
    fetch(`/api/intelligence/drivers?format=timeseries&type=${tab}&driver=${encodeURIComponent(name)}&days=${days}`)
      .then(r=>r.ok?r.json():null).then(d=>{ if(mounted) setData(d?.ok?(d.data??[]).map(normTs):[]) }).finally(()=>{ if(mounted) setLoading(false) })
    return ()=>{ mounted=false }
  },[tab,name,days])
  return {data,loading}
}
function useBatchTs(tab: IntelTab, entities: EnrichedEntity[], days=30) {
  const [map,setMap] = useState<Record<string,TimeseriesPoint[]>>({})
  const keyRef = useRef('')
  useEffect(() => {
    if (!entities.length) return
    const key = `${tab}:${entities.map(e=>e.driverName).join(',')}:${days}`
    if (key===keyRef.current) return
    keyRef.current=key; let mounted=true
    Promise.all(entities.map(e=>
      fetch(`/api/intelligence/drivers?format=timeseries&type=${tab}&driver=${encodeURIComponent(e.driverName)}&days=${days}`)
        .then(r=>r.ok?r.json():null).then(d=>[e.driverName,d?.ok?(d.data??[]).map(normTs):[]] as const)
    )).then(results=>{ if(mounted) setMap(Object.fromEntries(results)) })
    return ()=>{ mounted=false }
  },[tab,entities,days])
  return map
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Pill({ children, color, dim }: { children: ReactNode; color?: string; dim?: boolean }) {
  const c = color ?? 'rgba(255,255,255,.18)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 4,
      fontSize: 7, fontFamily: 'var(--font-mono)', letterSpacing: '.12em',
      color: dim ? 'rgba(255,255,255,.35)' : c,
      background: hr(c, dim ? .04 : .1),
      border: `1px solid ${hr(c, dim ? .1 : .22)}`,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

function Bdg({ c, children }: { c: string; children: ReactNode }) {
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',padding:'3px 8px',borderRadius:999,
      fontSize:8,letterSpacing:'.1em',border:'1px solid transparent',whiteSpace:'nowrap',
      background:hr(c,.13),color:c,borderColor:hr(c,.28),
    }}>{children}</span>
  )
}

function SectionHead({ label, count, accent }: { label: string; count?: number; accent?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
      <div style={{ width:3, height:16, borderRadius:2, background: accent ?? 'var(--red)', flexShrink:0 }} />
      <span style={{ fontSize:9, fontFamily:'var(--font-mono)', letterSpacing:'.2em', color:'rgba(255,255,255,.45)' }}>{label}</span>
      {count !== undefined && (
        <span style={{ fontSize:8, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,.25)',
          background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)',
          padding:'1px 7px', borderRadius:999 }}>{count}</span>
      )}
      <div style={{ flex:1, height:1, background:'linear-gradient(90deg,rgba(255,255,255,.07),transparent)' }} />
    </div>
  )
}

// ── Weekend banner ────────────────────────────────────────────────────────────

function WeekendBanner({ race, live, daysUntil }: { race: Race; live: boolean; daysUntil: number }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:14,
      padding:'12px 20px',
      border:`1px solid ${live ? 'rgba(225,6,0,.3)' : 'rgba(255,255,255,.07)'}`,
      borderRadius:12,
      background: live ? 'rgba(225,6,0,.05)' : 'rgba(255,255,255,.02)',
    }}>
      {live && (
        <motion.div animate={{opacity:[1,.3,1]}} transition={{duration:1.2,repeat:Infinity}}
          style={{width:7,height:7,borderRadius:'50%',background:'var(--red)',boxShadow:'0 0 8px var(--red)',flexShrink:0}} />
      )}
      <span style={{fontSize:22,lineHeight:1}}>{race.flag}</span>
      <div>
        <div style={{fontSize:7,fontFamily:'var(--font-mono)',letterSpacing:'.16em',color:'rgba(255,255,255,.3)',marginBottom:2}}>
          {live ? 'LIVE WEEKEND' : `NEXT RACE · ${daysUntil}d`} · R{race.round}{race.sprint&&' · SPRINT'}
        </div>
        <div style={{fontFamily:'var(--font-bebas)',fontSize:16,letterSpacing:'.06em',color:'#fff',lineHeight:1}}>
          {race.shortName} <span style={{color:'rgba(255,255,255,.3)',fontSize:12}}>{race.city} · {new Date(race.race).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
        </div>
      </div>
    </div>
  )
}

// ── Briefing cards ────────────────────────────────────────────────────────────

function BriefingCards({ briefing }: { briefing: any }) {
  const cards = [
    { label:'TOP STORY',        value: briefing.top_story_summary, accent:'#E10600' },
    { label:'DRIVER SPOTLIGHT', value: briefing.driver_spotlight,  accent:'#F59E0B' },
    { label:'WHAT TO WATCH',    value: briefing.what_to_watch,     accent:'#60a5fa' },
  ].filter(c => Boolean(c.value))

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
      {cards.map(card => (
        <div key={card.label} style={{
          borderRadius:14,
          border:`1px solid ${card.accent}22`,
          background: `linear-gradient(160deg, ${card.accent}08, rgba(0,0,0,.3))`,
          overflow:'hidden',
        }}>
          {/* Top accent stripe */}
          <div style={{ height:2, background:`linear-gradient(90deg,${card.accent},transparent)` }} />
          <div style={{ padding:'16px 18px' }}>
            <div style={{
              display:'inline-flex', alignItems:'center', gap:6,
              marginBottom:12,
            }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:card.accent }} />
              <span style={{ fontSize:7, fontFamily:'var(--font-mono)', letterSpacing:'.18em', color:card.accent }}>
                {card.label}
              </span>
            </div>
            <p style={{
              margin:0, fontSize:13, lineHeight:1.75,
              color:'rgba(255,255,255,.7)',
              fontFamily:'system-ui, -apple-system, sans-serif',
            }}>{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Breaking banner ───────────────────────────────────────────────────────────

function BreakingBanner({ stories }: { stories: Story[] }) {
  if (!stories.length) return null
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      padding:'10px 16px',
      border:'1px solid rgba(225,6,0,.25)', borderRadius:10,
      background:'rgba(225,6,0,.04)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <motion.div animate={{opacity:[1,.3,1]}} transition={{duration:1.2,repeat:Infinity}}
          style={{width:6,height:6,borderRadius:'50%',background:'var(--red)'}} />
        <span style={{ fontSize:8, fontFamily:'var(--font-mono)', letterSpacing:'.18em', color:'var(--red)' }}>
          BREAKING · {stories.length}
        </span>
      </div>
      {stories.slice(0,3).map((s,i) => (
        <span key={i} style={{ fontSize:10, color:'rgba(255,255,255,.7)' }}>
          {i>0 && <span style={{color:'rgba(255,255,255,.2)',marginRight:8}}>·</span>}
          {s.latest_url
            ? <a href={s.latest_url} target="_blank" rel="noopener noreferrer" style={{color:'#fff',textDecoration:'none'}}>{s.story_title}</a>
            : s.story_title}
        </span>
      ))}
    </div>
  )
}

// ── Story Carousel ────────────────────────────────────────────────────────────

function StoryCarousel({ stories, onDriverClick }: { stories: Story[]; onDriverClick: (n:string)=>void }) {
  const [active, setActive] = useState(0)
  const [dir, setDir]       = useState(1)
  if (!stories.length) return null
  const total = stories.length
  const go    = (i: number) => { setDir(i>active?1:-1); setActive(i) }
  const prev  = () => go((active-1+total)%total)
  const next  = () => go((active+1)%total)
  const story = stories[active]
  const c     = story.is_breaking ? 'var(--red)' : '#60a5fa'
  const srcT  = getSourceType(story.latest_source)
  const momentum = Math.min(100, safeNum(story.momentum_score))

  return (
    <div>
      <SectionHead label="FEATURED STORIES" count={total} />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:12, alignItems:'stretch' }}>
        {/* Main card */}
        <div style={{ position:'relative', minHeight:260 }}>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={active}
              custom={dir}
              initial={{ opacity:0, x: dir*40 }}
              animate={{ opacity:1, x:0 }}
              exit={{ opacity:0, x: dir*-40 }}
              transition={{ duration:0.32, ease:[0.22,1,0.36,1] }}
              style={{
                position:'absolute', inset:0,
                border:`1px solid ${story.is_breaking?'rgba(225,6,0,.3)':'rgba(255,255,255,.1)'}`,
                borderRadius:16,
                background: story.is_breaking
                  ? 'linear-gradient(160deg,rgba(225,6,0,.07),rgba(0,0,0,.5))'
                  : 'linear-gradient(160deg,rgba(255,255,255,.04),rgba(0,0,0,.45))',
                overflow:'hidden',
                cursor: story.latest_url ? 'pointer' : 'default',
              }}
              onClick={() => story.latest_url && window.open(story.latest_url,'_blank')}
            >
              <div style={{ height:2, background:`linear-gradient(90deg,${c},transparent)` }} />
              <div style={{ padding:'22px 26px', height:'calc(100% - 2px)', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                <div>
                  {/* Tags */}
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:16, flexWrap:'wrap' }}>
                    {story.is_breaking && (
                      <motion.div animate={{opacity:[1,.4,1]}} transition={{duration:.9,repeat:Infinity}}>
                        <Pill color="var(--red)">◉ BREAKING</Pill>
                      </motion.div>
                    )}
                    <Pill dim>{(story.topic_cluster||'F1').replace(/_/g,' ')}</Pill>
                    <Pill color={srcColor(srcT)}>{srcT.toUpperCase()}</Pill>
                    <span style={{ marginLeft:'auto', fontSize:9, color:'rgba(255,255,255,.3)' }}>
                      {story.latest_event_ts ? timeAgo(story.latest_event_ts) : '—'}
                    </span>
                  </div>

                  {/* Headline */}
                  <div style={{ fontSize:22, lineHeight:1.35, color:'#fff', fontWeight:600, marginBottom:12, maxWidth:640 }}>
                    {story.story_title}
                    {story.latest_url && <span style={{ marginLeft:8, fontSize:16, color:c, opacity:.7 }}>↗</span>}
                  </div>

                  <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', fontFamily:'var(--font-mono)', letterSpacing:'.08em' }}>
                    {inferNarrative(story.story_title??'')} narrative
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', padding:'4px 10px', borderRadius:6 }}>
                    {sourceFavicon(story.latest_source) && (
                      <img src={sourceFavicon(story.latest_source)} width={14} height={14} alt="" style={{borderRadius:2,opacity:.9,flexShrink:0}}/>
                    )}
                    <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:srcColor(srcT) }}>{story.latest_source}</span>
                  </div>

                  {story.driver && (
                    <button onClick={e=>{e.stopPropagation();onDriverClick(story.driver!)}} style={{
                      fontSize:8, fontFamily:'var(--font-mono)', color:col(story.driver),
                      border:`1px solid ${col(story.driver)}40`, background:`${col(story.driver)}12`,
                      padding:'3px 9px', borderRadius:5, cursor:'pointer',
                    }}>{story.driver}</button>
                  )}

                  <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
                    <span style={{ fontSize:7, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,.25)', letterSpacing:'.1em' }}>MOMENTUM</span>
                    <div style={{ width:52, height:3, background:'rgba(255,255,255,.07)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${momentum}%`, background:c, borderRadius:2 }} />
                    </div>
                    <span style={{ fontSize:8, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,.4)' }}>{momentum}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right — queue + controls */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:7, fontFamily:'var(--font-mono)', letterSpacing:'.16em', color:'rgba(255,255,255,.25)', marginBottom:2 }}>UP NEXT</div>

          {[1,2,3].map(off => {
            const s = stories[(active+off)%total]
            return (
              <button key={off}
                onClick={() => go((active+off)%total)}
                style={{
                  flex:1, padding:'10px 12px', textAlign:'left',
                  border:'1px solid rgba(255,255,255,.07)', borderRadius:10,
                  background:'rgba(255,255,255,.025)', cursor:'pointer',
                  transition:'background .15s',
                }}>
                <div style={{ fontSize:7, color:'rgba(255,255,255,.25)', fontFamily:'var(--font-mono)', marginBottom:4 }}>
                  {(s.topic_cluster||'F1').replace(/_/g,' ').slice(0,18)}
                </div>
                <div style={{
                  fontSize:10.5, lineHeight:1.4, color:'rgba(255,255,255,.55)',
                  overflow:'hidden', display:'-webkit-box',
                  WebkitLineClamp:2, WebkitBoxOrient:'vertical',
                } as React.CSSProperties}>{s.story_title}</div>
              </button>
            )
          })}

          {/* Controls */}
          <div style={{ display:'flex', gap:6, marginTop:'auto', paddingTop:4 }}>
            {[{fn:prev,icon:'←'},{fn:next,icon:'→'}].map(({fn,icon})=>(
              <button key={icon} onClick={fn} style={{
                flex:1, height:34, borderRadius:8,
                border:'1px solid rgba(255,255,255,.1)',
                background:'rgba(255,255,255,.04)',
                color:'rgba(255,255,255,.6)', cursor:'pointer', fontSize:14,
              }}>{icon}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Dots */}
      <div style={{ display:'flex', justifyContent:'center', gap:5, marginTop:14 }}>
        {stories.map((_,i) => (
          <motion.div key={i} onClick={()=>go(i)}
            animate={{ opacity:i===active?1:.2, scale:i===active?1.3:1 }}
            style={{ width:5, height:5, borderRadius:'50%', background:'var(--red)', cursor:'pointer' }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Story row ─────────────────────────────────────────────────────────────────

function StoryRow({ story, dim }: { story: Story; dim?: boolean }) {
  const href    = story.latest_url ?? null
  const srcT    = getSourceType(story.latest_source)
  const sc      = srcColor(srcT)
  const time    = story.latest_event_ts ? timeAgo(story.latest_event_ts) : '—'
  const momentum = Math.min(100, safeNum(story.momentum_score))

  const inner = (
    <div style={{
      padding:'11px 18px', borderBottom:'1px solid rgba(255,255,255,.04)',
      display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'center',
      background: dim ? 'transparent' : 'rgba(255,255,255,.012)',
      opacity: dim ? 0.75 : 1, cursor: href ? 'pointer' : 'default',
      transition:'background .12s',
    }}>
      <div>
        <div style={{
          fontSize:12.5, color:'rgba(255,255,255,.85)', lineHeight:1.45, marginBottom:6,
          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden',
        } as React.CSSProperties}>
          {story.story_title}
          {href && <span style={{marginLeft:5,fontSize:10,color:'var(--red)',opacity:.6}}>↗</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            {sourceFavicon(story.latest_source) && <img src={sourceFavicon(story.latest_source)} width={12} height={12} alt="" style={{borderRadius:2,opacity:.8}}/>}
            <span style={{ fontSize:9, color:'rgba(255,255,255,.35)' }}>{story.latest_source}</span>
          </div>
          <span style={{ fontSize:9, color:'rgba(255,255,255,.25)' }}>{time}</span>
          {story.is_breaking && <Pill color="var(--red)">BREAKING</Pill>}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
        <div style={{ width:32, height:2, background:'rgba(255,255,255,.06)', borderRadius:2 }}>
          <div style={{ height:'100%', width:`${momentum}%`, background:story.is_breaking?'var(--red)':'rgba(255,255,255,.2)', borderRadius:2 }} />
        </div>
        <span style={{ fontSize:8, color:'rgba(255,255,255,.3)', fontFamily:'var(--font-mono)', minWidth:18 }}>{momentum}</span>
      </div>
    </div>
  )
  if (!href) return inner
  return <a href={href} target="_blank" rel="noopener noreferrer" style={{textDecoration:'none',color:'inherit',display:'block'}}>{inner}</a>
}

// ── Story cluster panel ───────────────────────────────────────────────────────

function StoryClusterPanel({ cluster, driverSentiment, onDriverClick }: {
  cluster: StoryCluster; driverSentiment: Record<string,SummaryEntity>; onDriverClick: (n:string)=>void
}) {
  const [expanded, setExpanded] = useState(false)
  const lead = cluster.stories[0]
  const rest = cluster.stories.slice(1)

  return (
    <div style={{ border:'1px solid rgba(255,255,255,.07)', borderRadius:14, background:'rgba(0,0,0,.2)', overflow:'hidden' }}>
      {/* Header */}
      <div style={{
        padding:'12px 18px', borderBottom:'1px solid rgba(255,255,255,.05)',
        background:'rgba(255,255,255,.02)',
        display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      }}>
        <div style={{ width:3, height:14, borderRadius:2, background:'var(--red)', flexShrink:0 }} />
        <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'rgba(255,255,255,.7)', letterSpacing:'.12em' }}>
          {cluster.label.toUpperCase()}
        </span>
        <span style={{ fontSize:9, color:'rgba(255,255,255,.3)', fontFamily:'var(--font-mono)' }}>
          {cluster.stories.length} {cluster.stories.length===1?'story':'stories'}
        </span>
        <div style={{ display:'flex', gap:4 }}>
          {Object.entries(cluster.srcCounts).map(([src,count]) => (
            <Pill key={src} color={srcColor(src)}>{src} {count}</Pill>
          ))}
        </div>
        {cluster.drivers.length > 0 && (
          <div style={{ display:'flex', gap:5, marginLeft:'auto', flexWrap:'wrap' }}>
            {cluster.drivers.map(name => {
              const c   = col(name)
              const sent = driverSentiment[name.toUpperCase()]
              const d   = safeNum(sent?.sentimentDelta)
              return (
                <button key={name} onClick={()=>onDriverClick(name)} style={{
                  padding:'2px 8px', borderRadius:4, border:`1px solid ${c}40`,
                  background:`${c}12`, color:c, fontSize:8,
                  fontFamily:'var(--font-mono)', letterSpacing:'.08em', cursor:'pointer',
                  display:'flex', alignItems:'center', gap:3,
                }}>
                  {name}
                  {sent && <span style={{color:d>0?'#22c55e':d<0?'#ef4444':'rgba(255,255,255,.3)'}}>{d>0?'↑':d<0?'↓':'→'}</span>}
                </button>
              )
            })}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
          <div style={{ width:36, height:2, background:'rgba(255,255,255,.06)', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${Math.min(100,cluster.avgMomentum)}%`, background:'var(--red)', borderRadius:2 }} />
          </div>
          <span style={{ fontSize:8, color:'rgba(255,255,255,.3)', fontFamily:'var(--font-mono)' }}>{cluster.avgMomentum}</span>
        </div>
      </div>

      {lead && <StoryRow story={lead} />}
      <AnimatePresence>
        {expanded && rest.map((s,i) => (
          <motion.div key={s.story_id??i} initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:.18}} style={{overflow:'hidden'}}>
            <StoryRow story={s} dim />
          </motion.div>
        ))}
      </AnimatePresence>
      {rest.length > 0 && (
        <button onClick={()=>setExpanded(e=>!e)} style={{
          width:'100%', padding:'8px 18px', background:'transparent', border:'none',
          borderTop:'1px solid rgba(255,255,255,.04)', color:'rgba(255,255,255,.3)',
          cursor:'pointer', fontSize:9, fontFamily:'var(--font-mono)', letterSpacing:'.12em',
          textAlign:'left', display:'flex', alignItems:'center', gap:6,
        }}>
          <span style={{ transform:expanded?'rotate(90deg)':'none', transition:'transform .18s', display:'inline-block' }}>›</span>
          {expanded ? 'SHOW LESS' : `${rest.length} MORE`}
        </button>
      )}
    </div>
  )
}

// ── Intelligence sub-components ───────────────────────────────────────────────

function KpiCard({ label, value, color, sub }: { label:string; value:string|number; color:string; sub?:string }) {
  return (
    <motion.div whileHover={{y:-2}} transition={{duration:.18}} style={{
      border:'1px solid rgba(255,255,255,.08)', borderRadius:20, padding:'16px 18px',
      background:'linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.014))',
      position:'relative', overflow:'hidden',
      boxShadow:'inset 0 1px 0 rgba(255,255,255,.04),0 14px 36px rgba(0,0,0,.18)',
    }}>
      <div style={{ position:'absolute',inset:0,background:`radial-gradient(circle at 100% 0%,${hr(color,.12)},transparent 42%)`,pointerEvents:'none' }} />
      <div style={{ position:'absolute',left:18,top:18,width:22,height:2,borderRadius:999,background:color,opacity:.9 }} />
      <div style={{ fontSize:8,letterSpacing:'.17em',color:'rgba(255,255,255,.35)',margin:'10px 0 7px' }}>{label}</div>
      <div style={{ fontFamily:'var(--font-bebas)',fontSize:32,lineHeight:1,color:'#fff',marginBottom:3 }}>{value}</div>
      {sub && <div style={{ fontSize:9,color:'rgba(255,255,255,.3)' }}>{sub}</div>}
    </motion.div>
  )
}

function MomentumBars({ entities, loading }: { entities:EnrichedEntity[]; loading:boolean }) {
  const top = [...entities].sort((a,b)=>(b.mentions??0)-(a.mentions??0)).slice(0,10)
  const max = Math.max(...top.map(e=>e.mentions??0),1)
  if (loading) return <div style={{display:'grid',gap:9}}>{Array(6).fill(null).map((_,i)=><div key={i} style={{height:26,background:'rgba(255,255,255,.04)',borderRadius:6}} />)}</div>
  return (
    <div style={{ display:'grid', gap:10 }}>
      {top.map(e => {
        const c   = col(e.driverName)
        const pct = ((e.mentions??0)/max)*100
        const d   = e.sentimentDelta??0
        const dc  = d>0.02?'#22c55e':d<-0.02?'#ef4444':'rgba(255,255,255,.3)'
        const sig = e.pulse!=='STABLE' ? ({RISING:{c:'#22c55e',t:'↑'},FALLING:{c:'#ef4444',t:'↓'},CONTROVERSIAL:{c:'#f59e0b',t:'⚡'},'MOST DISCUSSED':{c:'#60a5fa',t:'◉'}} as any)[e.pulse] : null
        return (
          <div key={e.driverName} style={{ display:'grid', gridTemplateColumns:'110px 1fr 48px 48px', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:3, height:14, borderRadius:2, background:c, flexShrink:0 }} />
              <span style={{ fontSize:11, color:'rgba(255,255,255,.8)' }}>{e.driverName}</span>
              {sig && <span style={{fontSize:10,color:sig.c}}>{sig.t}</span>}
            </div>
            <div style={{ height:5, borderRadius:999, background:'rgba(255,255,255,.05)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:c, borderRadius:999, transition:'width .9s cubic-bezier(.4,0,.2,1)' }} />
            </div>
            <div style={{ textAlign:'right', fontFamily:'var(--font-bebas)', fontSize:15, color:c, lineHeight:1 }}>{e.mentions}</div>
            <div style={{ textAlign:'right', fontSize:9, color:dc, fontFamily:'var(--font-mono)' }}>{sign(d)}</div>
          </div>
        )
      })}
    </div>
  )
}

function OverlaidTrendChart({ entities, seriesMap, anomalyMap }: { entities:EnrichedEntity[]; seriesMap:Record<string,TimeseriesPoint[]>; anomalyMap:Record<string,Anomaly[]> }) {
  const W=460, H=120
  const series = entities.map(e=>({e,data:(seriesMap[e.driverName]??[]).sort((a,b)=>a.date.localeCompare(b.date))})).filter(s=>s.data.length>1)
  if (!series.length) return <div style={{height:120,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.3)',fontSize:11}}>No data yet</div>
  const allVals = series.flatMap(s=>s.data.map(d=>d.sentimentAvg))
  const gMin=Math.min(...allVals), gMax=Math.max(...allVals), gRange=Math.max(gMax-gMin,.001)
  const X=(i:number,n:number)=>(i/Math.max(n-1,1))*W
  const Y=(v:number)=>H-((v-gMin)/gRange)*(H*.84)-H*.08
  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow:'visible'}}>
        <defs>{series.map(({e})=>(<linearGradient key={e.driverName} id={`tg-${e.driverName}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={col(e.driverName)} stopOpacity=".12"/><stop offset="100%" stopColor={col(e.driverName)} stopOpacity="0"/></linearGradient>))}</defs>
        {gMin<0&&gMax>0&&<line x1={0} y1={Y(0)} x2={W} y2={Y(0)} stroke="rgba(255,255,255,.08)" strokeDasharray="3 3"/>}
        {series.map(({e,data})=>{const pts=data.map((d,i)=>[X(i,data.length),Y(d.sentimentAvg)] as [number,number]);return <path key={`a-${e.driverName}`} d={`M${pts.map(p=>p.join(',')).join(' L')} V${H} H0 Z`} fill={`url(#tg-${e.driverName})`}/>})}
        {series.map(({e,data})=>(<path key={`l-${e.driverName}`} d={data.map((d,i)=>`${i===0?'M':'L'}${X(i,data.length).toFixed(1)},${Y(d.sentimentAvg).toFixed(1)}`).join(' ')} fill="none" stroke={col(e.driverName)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>))}
        {series.map(({e,data})=>(anomalyMap[e.driverName]??[]).filter(a=>a.severity!=='low').slice(0,2).map(a=>{const idx=data.findIndex(d=>d.date===a.date);if(idx<0)return null;return <circle key={`${e.driverName}-${a.date}`} cx={X(idx,data.length)} cy={Y(data[idx].sentimentAvg)} r="4" fill="#f59e0b" stroke="rgba(0,0,0,.5)" strokeWidth="1"/>}))}
      </svg>
      <div style={{display:'flex',gap:14,marginTop:10,flexWrap:'wrap'}}>
        {series.map(({e})=>{const d=e.sentimentDelta??0;return(
          <div key={e.driverName} style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:16,height:2,background:col(e.driverName),borderRadius:1}}/>
            <span style={{fontSize:10,color:'rgba(255,255,255,.6)'}}>{e.driverName}</span>
            <span style={{fontSize:9,color:d>0?'#22c55e':d<0?'#ef4444':'rgba(255,255,255,.3)',fontFamily:'var(--font-mono)'}}>{sign(d)}</span>
          </div>
        )})}
      </div>
    </div>
  )
}

function TableHead({ tab }: { tab: IntelTab }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 72px 88px 88px 50px 88px', gap:6, padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.015)', fontSize:8, letterSpacing:'.18em', color:'rgba(255,255,255,.3)' }}>
      <span>#</span>
      <span>{tab==='driver'?'DRIVER':'CONSTRUCTOR'}</span>
      <span style={{textAlign:'right'}}>MENTIONS</span>
      <span style={{textAlign:'right'}}>SENTIMENT</span>
      <span style={{textAlign:'right'}}>Δ RECENT</span>
      <span style={{textAlign:'center'}}>DIR</span>
      <span style={{textAlign:'right'}}>CONTROVERSY</span>
    </div>
  )
}

function EntityRow({ entity, rank, conRaw, trendSig, pred, active, onSelect }: {
  entity:EnrichedEntity; rank:number; conRaw?:ControversyRaw; trendSig?:TrendSignal
  pred?:PredictiveSignal; active:boolean; onSelect:()=>void
}) {
  const c  = col(entity.driverName)
  const d  = entity.sentimentDelta??0
  const dc = d>0.02?'#22c55e':d<-0.02?'#ef4444':'rgba(255,255,255,.3)'
  const cs = conRaw?.score??0
  const cc = cs>=65?'#ef4444':cs>=35?'#f59e0b':cs>=10?'#60a5fa':'rgba(255,255,255,.3)'
  const p  = pred&&pred.signal!=='stable'?SIG_C[pred.signal]:null
  return (
    <div onClick={onSelect} style={{
      display:'grid', gridTemplateColumns:'28px 1fr 72px 88px 88px 50px 88px',
      gap:6, padding:'11px 16px', alignItems:'center', cursor:'pointer',
      borderBottom:'1px solid rgba(255,255,255,.04)',
      borderLeft:`2px solid ${active?c:'transparent'}`,
      background: active ? `linear-gradient(90deg,${hr(c,.06)},transparent)` : 'transparent',
      transition:'background .14s, border-color .14s',
    }}>
      <span style={{fontSize:10,color:'rgba(255,255,255,.25)',fontFamily:'var(--font-bebas)'}}>{rank}</span>
      <div style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
        <div style={{width:3,height:18,background:c,borderRadius:2,flexShrink:0}}/>
        <div style={{minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Link href={`/drivers/${entity.driverName.toLowerCase()}`} onClick={e=>e.stopPropagation()} style={{textDecoration:'none',color:'inherit'}}>
              <span style={{fontFamily:'var(--font-bebas)',fontSize:14,letterSpacing:'.06em',lineHeight:1,borderBottom:'1px solid rgba(255,255,255,.08)'}}>{entity.driverName}</span>
            </Link>
            {p && <Bdg c={p.c}>{p.label}</Bdg>}
          </div>
          {trendSig&&trendSig.phase!=='stable'&&<div style={{fontSize:8,color:PHASE_C[trendSig.phase]??'rgba(255,255,255,.3)',marginTop:1,letterSpacing:'.08em'}}>{trendSig.phase.toUpperCase()}</div>}
        </div>
      </div>
      <span style={{textAlign:'right',fontFamily:'var(--font-bebas)',fontSize:15,lineHeight:1}}>{entity.mentions??0}</span>
      <span style={{textAlign:'right',fontSize:10,color:entity.sentimentLabel==='positive'?'#22c55e':entity.sentimentLabel==='negative'?'#ef4444':'rgba(255,255,255,.6)'}}>
        {(entity.sentimentAvg??0)>=0?'+':''}{Number(entity.sentimentAvg??0).toFixed(3)}
      </span>
      <span style={{textAlign:'right',fontSize:10,color:dc,fontFamily:'var(--font-mono)'}}>{d>=0?'+':''}{d.toFixed(3)}</span>
      <div style={{textAlign:'center',fontSize:13,color:dc}}>{d>0.02?'↑':d<-0.02?'↓':'→'}</div>
      <div style={{textAlign:'right'}}>
        {cs>0
          ? <span style={{fontFamily:'var(--font-bebas)',fontSize:14,color:cc}}>{Math.round(cs)}<span style={{fontSize:7,color:'rgba(255,255,255,.25)',marginLeft:1}}>/100</span></span>
          : <span style={{color:'rgba(255,255,255,.2)',fontSize:10}}>—</span>}
      </div>
    </div>
  )
}

function DS({ l, v, c }: { l:string; v:string; c?:string }) {
  return (
    <div style={{ border:'1px solid rgba(255,255,255,.06)', borderRadius:8, padding:'7px 9px', background:'rgba(0,0,0,.2)' }}>
      <div style={{ fontSize:7.5, letterSpacing:'.12em', color:'rgba(255,255,255,.3)', marginBottom:3 }}>{l}</div>
      <div style={{ fontSize:11, color:c??'rgba(255,255,255,.8)', lineHeight:1.3, wordBreak:'break-word' }}>{v}</div>
    </div>
  )
}

function EntityDetail({ entity, entityType, ts, tsLoading, conRaw, sentProf, conProf, trendSig, anomalies, arc, pred, section, setSection, days, onClose }: {
  entity:EnrichedEntity; entityType:IntelTab; ts:TimeseriesPoint[]; tsLoading:boolean
  conRaw?:ControversyRaw; sentProf?:SentimentProfile; conProf?:ControversyProfile
  trendSig?:TrendSignal; anomalies:Anomaly[]; arc?:StoryArc; pred?:PredictiveSignal
  section:'trend'|'sentiment'|'controversy'|'arc'; setSection:(s:any)=>void
  days:number; onClose:()=>void
}) {
  const c      = col(entity.driverName)
  const p      = pred&&pred.signal!=='stable'?SIG_C[pred.signal]:null
  const sorted = [...ts].sort((a,b)=>a.date.localeCompare(b.date))
  const mPath  = sparkPts(sorted,'mentions',260,58)
  const sPath  = sparkPts(sorted,'sentimentAvg',260,58)
  const totPos = ts.reduce((s,d)=>s+d.positiveCount,0)
  const totNeu = ts.reduce((s,d)=>s+d.neutralCount,0)
  const totNeg = ts.reduce((s,d)=>s+d.negativeCount,0)
  return (
    <div>
      <div style={{ padding:'14px 16px', background:hr(c,.07), borderBottom:'1px solid rgba(255,255,255,.07)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:8, letterSpacing:'.15em', color:'rgba(255,255,255,.4)', marginBottom:2 }}>{entityType==='team'?'CONSTRUCTOR':'DRIVER'} INTELLIGENCE</div>
          <div style={{ fontFamily:'var(--font-bebas)', fontSize:20, color:c, letterSpacing:'.06em', lineHeight:1 }}>{entity.driverName}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          {p && <Bdg c={p.c}>{p.label}</Bdg>}
          <button onClick={onClose} style={{ background:'transparent', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.5)', width:28, height:28, borderRadius:7, cursor:'pointer', fontSize:14, lineHeight:1 }}>×</button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
        {[
          { l:'INFLUENCE',   v:`${entity.influenceScore}`,                             c },
          { l:'MENTIONS',    v:`${entity.mentions}` },
          { l:'SENTIMENT',   v:sign(entity.sentimentAvg), c:entity.sentimentAvg>0?'#22c55e':entity.sentimentAvg<0?'#ef4444':undefined },
          { l:'CONTROVERSY', v:(conRaw?.score??0)>0?`${Math.round(conRaw!.score)}`:'—', c:(conRaw?.score??0)>=50?'#ef4444':(conRaw?.score??0)>=25?'#f59e0b':undefined },
        ].map((s,i) => (
          <div key={s.l} style={{ padding:'9px 11px', borderRight:i<3?'1px solid rgba(255,255,255,.06)':undefined }}>
            <div style={{ fontSize:7.5, letterSpacing:'.12em', color:'rgba(255,255,255,.3)', marginBottom:3 }}>{s.l}</div>
            <div style={{ fontFamily:'var(--font-bebas)', fontSize:18, color:s.c??'rgba(255,255,255,.85)', lineHeight:1 }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
        {(['trend','sentiment','controversy','arc'] as const).map(v => (
          <button key={v} onClick={()=>setSection(v)} style={{
            flex:1, padding:'10px 0', background:'transparent', border:'none',
            borderBottom:`2px solid ${section===v?'var(--red)':'transparent'}`,
            cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:8, letterSpacing:'.12em',
            color:section===v?'#fff':'rgba(255,255,255,.4)', transition:'all .15s',
          }}>{v==='arc'?'STORY ARC':v.toUpperCase()}</button>
        ))}
      </div>
      <div style={{ padding:'13px 15px' }}>
        {section==='trend' && (
          <div style={{ display:'grid', gap:13 }}>
            {tsLoading ? <div style={{height:76,background:'rgba(255,255,255,.04)',borderRadius:8}}/> : (
              <>
                <div>
                  <div style={{ fontSize:8, letterSpacing:'.12em', color:'rgba(255,255,255,.3)', marginBottom:5 }}>MENTION VOLUME · {days} DAYS</div>
                  <svg width="100%" height={60} viewBox="0 0 260 60">
                    <defs><linearGradient id={`mg-${entity.driverName}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity=".2"/><stop offset="100%" stopColor={c} stopOpacity="0"/></linearGradient></defs>
                    {mPath&&<><path d={`${mPath} V56 H0 Z`} fill={`url(#mg-${entity.driverName})`}/><path d={mPath} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></>}
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize:8, letterSpacing:'.12em', color:'rgba(255,255,255,.3)', marginBottom:5 }}>SENTIMENT AVERAGE · {days} DAYS</div>
                  <svg width="100%" height={60} viewBox="0 0 260 60">
                    <defs><linearGradient id={`sg-${entity.driverName}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={entity.sentimentAvg>=0?'#22c55e':'#ef4444'} stopOpacity=".16"/><stop offset="100%" stopColor={entity.sentimentAvg>=0?'#22c55e':'#ef4444'} stopOpacity="0"/></linearGradient></defs>
                    {sPath&&<><path d={`${sPath} V56 H0 Z`} fill={`url(#sg-${entity.driverName})`}/><path d={sPath} fill="none" stroke={entity.sentimentAvg>=0?'#22c55e':'#ef4444'} strokeWidth="1.8" strokeLinecap="round"/></>}
                  </svg>
                </div>
              </>
            )}
            {trendSig && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                <DS l="PHASE"    v={trendSig.phase.toUpperCase()} c={PHASE_C[trendSig.phase]}/>
                <DS l="VELOCITY" v={`${trendSig.mentionVelocity>=0?'+':''}${trendSig.mentionVelocity.toFixed(2)}/day`} c={trendSig.mentionVelocity>0?'#22c55e':'#ef4444'}/>
                <DS l="BREAKOUT" v={trendSig.mentionBreakout?`${trendSig.breakoutMagnitude.toFixed(1)}σ ABOVE`:'NO'} c={trendSig.mentionBreakout?'#22c55e':undefined}/>
                {trendSig.daysSinceSpike!=null&&<DS l="LAST SPIKE" v={`${trendSig.daysSinceSpike}d ago`}/>}
              </div>
            )}
          </div>
        )}
        {section==='sentiment'&&sentProf&&(
          <div style={{ display:'grid', gap:12 }}>
            <div>
              <div style={{ fontSize:8, letterSpacing:'.12em', color:'rgba(255,255,255,.3)', marginBottom:6 }}>COMPOSITION</div>
              <div style={{ height:6, borderRadius:999, display:'flex', overflow:'hidden', background:'rgba(255,255,255,.05)', marginBottom:7 }}>
                <div style={{ width:`${sentProf.positiveRatio*100}%`, background:'#22c55e' }}/>
                <div style={{ width:`${sentProf.neutralRatio*100}%`, background:'rgba(255,255,255,.12)' }}/>
                <div style={{ width:`${sentProf.negativeRatio*100}%`, background:'#ef4444' }}/>
              </div>
              <div style={{ display:'flex', gap:9 }}>
                {[{l:'Pos',v:totPos,c:'#22c55e'},{l:'Neu',v:totNeu,c:'rgba(255,255,255,.3)'},{l:'Neg',v:totNeg,c:'#ef4444'}].map(s=>(
                  <span key={s.l} style={{fontSize:9,color:'rgba(255,255,255,.6)'}}><span style={{color:s.c}}>{s.v}</span> {s.l}</span>
                ))}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
              <DS l="POLARITY"     v={sentProf.polarityIndex.toFixed(3)}                       c={sentProf.polarityIndex>0.1?'#22c55e':sentProf.polarityIndex<-0.1?'#ef4444':undefined}/>
              <DS l="SUBJECTIVITY" v={`${(sentProf.subjectivity*100).toFixed(1)}%`}/>
              <DS l="VOLATILITY"   v={sentProf.volatility.toFixed(4)}                          c={sentProf.volatility>0.1?'#f59e0b':undefined}/>
              <DS l="ACCELERATION" v={`${sentProf.acceleration>=0?'+':''}${sentProf.acceleration.toFixed(3)}`} c={sentProf.acceleration>0?'#22c55e':sentProf.acceleration<0?'#ef4444':undefined}/>
              <DS l="RECENT BIAS"  v={sentProf.recentBias.toUpperCase()}                       c={sentProf.recentBias==='positive'?'#22c55e':sentProf.recentBias==='negative'?'#ef4444':undefined}/>
              <DS l="LABEL"        v={sentProf.label.toUpperCase()}/>
            </div>
            {anomalies.length>0&&(
              <div>
                <div style={{ fontSize:8, letterSpacing:'.12em', color:'rgba(255,255,255,.3)', marginBottom:7 }}>ANOMALIES DETECTED</div>
                {anomalies.slice(0,4).map((a,i)=>(
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                    <span style={{fontSize:9,color:'rgba(255,255,255,.6)',lineHeight:1.4}}>{a.description}</span>
                    <span style={{fontSize:8,color:'rgba(255,255,255,.3)',flexShrink:0}}>{fmtDate(a.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {section==='controversy'&&(conProf?(
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
              <DS l="TIER"          v={conProf.tier.toUpperCase()}           c={TIER_C[conProf.tier]}/>
              <DS l="TRAJECTORY"    v={conProf.trajectory}                   c={TRAJ_C[conProf.trajectory]}/>
              <DS l="DOMINANT"      v={conProf.dominantDriver.toUpperCase()}/>
              <DS l="CONCENTRATION" v={`${(conProf.concentration*100).toFixed(0)}%`} c={conProf.concentration>0.6?'#f59e0b':undefined}/>
            </div>
            {[{l:'SENTIMENT',v:conProf.components.sentiment,c:'#ef4444'},{l:'FIA',v:conProf.components.fia,c:'#f59e0b'},{l:'SPIKE',v:conProf.components.spike,c:'#60a5fa'},{l:'MEDIA',v:conProf.components.media,c:'#a855f7'}].map(comp=>(
              <div key={comp.l}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:8, color:'rgba(255,255,255,.3)', marginBottom:4 }}>
                  <span>{comp.l}</span><span style={{color:comp.c}}>{Math.round(comp.v)}/100</span>
                </div>
                <div style={{ height:4, background:'rgba(255,255,255,.05)', borderRadius:2 }}>
                  <div style={{ height:'100%', width:`${comp.v}%`, background:comp.c, borderRadius:2, transition:'width .8s ease' }}/>
                </div>
              </div>
            ))}
          </div>
        ):<div style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>No controversy data.</div>)}
        {section==='arc'&&arc&&(
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
              <DS l="PHASE"         v={arc.phase.toUpperCase()}        c={PHASE_C[arc.phase]}/>
              <DS l="SENTIMENT ARC" v={arc.sentimentArc.toUpperCase()} c={SENT_ARC_C[arc.sentimentArc]}/>
              {arc.peakDate&&<DS l="PEAK DATE" v={fmtDate(arc.peakDate)}/>}
              {arc.estimatedResolutionDays!=null&&<DS l="EST. RESOLUTION" v={`~${arc.estimatedResolutionDays}d`}/>}
            </div>
            <div style={{ height:4, background:'rgba(255,255,255,.05)', borderRadius:2 }}>
              <div style={{ height:'100%', width:`${arc.currentIntensity}%`, background:PHASE_C[arc.phase]??'#6b7280', transition:'width .8s ease' }}/>
            </div>
            <p style={{ fontSize:10, color:'rgba(255,255,255,.65)', lineHeight:1.75, margin:0, padding:'10px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,.07)', background:'rgba(0,0,0,.15)' }}>{arc.narrative}</p>
            {arc.beats.length>0&&(
              <div>
                <div style={{ fontSize:8, letterSpacing:'.12em', color:'rgba(255,255,255,.3)', marginBottom:7 }}>STORY BEATS</div>
                {arc.beats.slice(0,5).map((b:StoryBeat,i:number)=>(
                  <div key={i} style={{ display:'flex', gap:9, padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,.05)', alignItems:'flex-start' }}>
                    <span style={{fontSize:8,color:'rgba(255,255,255,.3)',flexShrink:0,minWidth:46,marginTop:1}}>{fmtDate(b.date)}</span>
                    <span style={{fontSize:9,color:'rgba(255,255,255,.6)',lineHeight:1.5}}>{b.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyDetail() {
  return (
    <div style={{ padding:'32px 20px' }}>
      <div style={{ fontSize:9, letterSpacing:'.16em', color:'rgba(255,255,255,.25)', marginBottom:10 }}>INTELLIGENCE PANEL</div>
      <p style={{ color:'rgba(255,255,255,.45)', fontSize:11, lineHeight:1.8, margin:0 }}>
        Select any driver or constructor from the table to open trend, sentiment, controversy and story arc analysis.
      </p>
    </div>
  )
}

function PredictiveSignalsViz({ signals }: { signals: PredictiveSignal[] }) {
  const top = signals.filter(s=>s.signal!=='stable').slice(0,6)
  if (!top.length) return <div style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>No active pre-trend signals.</div>
  return (
    <div style={{ display:'grid', gap:12 }}>
      {top.map(s=>{
        const cfg=SIG_C[s.signal]??SIG_C.stable, c=col(s.entityName)
        const dirC=s.predictedDirection==='up'?'#22c55e':s.predictedDirection==='down'?'#ef4444':'#6b7280'
        return (
          <div key={s.entityName} style={{ display:'grid', gridTemplateColumns:'3px 1fr', gap:12, alignItems:'stretch' }}>
            <div style={{ background:c, borderRadius:2 }}/>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{fontFamily:'var(--font-bebas)',fontSize:14,color:c,letterSpacing:'.05em'}}>{s.entityName}</span>
                  <Bdg c={cfg.c}>{cfg.label}</Bdg>
                </div>
                <span style={{fontSize:10,color:dirC,fontFamily:'var(--font-mono)'}}>
                  {s.predictedDirection==='up'?'▲':s.predictedDirection==='down'?'▼':'→'} {s.mentionRampRate>=0?'+':''}{s.mentionRampRate.toFixed(0)}%
                </span>
              </div>
              <div style={{ height:3, background:'rgba(255,255,255,.05)', borderRadius:2, marginBottom:5, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${s.preTrendScore}%`, background:cfg.c, transition:'width .9s ease' }}/>
              </div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.4)', lineHeight:1.5 }}>{s.reason}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ControversyViz({ entities, profiles }: { entities:EnrichedEntity[]; profiles:Record<string,ControversyProfile> }) {
  const ents = entities.filter(e=>profiles[e.driverName]&&profiles[e.driverName].score>0)
  if (!ents.length) return <div style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>No active controversy signals.</div>
  const comps = ['sentiment','fia','spike','media'] as const
  const compC = {sentiment:'#ef4444',fia:'#f59e0b',spike:'#60a5fa',media:'#a855f7'}
  return (
    <div style={{ display:'grid', gap:11 }}>
      {ents.map(e=>{
        const p=profiles[e.driverName], c=col(e.driverName), tc=TIER_C[p.tier]??'#6b7280'
        return (
          <div key={e.driverName} style={{ border:'1px solid rgba(255,255,255,.07)', borderRadius:10, padding:'11px 13px', background:'rgba(0,0,0,.15)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:9 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{width:3,height:16,background:c,borderRadius:2}}/>
                <span style={{fontFamily:'var(--font-bebas)',fontSize:13,letterSpacing:'.05em'}}>{e.driverName}</span>
                <Bdg c={tc}>{p.tier}</Bdg>
                <Bdg c={TRAJ_C[p.trajectory]??'#6b7280'}>{p.trajectory}</Bdg>
              </div>
              <span style={{fontFamily:'var(--font-bebas)',fontSize:17,color:tc}}>{Math.round(p.score)}<span style={{fontSize:8,color:'rgba(255,255,255,.3)',marginLeft:1}}>/100</span></span>
            </div>
            <div style={{ height:5, borderRadius:3, overflow:'hidden', display:'flex', gap:1, marginBottom:8 }}>
              {comps.map(comp=>{const v=p.components[comp];if(v<=0)return null;return <div key={comp} style={{flex:v,background:compC[comp]}}/>})}
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {comps.map(comp=>(
                <div key={comp} style={{display:'flex',alignItems:'center',gap:4}}>
                  <div style={{width:6,height:6,borderRadius:2,background:compC[comp]}}/>
                  <span style={{fontSize:8,color:'rgba(255,255,255,.3)',textTransform:'uppercase'}}>{comp} <span style={{color:'rgba(255,255,255,.6)'}}>{Math.round(p.components[comp])}</span></span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CorrBar({ v }: { v: number }) {
  const c = v>0.3?'#22c55e':v<-0.3?'#ef4444':'#6b7280'
  return (
    <div style={{ height:4, background:'rgba(255,255,255,.05)', borderRadius:2, position:'relative' }}>
      <div style={{ position:'absolute', top:0, bottom:0, left:'50%', width:1, background:'rgba(255,255,255,.1)' }}/>
      <div style={{ position:'absolute', top:0, bottom:0, background:c, borderRadius:2, left:v>=0?'50%':`${((v+1)/2)*100}%`, width:v>=0?`${(v/2)*100}%`:`${(Math.abs(v)/2)*100}%`, transition:'width .7s ease' }}/>
    </div>
  )
}

function CorrelationViz({ correlations }: { correlations: EntityCorrelation[] }) {
  if (!correlations.length) return <div style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>Insufficient data.</div>
  const relC: Record<string,string> = {rivals:'#ef4444','co-trending':'#22c55e','narrative-linked':'#60a5fa',inverse:'#f59e0b',independent:'#6b7280'}
  return (
    <div style={{ display:'grid', gap:8 }}>
      {correlations.map((corr,i)=>{
        const cA=col(corr.entityA), cB=col(corr.entityB), rc=relC[corr.relationship]??'#6b7280'
        return (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 90px', gap:10, alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{fontFamily:'var(--font-bebas)',fontSize:12,color:cA}}>{corr.entityA}</span>
              <span style={{color:'rgba(255,255,255,.25)',fontSize:10}}>↔</span>
              <span style={{fontFamily:'var(--font-bebas)',fontSize:12,color:cB}}>{corr.entityB}</span>
            </div>
            <div><div style={{fontSize:7,color:'rgba(255,255,255,.3)',marginBottom:3}}>MENTIONS</div><CorrBar v={corr.mentionCorrelation}/></div>
            <div><div style={{fontSize:7,color:'rgba(255,255,255,.3)',marginBottom:3}}>SENTIMENT</div><CorrBar v={corr.sentimentCorrelation}/></div>
            <Bdg c={rc}>{corr.relationship}</Bdg>
          </div>
        )
      })}
    </div>
  )
}

function AnomalyLog({ entities, anomalyMap }: { entities:EnrichedEntity[]; anomalyMap:Record<string,Anomaly[]> }) {
  const all = entities.flatMap(e=>(anomalyMap[e.driverName]??[]).map(a=>({...a,entity:e.driverName}))).sort((a,b)=>b.magnitude-a.magnitude).slice(0,10)
  if (!all.length) return <div style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>No significant anomalies.</div>
  const tC: Record<string,string> = {spike:'#22c55e',drop:'#ef4444',sentiment_reversal:'#f59e0b',silence:'#60a5fa',sentiment_spike:'#a855f7'}
  const sC: Record<string,string> = {low:'#6b7280',medium:'#f59e0b',high:'#ef4444'}
  return (
    <div style={{ display:'grid', gap:7 }}>
      {all.map((a,i)=>{
        const c=col(a.entity), tc=tC[a.type]??'#6b7280', sc=sC[a.severity]??'#6b7280'
        return (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'3px 78px 1fr auto', gap:10, alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
            <div style={{background:c,borderRadius:2,alignSelf:'stretch'}}/>
            <div>
              <div style={{fontFamily:'var(--font-bebas)',fontSize:11,color:c,letterSpacing:'.05em'}}>{a.entity}</div>
              <div style={{fontSize:8,color:'rgba(255,255,255,.3)'}}>{fmtDate(a.date)}</div>
            </div>
            <span style={{fontSize:9,color:'rgba(255,255,255,.55)',lineHeight:1.5}}>{a.description}</span>
            <div style={{display:'flex',gap:5,flexShrink:0}}>
              <Bdg c={tc}>{a.type.replace('_',' ')}</Bdg>
              <Bdg c={sc}>{a.severity}</Bdg>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ESel({ label, value, opts, onChange, c }: { label:string; value:string|null; opts:string[]; onChange:(n:string|null)=>void; c:string }) {
  return (
    <div>
      <div style={{fontSize:8,letterSpacing:'.12em',color:'rgba(255,255,255,.35)',marginBottom:4}}>{label}</div>
      <select value={value??''} onChange={e=>onChange(e.target.value||null)} style={{ padding:'8px 10px', borderRadius:8, background:'rgba(0,0,0,.4)', border:`1px solid ${value?c:'rgba(255,255,255,.1)'}`, color:value?c:'rgba(255,255,255,.5)', fontFamily:'var(--font-mono)', fontSize:10, cursor:'pointer', minWidth:132, appearance:'none' }}>
        <option value="">Select…</option>
        {opts.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function ComparisonTool({ entities, compareA, compareB, setCompareA, setCompareB, result }: {
  entities:EnrichedEntity[]; compareA:string|null; compareB:string|null
  setCompareA:(n:string|null)=>void; setCompareB:(n:string|null)=>void; result:ComparisonResult|null
}) {
  const names = entities.map(e=>e.driverName)
  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'flex-end', flexWrap:'wrap' }}>
        <ESel label="Entity A" value={compareA} opts={names} onChange={setCompareA} c={compareA?col(compareA):'#60a5fa'}/>
        <span style={{color:'rgba(255,255,255,.3)',fontSize:13,paddingBottom:7}}>vs</span>
        <ESel label="Entity B" value={compareB} opts={names.filter(n=>n!==compareA)} onChange={setCompareB} c={compareB?col(compareB):'#ef4444'}/>
        {(compareA||compareB)&&<button onClick={()=>{setCompareA(null);setCompareB(null)}} style={{padding:'7px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.1)',background:'transparent',color:'rgba(255,255,255,.5)',cursor:'pointer',fontSize:10,marginBottom:1}}>CLEAR</button>}
      </div>
      {result ? (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:11, padding:'8px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,.07)', background:'rgba(0,0,0,.15)' }}>
            <span style={{fontSize:10,color:'rgba(255,255,255,.6)'}}>{result.summary}</span>
            {result.winner!=='tied'&&<span style={{fontFamily:'var(--font-bebas)',fontSize:13,color:col(result.winner)}}>{result.winner} LEADS</span>}
          </div>
          <div style={{ display:'grid', gap:5 }}>
            {result.dimensions.map((d:ComparisonDimension)=>{
              const aWin=d.winner===result.entityA, bWin=d.winner===result.entityB
              const cA=col(result.entityA), cB=col(result.entityB)
              const aMax=Math.max(Math.abs(d.valueA),Math.abs(d.valueB),.001)
              const aW=(Math.abs(d.valueA)/aMax)*44, bW=(Math.abs(d.valueB)/aMax)*44
              return (
                <div key={d.label} style={{ display:'grid', gridTemplateColumns:'64px 1fr 60px 1fr 64px', gap:8, alignItems:'center' }}>
                  <div style={{textAlign:'right',fontFamily:'var(--font-bebas)',fontSize:11,color:aWin?cA:'rgba(255,255,255,.3)',opacity:aWin?1:.5}}>{d.valueA.toFixed(d.unit===''?3:1)}{d.unit}</div>
                  <div style={{display:'flex',justifyContent:'flex-end'}}><div style={{height:5,borderRadius:'3px 0 0 3px',background:aWin?cA:hr(cA,.2),width:`${aW}%`,transition:'width .7s ease'}}/></div>
                  <div style={{textAlign:'center',fontSize:7.5,color:'rgba(255,255,255,.3)',letterSpacing:'.08em'}}>{d.label}</div>
                  <div style={{display:'flex',justifyContent:'flex-start'}}><div style={{height:5,borderRadius:'0 3px 3px 0',background:bWin?cB:hr(cB,.2),width:`${bW}%`,transition:'width .7s ease'}}/></div>
                  <div style={{fontFamily:'var(--font-bebas)',fontSize:11,color:bWin?cB:'rgba(255,255,255,.3)',opacity:bWin?1:.5}}>{d.valueB.toFixed(d.unit===''?3:1)}{d.unit}</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : <p style={{fontSize:11,color:'rgba(255,255,255,.3)',margin:0}}>Select two entities to compare side-by-side.</p>}
    </div>
  )
}

type InsightTab = 'watchlist'|'pressure'|'anomalies'|'correlation'|'compare'
function InsightsPanel({ predSignals, top8, conProfs, anomalyMap, correlations, enriched, compareA, compareB, setCompareA, setCompareB, comparison }: {
  predSignals:PredictiveSignal[]; top8:EnrichedEntity[]; conProfs:Record<string,ControversyProfile>
  anomalyMap:Record<string,Anomaly[]>; correlations:EntityCorrelation[]; enriched:EnrichedEntity[]
  compareA:string|null; compareB:string|null; setCompareA:(n:string|null)=>void; setCompareB:(n:string|null)=>void; comparison:ComparisonResult|null
}) {
  const [active, setActive] = useState<InsightTab>('watchlist')
  const ITABS: { key:InsightTab; label:string; count?:number }[] = [
    { key:'watchlist',   label:'WATCHLIST',   count:predSignals.filter(s=>s.signal!=='stable').length },
    { key:'pressure',    label:'PRESSURE',    count:top8.filter(e=>e.controversyScore>=20).length },
    { key:'anomalies',   label:'ANOMALIES',   count:Object.values(anomalyMap).flat().length },
    { key:'correlation', label:'CORRELATION', count:correlations.length },
    { key:'compare',     label:'COMPARE' },
  ]
  return (
    <div style={{ border:'1px solid rgba(255,255,255,.08)', borderRadius:20, overflow:'hidden', background:'linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.014))', boxShadow:'inset 0 1px 0 rgba(255,255,255,.04),0 18px 48px rgba(0,0,0,.22)' }}>
      <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,.07)', padding:'0 20px', overflowX:'auto' }}>
        {ITABS.map(t=>(
          <button key={t.key} onClick={()=>setActive(t.key)} style={{
            padding:'13px 16px', background:'transparent', border:'none',
            borderBottom:`2px solid ${active===t.key?'var(--red)':'transparent'}`,
            cursor:'pointer', color:active===t.key?'#fff':'rgba(255,255,255,.35)',
            fontFamily:'var(--font-mono)', fontSize:8, letterSpacing:'.14em',
            display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
            transition:'color .15s,border-color .15s', flexShrink:0,
          }}>
            {t.label}
            {t.count!==undefined&&t.count>0&&(
              <span style={{ background:active===t.key?'rgba(225,6,0,.15)':'rgba(255,255,255,.05)', color:active===t.key?'var(--red)':'rgba(255,255,255,.3)', padding:'1px 6px', borderRadius:999, fontSize:8, border:`1px solid ${active===t.key?'rgba(225,6,0,.25)':'transparent'}` }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={active} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:.18}} style={{padding:'20px'}}>
          {active==='watchlist'   && <PredictiveSignalsViz signals={predSignals}/>}
          {active==='pressure'    && <ControversyViz entities={top8} profiles={conProfs}/>}
          {active==='anomalies'   && <AnomalyLog entities={top8} anomalyMap={anomalyMap}/>}
          {active==='correlation' && <CorrelationViz correlations={correlations}/>}
          {active==='compare'     && <ComparisonTool entities={enriched} compareA={compareA} compareB={compareB} setCompareA={setCompareA} setCompareB={setCompareB} result={comparison}/>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── EditorialBriefing — horizontal full-width strip ───────────────────────────

function EditorialBriefing({ briefing, currentRace }: { briefing: any; currentRace: ReturnType<typeof getCurrentRace> }) {
  const items = [
    { key: 'TOP STORY',        value: briefing.top_story_summary, accent: '#E10600', num: '01', rotate: '-1.2deg' },
    { key: 'DRIVER SPOTLIGHT', value: briefing.driver_spotlight,  accent: '#F59E0B', num: '02', rotate: '0.8deg'  },
    { key: 'WHAT TO WATCH',    value: briefing.what_to_watch,     accent: '#60a5fa', num: '03', rotate: '-0.5deg' },
  ].filter(c => Boolean(c.value))

  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${items.length},1fr)`, gap:16, padding:'4px 0 12px' }}>
      {items.map((item, i) => (
        <motion.div key={item.key}
          whileHover={{ rotate: 0, y: -4, scale: 1.02 }}
          transition={{ duration: 0.2 }}
          style={{
            rotate: item.rotate,
            borderRadius: 4,
            background: '#111',
            border: `1px solid ${item.accent}30`,
            boxShadow: `0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.06)`,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Coloured top strip — the "tape" on the postcard */}
          <div style={{ height: 5, background: item.accent, opacity: 0.9 }}/>

          {/* Card body */}
          <div style={{ padding: '18px 20px 20px', position: 'relative', overflow: 'hidden' }}>
            {/* Ghost number watermark */}
            <div style={{
              position:'absolute', bottom:-24, right:-4,
              fontFamily:'var(--font-bebas)', fontSize:130, lineHeight:1,
              color: item.accent, opacity:0.06, pointerEvents:'none', userSelect:'none',
              letterSpacing:'-.04em',
            }}>{item.num}</div>

            {/* Label */}
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
              <div style={{ width:6, height:6, borderRadius:1, background:item.accent, flexShrink:0 }}/>
              <span style={{ fontSize:7, fontFamily:'var(--font-mono)', letterSpacing:'.2em', color:item.accent }}>
                {item.key}
              </span>
            </div>

            {/* Body */}
            <p style={{
              margin:0, fontSize:12.5, lineHeight:1.8,
              color:'rgba(255,255,255,.75)',
              fontFamily:'system-ui,-apple-system,sans-serif',
              position:'relative', zIndex:1,
            }}>{item.value}</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ── ClusterGrid — two-column magazine layout ──────────────────────────────────

function ClusterGrid({ clusters, driverSentiment, onDriverClick }: {
  clusters: StoryCluster[]
  driverSentiment: Record<string, SummaryEntity>
  onDriverClick: (n: string) => void
}) {
  // First cluster gets full-width hero treatment, rest go in 2-col grid
  const [hero, ...rest] = clusters

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Hero cluster — full width, prominent */}
      {hero && <HeroCluster cluster={hero} driverSentiment={driverSentiment} onDriverClick={onDriverClick} />}

      {/* Remaining clusters — 2 column grid */}
      {rest.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {rest.map(cl => (
            <CompactCluster key={cl.label} cluster={cl} driverSentiment={driverSentiment} onDriverClick={onDriverClick} />
          ))}
        </div>
      )}
    </div>
  )
}

function HeroCluster({ cluster, driverSentiment, onDriverClick }: {
  cluster: StoryCluster
  driverSentiment: Record<string, SummaryEntity>
  onDriverClick: (n: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const lead = cluster.stories[0]
  const rest = cluster.stories.slice(1)
  const href = lead?.latest_url ?? null
  const momentum = Math.min(100, cluster.avgMomentum)

  return (
    <div style={{
      border: '1px solid rgba(255,255,255,.09)', borderRadius: 16,
      background: 'rgba(255,255,255,.02)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,.05)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: 'rgba(255,255,255,.015)',
      }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--red)', flexShrink: 0 }}/>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,.8)', letterSpacing: '.12em' }}>
          {cluster.label.toUpperCase()}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'var(--font-mono)' }}>
          {cluster.stories.length} {cluster.stories.length === 1 ? 'story' : 'stories'}
        </span>
        {/* Source dots */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {Object.entries(cluster.srcCounts).map(([src, count]) => (
            <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: srcColor(src) }}/>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: 'var(--font-mono)' }}>{count}</span>
            </div>
          ))}
        </div>
        {/* Driver tags */}
        {cluster.drivers.length > 0 && (
          <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {cluster.drivers.map(name => {
              const c = col(name)
              const sent = driverSentiment[name.toUpperCase()]
              const d = safeNum(sent?.sentimentDelta)
              return (
                <button key={name} onClick={() => onDriverClick(name)} style={{
                  padding: '2px 8px', borderRadius: 4, border: `1px solid ${c}40`,
                  background: `${c}12`, color: c, fontSize: 8,
                  fontFamily: 'var(--font-mono)', letterSpacing: '.08em', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  {name}
                  {sent && <span style={{ color: d > 0 ? '#22c55e' : d < 0 ? '#ef4444' : 'rgba(255,255,255,.3)' }}>{d > 0 ? '↑' : d < 0 ? '↓' : '→'}</span>}
                </button>
              )
            })}
          </div>
        )}
        {/* Momentum bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{ width: 40, height: 2, background: 'rgba(255,255,255,.06)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${momentum}%`, background: 'var(--red)', borderRadius: 2 }}/>
          </div>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: 'var(--font-mono)' }}>{momentum}</span>
        </div>
      </div>

      {/* Lead story — large */}
      {lead && (
        <div
          onClick={() => href && window.open(href, '_blank')}
          style={{
            padding: '18px 20px',
            borderBottom: rest.length > 0 ? '1px solid rgba(255,255,255,.04)' : 'none',
            cursor: href ? 'pointer' : 'default',
          }}
        >
          <div style={{ fontSize: 15, lineHeight: 1.5, color: '#fff', marginBottom: 10, fontWeight: 500 }}>
            {lead.story_title}
            {href && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--red)', opacity: .6 }}>↗</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill color={srcColor(getSourceType(lead.latest_source))}>{getSourceType(lead.latest_source).toUpperCase()}</Pill>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)' }}>{lead.latest_source}</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,.25)' }}>{lead.latest_event_ts ? timeAgo(lead.latest_event_ts) : '—'}</span>
            {lead.is_breaking && <Pill color="var(--red)">BREAKING</Pill>}
          </div>
        </div>
      )}

      {/* Expandable rest */}
      <AnimatePresence>
        {expanded && rest.map((s, i) => (
          <motion.div key={s.story_id ?? i} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .18 }} style={{ overflow: 'hidden' }}>
            <StoryRow story={s} dim />
          </motion.div>
        ))}
      </AnimatePresence>
      {rest.length > 0 && (
        <button onClick={() => setExpanded(e => !e)} style={{
          width: '100%', padding: '9px 20px', background: 'transparent', border: 'none',
          borderTop: '1px solid rgba(255,255,255,.04)', color: 'rgba(255,255,255,.3)',
          cursor: 'pointer', fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.1em',
          textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .18s', display: 'inline-block' }}>›</span>
          {expanded ? 'SHOW LESS' : `${rest.length} MORE STORIES`}
        </button>
      )}
    </div>
  )
}

function CompactCluster({ cluster, driverSentiment, onDriverClick }: {
  cluster: StoryCluster
  driverSentiment: Record<string, SummaryEntity>
  onDriverClick: (n: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const lead = cluster.stories[0]
  const rest = cluster.stories.slice(1)
  const href = lead?.latest_url ?? null
  const momentum = Math.min(100, cluster.avgMomentum)
  const accentColor = cluster.stories.some(s => s.is_breaking) ? 'var(--red)' : 'rgba(255,255,255,.2)'

  return (
    <div style={{
      border: '1px solid rgba(255,255,255,.07)', borderRadius: 14,
      background: 'rgba(0,0,0,.2)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Compact header */}
      <div style={{
        padding: '11px 15px',
        borderBottom: '1px solid rgba(255,255,255,.05)',
        background: 'rgba(255,255,255,.015)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ width: 3, height: 13, borderRadius: 2, background: accentColor, flexShrink: 0 }}/>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,.7)', letterSpacing: '.1em', flex: 1 }}>
          {cluster.label.toUpperCase()}
        </span>
        {/* Coloured source dots */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {Object.entries(cluster.srcCounts).map(([src, count]) => (
            <div key={src} title={`${src}: ${count}`} style={{ width: 6, height: 6, borderRadius: '50%', background: srcColor(src) }}/>
          ))}
        </div>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: 'var(--font-mono)' }}>{cluster.stories.length}</span>
      </div>

      {/* Lead story */}
      {lead && (
        <div
          onClick={() => href && window.open(href, '_blank')}
          style={{ padding: '14px 15px', cursor: href ? 'pointer' : 'default', flex: 1 }}
        >
          <div style={{
            fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,.85)', marginBottom: 8,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          } as React.CSSProperties}>
            {lead.story_title}
            {href && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--red)', opacity: .5 }}>↗</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,.25)', fontFamily: 'var(--font-mono)' }}>{lead.latest_source}</span>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,.2)' }}>·</span>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,.2)' }}>{lead.latest_event_ts ? timeAgo(lead.latest_event_ts) : '—'}</span>
          </div>
        </div>
      )}

      {/* Driver tags if any */}
      {cluster.drivers.length > 0 && (
        <div style={{ padding: '0 15px 12px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {cluster.drivers.slice(0, 3).map(name => {
            const c = col(name)
            return (
              <button key={name} onClick={() => onDriverClick(name)} style={{
                padding: '2px 7px', borderRadius: 4, border: `1px solid ${c}35`,
                background: `${c}0e`, color: c, fontSize: 7,
                fontFamily: 'var(--font-mono)', cursor: 'pointer',
              }}>{name}</button>
            )
          })}
        </div>
      )}

      {/* Momentum + expand */}
      <div style={{
        padding: '8px 15px',
        borderTop: '1px solid rgba(255,255,255,.04)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,.05)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${momentum}%`, background: accentColor, borderRadius: 2 }}/>
        </div>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,.25)', fontFamily: 'var(--font-mono)', minWidth: 16 }}>{momentum}</span>
        {rest.length > 0 && (
          <button onClick={() => setExpanded(e => !e)} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4,
            color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 8,
            fontFamily: 'var(--font-mono)', padding: '2px 7px', letterSpacing: '.08em',
          }}>
            {expanded ? '↑' : `+${rest.length}`}
          </button>
        )}
      </div>
      <AnimatePresence>
        {expanded && rest.map((s, i) => (
          <motion.div key={s.story_id ?? i} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .18 }} style={{ overflow: 'hidden' }}>
            <StoryRow story={s} dim />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}


// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  *{box-sizing:border-box}
  .pg{max-width:1440px;margin:0 auto;padding:20px 24px 96px;display:grid;gap:20px}

  /* Masthead */
  .mast{
    padding:20px 36px 16px;
    background:radial-gradient(900px 280px at 100% 0%,rgba(220,0,0,.08),transparent 45%);
  }
  .mast-left{display:flex;flex-direction:column;gap:20px}
  .mast-title{font-family:var(--font-bebas);font-size:clamp(40px,6vw,76px);line-height:.9;letter-spacing:.04em;margin:0;color:#fff!important}
  .mast-title span{color:inherit}
  .mast-copy{margin:0;color:rgba(255,255,255,.5);font-size:13px;line-height:1.8;max-width:520px;font-family:system-ui,sans-serif}
  .eyebrow{display:flex;align-items:center;gap:10px}
  .eyebrow-line{width:32px;height:1px;background:linear-gradient(90deg,var(--red),transparent)}
  .eyebrow-text{font-size:9px;letter-spacing:.18em;color:rgba(255,255,255,.3);font-family:var(--font-mono)}

  /* Tabs */
  .tabs{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:16px;border-top:1px solid rgba(255,255,255,.07)}
  .tgrp{display:flex;align-items:center;gap:5px}
  .tdiv{width:1px;height:18px;background:rgba(255,255,255,.08)}
  .tbtn{padding:9px 14px;border-radius:999px;cursor:pointer;border:1px solid transparent;background:transparent;color:rgba(255,255,255,.4);font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;transition:all .18s;display:flex;align-items:center;gap:7px}
  .tbtn:hover{background:rgba(255,255,255,.04);color:rgba(255,255,255,.75);border-color:rgba(255,255,255,.08)}
  .tbtn.on{background:rgba(255,255,255,.06);color:#fff;border-color:rgba(255,255,255,.13)}
  .tbtn.on .tcnt{background:rgba(225,6,0,.15);color:var(--red);border-color:rgba(225,6,0,.2)}
  .tcnt{background:rgba(255,255,255,.05);color:rgba(255,255,255,.3);padding:2px 7px;border-radius:999px;font-size:8px;border:1px solid transparent}

  /* Masthead right */
  .mast-right{display:flex;flex-direction:column;justify-content:center;gap:8px}
  .race-pill{display:flex;align-items:center;gap:14px;padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025)}
  .race-flag{font-size:26px;line-height:1}
  .race-kicker{font-size:8px;letter-spacing:.14em;color:rgba(255,255,255,.3);margin-bottom:3px;font-family:var(--font-mono)}
  .race-sprint{margin-left:8px;color:#f59e0b}
  .race-name{font-family:var(--font-bebas);font-size:17px;line-height:1.1;letter-spacing:.05em;color:#fff}
  .race-meta{font-size:9px;color:rgba(255,255,255,.4);margin-top:3px}
  .sig-grid{display:grid;gap:8px}
  .sig-btn{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);cursor:pointer;text-align:left;transition:all .18s}
  .sig-btn:hover{transform:translateY(-2px);background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.12)}
  .sig-label{font-size:8px;letter-spacing:.18em;color:rgba(255,255,255,.3);min-width:48px;font-family:var(--font-mono)}
  .sig-name{font-family:var(--font-bebas);font-size:14px;letter-spacing:.05em;flex:1}
  .sig-val{font-family:var(--font-mono);font-size:10px}

  /* Layout */
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
  .row-2{display:grid;grid-template-columns:1.15fr .95fr;gap:18px;align-items:start}
  .row-main{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:18px;align-items:start}
  .card{border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:22px 24px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.013));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 16px 44px rgba(0,0,0,.2);backdrop-filter:blur(14px)}
  .card-np{border:1px solid rgba(255,255,255,.08);border-radius:22px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.013));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 16px 44px rgba(0,0,0,.2);backdrop-filter:blur(14px)}
  .detail{border:1px solid rgba(255,255,255,.08);border-radius:22px;position:sticky;top:calc(var(--header-h) + 18px);max-height:calc(100vh - var(--header-h) - 36px);overflow-y:auto;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.013));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 16px 44px rgba(0,0,0,.2);backdrop-filter:blur(16px)}

  /* Skeleton */
  .sk{background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.07) 50%,rgba(255,255,255,.04) 75%);background-size:200% 100%;animation:sk 1.5s infinite;border-radius:8px}
  @keyframes sk{0%{background-position:200%}100%{background-position:-200%}}

  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:999px}

  @media(max-width:1200px){.row-main,.row-2{grid-template-columns:1fr!important}.detail{position:static!important;max-height:none!important}.editorial-hero{grid-template-columns:1fr!important}}
  @media(max-width:960px){.kpi-row{grid-template-columns:1fr 1fr!important}.mast{grid-template-columns:1fr!important}.mast-right{display:none}}
  @media(max-width:640px){.kpi-row{grid-template-columns:1fr!important}.pg{padding:16px 14px 72px}.mast{padding:22px 20px;border-radius:22px}}
`

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [mainTab,  setMainTab]  = useState<MainTab>('stories')
  const [winMode,  setWinMode]  = useState<WindowMode>('30')
  const [intelTab, setIntelTab] = useState<IntelTab>('driver')
  const [stories,  setStories]  = useState<Story[]>([])
  const [briefing, setBriefing] = useState<any>(null)
  const [storiesLoading, setStoriesLoading] = useState(true)
  const [drivers,  setDrivers]  = useState<SummaryEntity[]>([])
  const [teams,    setTeams]    = useState<SummaryEntity[]>([])
  const [rawCon,   setRawCon]   = useState<ControversyRaw[]>([])
  const [intelLoading, setIntelLoading] = useState(true)
  const [selected, setSelected] = useState<string|null>(null)
  const [compareA, setCompareA] = useState<string|null>(null)
  const [compareB, setCompareB] = useState<string|null>(null)
  const [detailSec, setDetailSec] = useState<'trend'|'sentiment'|'controversy'|'arc'>('trend')

  const currentRace = useMemo(()=>getCurrentRace(),[])
  const days = useMemo(()=>{
    if (winMode==='race'&&currentRace) return raceWindowDays(currentRace.race)
    if (winMode==='14') return 14
    return 30
  },[winMode,currentRace])

  useEffect(()=>{
    let m=true; setStoriesLoading(true)
    Promise.all([
      fetch('/api/news/stories?hours=720&limit=80').then(r=>r.ok?r.json():null),
      fetch('/api/intelligence/briefing').then(r=>r.ok?r.json():null),
    ]).then(([sd,bd])=>{
      if(!m)return
      setStories(sd?.ok?(sd.data??[]):[])
      setBriefing(bd?.ok?(bd.briefing??null):null)
    }).finally(()=>{ if(m) setStoriesLoading(false) })
    return ()=>{ m=false }
  },[])

  useEffect(()=>{
    let m=true; setIntelLoading(true)
    Promise.all([
      fetch('/api/intelligence/drivers?format=summary&type=driver').then(r=>r.ok?r.json():null),
      fetch('/api/intelligence/drivers?format=summary&type=team').then(r=>r.ok?r.json():null),
      fetch(`/api/intelligence/controversy?days=${days}`).then(r=>r.ok?r.json():null),
    ]).then(([d,t,c])=>{
      if(!m)return
      setDrivers((d?.ok?(d.data??d.drivers??[]):[]).map(normSummary))
      setTeams((t?.ok?(t.data??t.drivers??[]):[]).map(normSummary))
      setRawCon((c?.ok?(c.data??[]):[]).map(normCon))
    }).finally(()=>{ if(m) setIntelLoading(false) })
    return ()=>{ m=false }
  },[days])

  useEffect(()=>{ setSelected(null); setCompareA(null); setCompareB(null) },[intelTab])

  const handleDriverTagClick = (name: string) => { setMainTab('drivers'); setIntelTab('driver'); setSelected(name) }

  const list = intelTab==='driver'?drivers:teams
  const cMap = useMemo(()=>Object.fromEntries(rawCon.map(c=>[c.entityName.toUpperCase(),c])),[rawCon])

  const enriched = useMemo(():EnrichedEntity[]=>{
    const ms=list.map(d=>d.mentions??0), ss=list.map(d=>d.sentimentAvg??0)
    const ds=list.map(d=>d.sentimentDelta??0), cs=list.map(d=>cMap[d.driverName.toUpperCase()]?.score??0)
    return list.map(e=>{
      const cScore=cMap[e.driverName.toUpperCase()]?.score??0
      const influence=Math.round(.45*nscore(ms,e.mentions??0)+.20*nscore(ss,e.sentimentAvg??0)+.20*nscore(ds,e.sentimentDelta??0)+.15*nscore(cs,cScore))
      const maxM=Math.max(...ms,0)
      let pulse:EnrichedEntity['pulse']='STABLE'
      if ((e.mentions??0)>=maxM*.88) pulse='MOST DISCUSSED'
      if ((e.sentimentDelta??0)>0.12) pulse='RISING'
      if ((e.sentimentDelta??0)<-0.08) pulse='FALLING'
      if (cScore>=40) pulse='CONTROVERSIAL'
      return {...e,controversyScore:cScore,influenceScore:influence,narrativeGroup:classifyNarrative(e.topCluster),pulse}
    })
  },[list,cMap])

  const top8  = useMemo(()=>[...enriched].sort((a,b)=>(b.mentions??0)-(a.mentions??0)).slice(0,8),[enriched])
  const top4  = useMemo(()=>top8.slice(0,4),[top8])
  const tsMap = useBatchTs(intelTab,top8,days)
  const detailTs = useEntityTs(intelTab,selected,days)

  const sentProfs  = useMemo(()=>{ const m:Record<string,SentimentProfile>={};  for(const e of top8) m[e.driverName]=computeSentimentProfile(e as any,tsMap[e.driverName]??[]); return m },[top8,tsMap])
  const conProfs   = useMemo(()=>{ const m:Record<string,ControversyProfile>={}; for(const e of enriched){ const r=cMap[e.driverName.toUpperCase()]; if(r) m[e.driverName]=computeControversyProfile(r.score,r.components,r.trend,r.delta) } return m },[enriched,cMap])
  const trendSigs  = useMemo(()=>{ const m:Record<string,TrendSignal>={};        for(const e of top8) m[e.driverName]=computeTrendSignal(tsMap[e.driverName]??[]); return m },[top8,tsMap])
  const anomalyMap = useMemo(()=>{ const m:Record<string,Anomaly[]>={};           for(const e of top8) m[e.driverName]=detectAnomalies(tsMap[e.driverName]??[]); return m },[top8,tsMap])
  const predSignals = useMemo(()=>top8.map(e=>computePredictiveSignal(e as any,tsMap[e.driverName]??[])).sort((a,b)=>b.preTrendScore-a.preTrendScore),[top8,tsMap])
  const correlations = useMemo(()=>computeCorrelationMatrix(top8 as any,tsMap).slice(0,10),[top8,tsMap])
  const storyArcs  = useMemo(()=>{ const m:Record<string,StoryArc>={};            for(const e of top8) m[e.driverName]=computeStoryArc(e as any,tsMap[e.driverName]??[],anomalyMap[e.driverName]??[]); return m },[top8,tsMap,anomalyMap])
  const comparison = useMemo(():ComparisonResult|null=>{
    if(!compareA||!compareB)return null
    const a=enriched.find(e=>e.driverName===compareA), b=enriched.find(e=>e.driverName===compareB)
    if(!a||!b)return null
    return compareEntities(a as any,b as any,cMap[a.driverName.toUpperCase()],cMap[b.driverName.toUpperCase()],sentProfs[a.driverName],sentProfs[b.driverName],trendSigs[a.driverName],trendSigs[b.driverName])
  },[compareA,compareB,enriched,cMap,sentProfs,trendSigs])

  const selEntity      = useMemo(()=>enriched.find(e=>e.driverName===selected)??null,[enriched,selected])
  const totalMentions  = useMemo(()=>enriched.reduce((s,e)=>s+(e.mentions??0),0),[enriched])
  const rising         = useMemo(()=>[...enriched].sort((a,b)=>(b.sentimentDelta??0)-(a.sentimentDelta??0))[0],[enriched])
  const hottest        = useMemo(()=>[...enriched].sort((a,b)=>(b.controversyScore??0)-(a.controversyScore??0))[0],[enriched])
  const deduped        = useMemo(()=>dedupeStories(stories),[stories])
  const driverNames    = useMemo(()=>drivers.map(d=>d.driverName),[drivers])
  const driverSentMap  = useMemo(()=>Object.fromEntries(drivers.map(d=>[d.driverName.toUpperCase(),d])),[drivers])
  const clusters       = useMemo(()=>buildStoryClusters(deduped,driverNames),[deduped,driverNames])
  const breaking       = useMemo(()=>deduped.filter(s=>s.is_breaking),[deduped])

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', position:'relative' }}>
      <style>{CSS}</style>
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', opacity:.5 }}><BgCanvas /></div>
      <Header />

      <div style={{ position:'relative', zIndex:1, paddingTop:'var(--header-h)' }}>
        <div className="pg">

          {/* ── MASTHEAD ── */}
          <motion.header className="mast" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:.4}} style={{display:'block'}}>

            {/* Centered title */}
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div className="eyebrow" style={{ justifyContent:'center', marginBottom:12 }}>
                <div className="eyebrow-line" />
                <span className="eyebrow-text">F1 BULLETIN INTELLIGENCE · 2026 SEASON</span>
                <div className="eyebrow-line" style={{ transform:'scaleX(-1)' }} />
              </div>
              <h1 className="mast-title">
                <span style={{ color:'ffff' }}>WHAT’S</span>{' '}
                <span style={{ color:'#E10600' }}>HAPPENING</span>
              </h1>
              <p className="mast-copy" style={{ margin:'10px auto 0', maxWidth:500, textAlign:'center' }}>
                Stories, narratives and driver sentiment from across the F1 media landscape.
              </p>
            </div>

            {/* Tabs + race pill */}
            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:24, alignItems:'center' }}>
              <div>
                <div className="tabs">
                  <div className="tgrp">
                    {([
                      { key:'stories', label:'STORIES',     count:deduped.length },
                      { key:'drivers', label:'DRIVERS',      count:drivers.length },
                      { key:'teams',   label:'CONSTRUCTORS', count:teams.length },
                    ] as const).map(t => (
                      <button key={t.key} className={`tbtn${mainTab===t.key?' on':''}`} onClick={()=>{ setMainTab(t.key); if(t.key==='drivers') setIntelTab('driver'); if(t.key==='teams') setIntelTab('team') }}>
                        {t.label}<span className="tcnt">{t.count||'—'}</span>
                      </button>
                    ))}
                  </div>
                  {mainTab !== 'stories' && (
                    <>
                      <div className="tdiv" />
                      <div className="tgrp">
                        {(['race','14','30'] as WindowMode[]).map(w => {
                          const isRace = w==='race'
                          const label  = isRace ? (currentRace?.live?'LIVE WINDOW':'RACE WINDOW') : w==='14'?'14 DAYS':'30 DAYS'
                          const disabled = isRace&&!currentRace
                          return (
                            <button key={w} className={`tbtn${winMode===w?' on':''}`}
                              onClick={()=>{ if(!disabled) setWinMode(w) }}
                              style={{ opacity:disabled?.35:1, cursor:disabled?'default':'pointer' }}>
                              {label}
                              {isRace&&currentRace&&!currentRace.live&&<span className="tcnt">{currentRace.daysUntil}d</span>}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mast-right" style={{ minWidth:280 }}>
                {currentRace && (
                  <div className="race-pill">
                    <div className="race-flag">{currentRace.race.flag}</div>
                    <div>
                      <div className="race-kicker">
                        {currentRace.live?'LIVE WEEKEND':'NEXT RACE'} · R{currentRace.race.round}
                        {currentRace.race.sprint&&<span className="race-sprint"> SPRINT</span>}
                      </div>
                      <div className="race-name">{currentRace.race.shortName}</div>
                      <div className="race-meta">{currentRace.race.city} · {new Date(currentRace.race.race).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </motion.header>

          {/* ── STORIES TAB ── */}
          <AnimatePresence mode="wait">
            {mainTab==='stories' && (
              <motion.div key="stories" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.22}} style={{display:'grid',gap:24}}>

                {/* Breaking banner */}
                <BreakingBanner stories={breaking} />

                {/* ── HERO: full-width carousel ── */}
                {storiesLoading
                  ? <div className="sk" style={{height:280,borderRadius:18}}/>
                  : <StoryCarousel stories={deduped.slice(0,8)} onDriverClick={handleDriverTagClick}/>
                }

                {/* ── BRIEFING STRIP — horizontal, full width, editorial ── */}
                {!storiesLoading && briefing && (
                  <EditorialBriefing briefing={briefing} currentRace={currentRace}/>
                )}
                {storiesLoading && <div className="sk" style={{height:90,borderRadius:14}}/>}

                {/* ── CLUSTERS — two-column magazine grid ── */}
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                    <div style={{width:3,height:16,borderRadius:2,background:'var(--red)'}}/>
                    <span style={{fontSize:8,fontFamily:'var(--font-mono)',letterSpacing:'.2em',color:'rgba(255,255,255,.4)'}}>NARRATIVE CLUSTERS</span>
                    {clusters.length>0&&<span style={{fontSize:8,fontFamily:'var(--font-mono)',color:'rgba(255,255,255,.25)',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',padding:'1px 7px',borderRadius:999}}>{clusters.length} ACTIVE</span>}
                    <div style={{flex:1,height:1,background:'linear-gradient(90deg,rgba(255,255,255,.07),transparent)'}}/>
                  </div>
                  {storiesLoading ? (
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>{Array(4).fill(null).map((_,i)=><div key={i} className="sk" style={{height:120,borderRadius:14}}/>)}</div>
                  ) : clusters.length===0 ? (
                    <div style={{padding:'40px',textAlign:'center',border:'1px solid rgba(255,255,255,.06)',borderRadius:14,color:'rgba(255,255,255,.3)',fontSize:12}}>No stories found.</div>
                  ) : (
                    <ClusterGrid clusters={clusters} driverSentiment={driverSentMap} onDriverClick={handleDriverTagClick}/>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── DRIVERS / TEAMS ── */}
            {(mainTab==='drivers'||mainTab==='teams') && (
              <motion.div key="intel" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.22}} style={{display:'grid',gap:16}}>

                {/* Highlights strip */}
                {!intelLoading && (rising || hottest) && (
                  <div style={{
                    display:'flex', alignItems:'center', gap:0,
                    border:'1px solid rgba(255,255,255,.07)', borderRadius:12,
                    overflow:'hidden', background:'rgba(0,0,0,.2)',
                  }}>
                    <div style={{padding:'10px 16px',borderRight:'1px solid rgba(255,255,255,.06)',flexShrink:0}}>
                      <div style={{fontSize:7,fontFamily:'var(--font-mono)',letterSpacing:'.16em',color:'rgba(255,255,255,.3)',marginBottom:2}}>SNAPSHOT</div>
                      <div style={{fontSize:8,fontFamily:'var(--font-mono)',color:'rgba(255,255,255,.2)',letterSpacing:'.08em'}}>{days}d window</div>
                    </div>
                    {rising && (
                      <div style={{padding:'10px 18px',borderRight:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:3,height:28,borderRadius:2,background:col(rising.driverName),flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:7,fontFamily:'var(--font-mono)',letterSpacing:'.14em',color:'#22c55e',marginBottom:2}}>↑ RISING</div>
                          <div style={{fontFamily:'var(--font-bebas)',fontSize:16,color:col(rising.driverName),letterSpacing:'.04em',lineHeight:1}}>{rising.driverName}</div>
                          <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'#22c55e'}}>{sign(rising.sentimentDelta)}</div>
                        </div>
                      </div>
                    )}
                    {hottest && (
                      <div style={{padding:'10px 18px',borderRight:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:3,height:28,borderRadius:2,background:col(hottest.driverName),flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:7,fontFamily:'var(--font-mono)',letterSpacing:'.14em',color:'#f59e0b',marginBottom:2}}>⚡ MOST DISCUSSED</div>
                          <div style={{fontFamily:'var(--font-bebas)',fontSize:16,color:col(hottest.driverName),letterSpacing:'.04em',lineHeight:1}}>{hottest.driverName}</div>
                          <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'rgba(255,255,255,.3)'}}>{hottest.mentions} mentions</div>
                        </div>
                      </div>
                    )}
                    {enriched.filter(e=>e.controversyScore>=40).slice(0,1).map(e=>(
                      <div key={e.driverName} style={{padding:'10px 18px',display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:3,height:28,borderRadius:2,background:col(e.driverName),flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:7,fontFamily:'var(--font-mono)',letterSpacing:'.14em',color:'#ef4444',marginBottom:2}}>🔥 UNDER PRESSURE</div>
                          <div style={{fontFamily:'var(--font-bebas)',fontSize:16,color:col(e.driverName),letterSpacing:'.04em',lineHeight:1}}>{e.driverName}</div>
                          <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'rgba(255,255,255,.3)'}}>{Math.round(e.controversyScore)}/100 controversy</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* KPIs */}
                <div className="kpi-row">
                  {intelLoading ? Array(4).fill(null).map((_,i)=><div key={i} className="sk" style={{height:88,borderRadius:20}}/>) : <>
                    <KpiCard label={intelTab==='driver'?'TRACKED DRIVERS':'TRACKED CONSTRUCTORS'} value={enriched.length}                                               color="#7c8aa8"/>
                    <KpiCard label="MENTIONS IN WINDOW"                                           value={totalMentions.toLocaleString()}                               color="#f59e0b"/>
                    <KpiCard label="POSITIVE SWING"                                               value={enriched.filter(e=>(e.sentimentDelta??0)>0.02).length}       color="#22c55e" sub="gaining tone"/>
                    <KpiCard label="PRESSURE ACTIVE"                                              value={enriched.filter(e=>(e.controversyScore??0)>=35).length}      color="#ef4444" sub="on watchlist"/>
                  </>}
                </div>

                {/* Charts */}
                <div className="row-2">
                  <motion.div className="card" whileHover={{y:-2}} transition={{duration:.18}}>
                    <SectionHead label={`Momentum · ${days} day window`} />
                    <MomentumBars entities={enriched} loading={intelLoading}/>
                  </motion.div>
                  <motion.div className="card" whileHover={{y:-2}} transition={{duration:.18}}>
                    <SectionHead label="Trajectory · top 4" />
                    <OverlaidTrendChart entities={top4} seriesMap={tsMap} anomalyMap={anomalyMap}/>
                  </motion.div>
                </div>

                {/* Table + detail */}
                <div className="row-main">
                  <motion.div className="card-np" layout>
                    <TableHead tab={intelTab}/>
                    {intelLoading
                      ? Array(12).fill(null).map((_,i)=>(
                          <div key={i} style={{display:'grid',gridTemplateColumns:'28px 1fr 72px 88px 88px 50px 88px',gap:6,padding:'11px 16px',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                            {[18,130,34,48,42,16,34].map((w,j)=><div key={j} className="sk" style={{height:10,width:w}}/>)}
                          </div>
                        ))
                      : enriched.map((e,i)=>(
                          <EntityRow key={`${intelTab}-${e.driverName}`} entity={e} rank={i+1}
                            conRaw={cMap[e.driverName.toUpperCase()]} trendSig={trendSigs[e.driverName]}
                            pred={predSignals.find(p=>p.entityName===e.driverName)}
                            active={selected===e.driverName} onSelect={()=>setSelected(selected===e.driverName?null:e.driverName)}/>
                        ))
                    }
                    {!intelLoading&&enriched.length===0&&<div style={{padding:'34px',textAlign:'center',color:'rgba(255,255,255,.3)',fontSize:12}}>No data yet.</div>}
                  </motion.div>

                  <aside className="detail">
                    <AnimatePresence mode="wait" initial={false}>
                      {selEntity ? (
                        <motion.div key={selEntity.driverName} initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:10}} transition={{duration:.2}}>
                          <EntityDetail entity={selEntity} entityType={intelTab} ts={detailTs.data} tsLoading={detailTs.loading}
                            conRaw={cMap[selEntity.driverName.toUpperCase()]} sentProf={sentProfs[selEntity.driverName]}
                            conProf={conProfs[selEntity.driverName]} trendSig={trendSigs[selEntity.driverName]}
                            anomalies={anomalyMap[selEntity.driverName]??[]} arc={storyArcs[selEntity.driverName]}
                            pred={predSignals.find(p=>p.entityName===selEntity.driverName)}
                            section={detailSec} setSection={setDetailSec} days={days} onClose={()=>setSelected(null)}/>
                        </motion.div>
                      ) : (
                        <motion.div key="empty" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.18}}>
                          <EmptyDetail/>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </aside>
                </div>

                {/* Insights */}
                <InsightsPanel predSignals={predSignals} top8={top8} conProfs={conProfs} anomalyMap={anomalyMap}
                  correlations={correlations} enriched={enriched}
                  compareA={compareA} compareB={compareB} setCompareA={setCompareA} setCompareB={setCompareB} comparison={comparison}/>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
        <Footer />
      </div>
    </div>
  )
}