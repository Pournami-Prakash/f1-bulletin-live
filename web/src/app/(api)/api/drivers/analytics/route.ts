// /Users/pournami/Documents/Projects/f1-bulletin/web/src/app/(api)/api/drivers/analytics/route.ts — Pure computation layer
// All functions are deterministic, side-effect free, and unit-testable.

export type TimeseriesPoint = {
  date: string
  mentions: number
  sentimentAvg: number
  positiveCount: number
  negativeCount: number
  neutralCount: number
}

export type EnrichedEntity = {
  driverName: string
  mentions: number
  sentimentAvg: number
  sentimentDelta: number
  sentimentLabel: string
  positiveCount: number
  negativeCount: number
  neutralCount: number
  topCluster: string | null
  lastDate: string | null
  controversyScore: number
  influenceScore: number
  narrativeGroup: string
  pulse: 'RISING' | 'FALLING' | 'CONTROVERSIAL' | 'MOST DISCUSSED' | 'STABLE'
}

/* ═══════════════════════════════════════════════════
   1. SENTIMENT ANALYSIS — granular breakdown
═══════════════════════════════════════════════════ */

export type SentimentProfile = {
  // Raw counts
  positive: number
  neutral: number
  negative: number
  total: number
  // Ratios
  positiveRatio: number
  neutralRatio: number
  negativeRatio: number
  // Polarity index: (pos - neg) / total  [-1, 1]
  polarityIndex: number
  // Subjectivity: (pos + neg) / total  [0, 1] — high = opinionated coverage
  subjectivity: number
  // Sentiment momentum: weighted recent vs baseline
  recentBias: 'positive' | 'negative' | 'neutral'
  // Volatility: std dev of daily sentimentAvg
  volatility: number
  // Trend acceleration: delta of delta (is momentum speeding up or slowing?)
  acceleration: number
  // Label
  label: 'strongly positive' | 'positive' | 'neutral' | 'negative' | 'strongly negative' | 'mixed'
}

export function computeSentimentProfile(
  entity: EnrichedEntity,
  timeseries: TimeseriesPoint[]
): SentimentProfile {
  const pos = entity.positiveCount ?? 0
  const neu = entity.neutralCount ?? 0
  const neg = entity.negativeCount ?? 0
  const total = Math.max(pos + neu + neg, 1)

  const polarityIndex = (pos - neg) / total
  const subjectivity = (pos + neg) / total

  // Recent bias: compare last 7 days vs full window
  const recent = timeseries.slice(-7)
  const recentPos = recent.reduce((s, d) => s + d.positiveCount, 0)
  const recentNeg = recent.reduce((s, d) => s + d.negativeCount, 0)
  const recentBias = recentPos > recentNeg * 1.3 ? 'positive' : recentNeg > recentPos * 1.3 ? 'negative' : 'neutral'

  // Volatility: std dev of sentimentAvg
  const vals = timeseries.map(d => d.sentimentAvg)
  const mean = vals.reduce((s, v) => s + v, 0) / Math.max(vals.length, 1)
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(vals.length, 1)
  const volatility = Math.sqrt(variance)

  // Acceleration: compare delta in first half vs second half of timeseries
  const mid = Math.floor(timeseries.length / 2)
  const firstHalf = timeseries.slice(0, mid).map(d => d.sentimentAvg)
  const secondHalf = timeseries.slice(mid).map(d => d.sentimentAvg)
  const d1 = firstHalf.length > 1 ? firstHalf[firstHalf.length - 1] - firstHalf[0] : 0
  const d2 = secondHalf.length > 1 ? secondHalf[secondHalf.length - 1] - secondHalf[0] : 0
  const acceleration = d2 - d1

  const pi = polarityIndex
  let label: SentimentProfile['label'] = 'neutral'
  if (subjectivity < 0.25) label = 'neutral'
  else if (pi > 0.4) label = 'strongly positive'
  else if (pi > 0.1) label = 'positive'
  else if (pi < -0.4) label = 'strongly negative'
  else if (pi < -0.1) label = 'negative'
  else label = 'mixed'

  return {
    positive: pos, neutral: neu, negative: neg, total,
    positiveRatio: pos / total, neutralRatio: neu / total, negativeRatio: neg / total,
    polarityIndex, subjectivity, recentBias, volatility, acceleration, label,
  }
}

/* ═══════════════════════════════════════════════════
   2. CONTROVERSY SCORING — richer signals
═══════════════════════════════════════════════════ */

export type ControversyProfile = {
  score: number
  components: { sentiment: number; fia: number; spike: number; media: number }
  // Derived signals
  tier: 'low' | 'moderate' | 'high' | 'critical'
  dominantDriver: 'sentiment' | 'fia' | 'spike' | 'media' | 'balanced'
  // Controversy trajectory over window
  trajectory: 'escalating' | 'de-escalating' | 'sustained' | 'new' | 'resolved'
  // Concentration: is controversy from one source or spread?
  concentration: number  // 0 = balanced, 1 = single driver
  // Weekly delta
  weeklyDelta: number
}

export function computeControversyProfile(
  score: number,
  components: { sentiment?: number; fia?: number; spike?: number; media?: number } | undefined,
  controversyTrend?: string,
  controversyDelta?: number
): ControversyProfile {
  const s = components?.sentiment ?? 0
  const f = components?.fia ?? 0
  const sp = components?.spike ?? 0
  const m = components?.media ?? 0
  const vals = [s, f, sp, m]
  const sum = vals.reduce((a, b) => a + b, 0) || 1

  // Tier
  const tier: ControversyProfile['tier'] =
    score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'moderate' : 'low'

  // Dominant driver — which component contributes most?
  const labels = ['sentiment', 'fia', 'spike', 'media'] as const
  const maxVal = Math.max(...vals)
  const maxIdx = vals.indexOf(maxVal)
  const dominantDriver: ControversyProfile['dominantDriver'] =
    maxVal > sum * 0.45 ? labels[maxIdx] : 'balanced'

  // Concentration (Herfindahl-style)
  const shares = vals.map(v => v / sum)
  const concentration = shares.reduce((acc, share) => acc + share ** 2, 0)

  // Trajectory
  const t = (controversyTrend ?? '').toLowerCase()
  const delta = controversyDelta ?? 0
  const trajectory: ControversyProfile['trajectory'] =
    t.includes('escal') || delta > 10 ? 'escalating'
    : t.includes('de-escal') || delta < -10 ? 'de-escalating'
    : score > 50 && Math.abs(delta) < 5 ? 'sustained'
    : score < 20 ? 'resolved'
    : 'new'

  return {
    score, components: { sentiment: s, fia: f, spike: sp, media: m },
    tier, dominantDriver, trajectory,
    concentration: clamp(concentration, 0, 1),
    weeklyDelta: delta,
  }
}

/* ═══════════════════════════════════════════════════
   3. TREND DETECTION — velocity, momentum shifts
═══════════════════════════════════════════════════ */

export type TrendSignal = {
  // Velocity: rate of change per day (mentions)
  mentionVelocity: number
  sentimentVelocity: number
  // Momentum: exponentially weighted moving average (recent weighted more)
  ewmaMentions: number
  ewmaSentiment: number
  // Breakout: did this week significantly exceed baseline?
  mentionBreakout: boolean
  sentimentBreakout: boolean
  breakoutMagnitude: number   // σ above/below baseline
  // Trend phase
  phase: 'breakout' | 'peak' | 'declining' | 'recovery' | 'stable' | 'emerging'
  // Days since last significant spike
  daysSinceSpike: number | null
  // Direction confidence [0,1]
  confidence: number
}

export function computeTrendSignal(timeseries: TimeseriesPoint[]): TrendSignal {
  if (timeseries.length < 3) {
    return {
      mentionVelocity: 0, sentimentVelocity: 0,
      ewmaMentions: 0, ewmaSentiment: 0,
      mentionBreakout: false, sentimentBreakout: false,
      breakoutMagnitude: 0, phase: 'stable',
      daysSinceSpike: null, confidence: 0,
    }
  }

  const sorted = [...timeseries].sort((a, b) => a.date.localeCompare(b.date))
  const n = sorted.length

  // Velocity: linear regression slope over last 14 days
  const window = sorted.slice(-14)
  const mentionSlope = linearSlope(window.map(d => d.mentions))
  const sentSlope = linearSlope(window.map(d => d.sentimentAvg))

  // EWMA (α=0.3 weights recent more)
  const α = 0.3
  let ewmaM = sorted[0].mentions
  let ewmaS = sorted[0].sentimentAvg
  for (const pt of sorted.slice(1)) {
    ewmaM = α * pt.mentions + (1 - α) * ewmaM
    ewmaS = α * pt.sentimentAvg + (1 - α) * ewmaS
  }

  // Breakout: compare last 7 days to baseline (days 8-30)
  const recent7 = sorted.slice(-7)
  const baseline = sorted.slice(0, Math.max(n - 7, 1))
  const bMean = mean(baseline.map(d => d.mentions))
  const bStd = std(baseline.map(d => d.mentions))
  const rMean = mean(recent7.map(d => d.mentions))
  const magnitude = bStd > 0 ? (rMean - bMean) / bStd : 0
  const mentionBreakout = magnitude > 1.5

  const bSentMean = mean(baseline.map(d => d.sentimentAvg))
  const bSentStd = std(baseline.map(d => d.sentimentAvg))
  const rSentMean = mean(recent7.map(d => d.sentimentAvg))
  const sentMagnitude = bSentStd > 0 ? (rSentMean - bSentMean) / bSentStd : 0
  const sentimentBreakout = Math.abs(sentMagnitude) > 1.5

  // Days since spike
  const spikeThreshold = bMean + 1.5 * bStd
  let daysSinceSpike: number | null = null
  for (let i = n - 1; i >= 0; i--) {
    if (sorted[i].mentions > spikeThreshold) { daysSinceSpike = n - 1 - i; break }
  }

  // Phase determination
  const last3 = sorted.slice(-3).map(d => d.mentions)
  const prev3 = sorted.slice(-6, -3).map(d => d.mentions)
  const l3mean = mean(last3), p3mean = mean(prev3)
  let phase: TrendSignal['phase'] = 'stable'
  if (mentionBreakout && mentionSlope > 0) phase = 'breakout'
  else if (mentionBreakout && mentionSlope <= 0) phase = 'peak'
  else if (!mentionBreakout && l3mean < p3mean * 0.7) phase = 'declining'
  else if (!mentionBreakout && l3mean > p3mean * 1.3 && !mentionBreakout) phase = 'emerging'
  else if (sentimentBreakout && rSentMean > bSentMean) phase = 'recovery'

  // Confidence: consistency of direction in last 7 days
  const dirs = recent7.slice(1).map((d, i) => d.mentions > recent7[i].mentions ? 1 : -1)
  const consistency = Math.abs(dirs.reduce((s, v) => s + v, 0)) / Math.max(dirs.length, 1)

  return {
    mentionVelocity: mentionSlope,
    sentimentVelocity: sentSlope,
    ewmaMentions: ewmaM,
    ewmaSentiment: ewmaS,
    mentionBreakout,
    sentimentBreakout,
    breakoutMagnitude: magnitude,
    phase,
    daysSinceSpike,
    confidence: consistency,
  }
}

/* ═══════════════════════════════════════════════════
   4. ANOMALY DETECTION — spikes, drops, outliers
═══════════════════════════════════════════════════ */

export type Anomaly = {
  date: string
  type: 'spike' | 'drop' | 'sentiment_reversal' | 'silence' | 'sentiment_spike'
  magnitude: number      // σ from baseline
  value: number
  baseline: number
  severity: 'low' | 'medium' | 'high'
  description: string
}

export function detectAnomalies(timeseries: TimeseriesPoint[]): Anomaly[] {
  if (timeseries.length < 5) return []
  const sorted = [...timeseries].sort((a, b) => a.date.localeCompare(b.date))
  const anomalies: Anomaly[] = []

  const mVals = sorted.map(d => d.mentions)
  const sVals = sorted.map(d => d.sentimentAvg)
  const mMean = mean(mVals), mStd = std(mVals)
  const sMean = mean(sVals), sStd = std(sVals)

  sorted.forEach((pt, i) => {
    if (i === 0) return

    // Mention spike
    const mZ = mStd > 0 ? (pt.mentions - mMean) / mStd : 0
    if (mZ > 2.0) {
      anomalies.push({
        date: pt.date, type: 'spike', magnitude: mZ,
        value: pt.mentions, baseline: mMean,
        severity: mZ > 3.5 ? 'high' : mZ > 2.5 ? 'medium' : 'low',
        description: `${Math.round(mZ * 10) / 10}σ mention surge (${pt.mentions} vs avg ${Math.round(mMean)})`,
      })
    }

    // Mention drop
    if (mZ < -1.5 && pt.mentions < mMean * 0.4) {
      anomalies.push({
        date: pt.date, type: 'drop', magnitude: Math.abs(mZ),
        value: pt.mentions, baseline: mMean,
        severity: Math.abs(mZ) > 2.5 ? 'high' : 'medium',
        description: `Mention drop to ${pt.mentions} (${Math.round(Math.abs(mZ) * 10) / 10}σ below avg)`,
      })
    }

    // Sentiment reversal: previous day opposite sign, large swing
    const prev = sorted[i - 1]
    const swing = Math.abs(pt.sentimentAvg - prev.sentimentAvg)
    if (swing > 0.3 && Math.sign(pt.sentimentAvg) !== Math.sign(prev.sentimentAvg)) {
      anomalies.push({
        date: pt.date, type: 'sentiment_reversal', magnitude: swing / Math.max(sStd, 0.01),
        value: pt.sentimentAvg, baseline: prev.sentimentAvg,
        severity: swing > 0.5 ? 'high' : 'medium',
        description: `Sentiment reversal: ${sign2(prev.sentimentAvg)} → ${sign2(pt.sentimentAvg)} (Δ${swing.toFixed(3)})`,
      })
    }

    // Sentiment spike (extreme polarity without matching reversal)
    const sZ = sStd > 0 ? Math.abs(pt.sentimentAvg - sMean) / sStd : 0
    if (sZ > 2.2 && !(Math.sign(pt.sentimentAvg) !== Math.sign(prev.sentimentAvg) && swing > 0.3)) {
      anomalies.push({
        date: pt.date, type: 'sentiment_spike', magnitude: sZ,
        value: pt.sentimentAvg, baseline: sMean,
        severity: sZ > 3 ? 'high' : 'medium',
        description: `Extreme sentiment ${pt.sentimentAvg > 0 ? 'positive' : 'negative'} (${sZ.toFixed(1)}σ)`,
      })
    }
  })

  // Silence detection: 3+ consecutive days near-zero mentions after high activity
  for (let i = 3; i < sorted.length; i++) {
    const window3 = sorted.slice(i - 3, i)
    const allSilent = window3.every(d => d.mentions < mMean * 0.2)
    const prevActive = i >= 4 && sorted[i - 4].mentions > mMean
    if (allSilent && prevActive) {
      anomalies.push({
        date: sorted[i - 1].date, type: 'silence', magnitude: 2,
        value: mean(window3.map(d => d.mentions)), baseline: mMean,
        severity: 'medium',
        description: `3-day silence after active period`,
      })
    }
  }

  // Deduplicate by date+type, keep highest magnitude
  const seen = new Map<string, Anomaly>()
  for (const a of anomalies) {
    const key = `${a.date}:${a.type}`
    const existing = seen.get(key)
    if (!existing || a.magnitude > existing.magnitude) seen.set(key, a)
  }

  return [...seen.values()].sort((a, b) => b.magnitude - a.magnitude).slice(0, 12)
}

/* ═══════════════════════════════════════════════════
   5. PREDICTIVE SIGNALS — who's about to trend
═══════════════════════════════════════════════════ */

export type PredictiveSignal = {
  entityName: string
  // Pre-trend indicators
  earlyMomentum: number        // velocity acceleration in last 3 days
  sentimentBuildup: number     // sentiment climbing toward breakout threshold
  mentionRampRate: number      // % increase week-over-week
  // Combined pre-trend score [0,100]
  preTrendScore: number
  // Predicted direction
  predictedDirection: 'up' | 'down' | 'neutral'
  // Signal type
  signal: 'pre_breakout' | 'sentiment_shift' | 'cooling' | 'recovery' | 'watch' | 'stable'
  // Confidence [0,1]
  confidence: number
  reason: string
}

export function computePredictiveSignal(
  entity: EnrichedEntity,
  timeseries: TimeseriesPoint[]
): PredictiveSignal {
  const sorted = [...timeseries].sort((a, b) => a.date.localeCompare(b.date))
  const n = sorted.length

  if (n < 5) {
    return {
      entityName: entity.driverName,
      earlyMomentum: 0, sentimentBuildup: 0, mentionRampRate: 0,
      preTrendScore: 0, predictedDirection: 'neutral',
      signal: 'stable', confidence: 0,
      reason: 'Insufficient data',
    }
  }

  // Early momentum: velocity of velocity (last 3 vs prior 3)
  const last3M = sorted.slice(-3).map(d => d.mentions)
  const prev3M = sorted.slice(-6, -3).map(d => d.mentions)
  const earlyMomentum = mean(last3M) - mean(prev3M)

  // Sentiment buildup: is sentiment trending toward extremes?
  const last5S = sorted.slice(-5).map(d => d.sentimentAvg)
  const sentimentSlope = linearSlope(last5S)
  const currentSentiment = last5S[last5S.length - 1]
  const sentimentBuildup = Math.abs(sentimentSlope) * 10 + Math.abs(currentSentiment) * 5

  // Mention ramp rate: week-over-week %
  const thisWeek = mean(sorted.slice(-7).map(d => d.mentions))
  const lastWeek = mean(sorted.slice(-14, -7).map(d => d.mentions))
  const mentionRampRate = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : 0

  // Pre-trend score
  const rampScore = clamp(mentionRampRate / 2, 0, 40)
  const momScore  = clamp(earlyMomentum * 2, 0, 30)
  const sentScore = clamp(sentimentBuildup * 2, 0, 30)
  const preTrendScore = Math.round(rampScore + momScore + sentScore)

  // Direction
  const predictedDirection: PredictiveSignal['predictedDirection'] =
    sentimentSlope > 0.02 && earlyMomentum > 0 ? 'up'
    : sentimentSlope < -0.02 && earlyMomentum < 0 ? 'down'
    : 'neutral'

  // Signal classification
  let signal: PredictiveSignal['signal'] = 'stable'
  let reason = 'No significant signals detected'

  if (preTrendScore > 60 && predictedDirection === 'up') {
    signal = 'pre_breakout'; reason = `Mention ramp +${mentionRampRate.toFixed(0)}% WoW with positive sentiment building`
  } else if (Math.abs(sentimentSlope) > 0.05) {
    signal = 'sentiment_shift'; reason = `Rapid sentiment shift ${sentimentSlope > 0 ? 'positive' : 'negative'} (${sentimentSlope.toFixed(3)}/day)`
  } else if (mentionRampRate < -30 && entity.mentions > 20) {
    signal = 'cooling'; reason = `Mention volume down ${Math.abs(mentionRampRate).toFixed(0)}% week-over-week`
  } else if (entity.sentimentDelta > 0.1 && entity.mentions < mean(sorted.map(d => d.mentions)) * 0.6) {
    signal = 'recovery'; reason = `Sentiment recovering (+${entity.sentimentDelta.toFixed(3)}) on lower-than-average mentions`
  } else if (preTrendScore > 35) {
    signal = 'watch'; reason = `Early momentum building, monitoring for confirmation`
  }

  const confidence = clamp(preTrendScore / 100, 0, 1)

  return {
    entityName: entity.driverName,
    earlyMomentum, sentimentBuildup, mentionRampRate,
    preTrendScore, predictedDirection, signal, confidence, reason,
  }
}

/* ═══════════════════════════════════════════════════
   6. CROSS-ENTITY CORRELATION — co-mention patterns
═══════════════════════════════════════════════════ */

export type EntityCorrelation = {
  entityA: string
  entityB: string
  // Pearson correlation of daily mention counts [-1, 1]
  mentionCorrelation: number
  // Pearson correlation of daily sentiment [-1, 1]
  sentimentCorrelation: number
  // Combined correlation score
  combinedScore: number
  // Interpretation
  relationship: 'rivals' | 'co-trending' | 'inverse' | 'independent' | 'narrative-linked'
  strength: 'strong' | 'moderate' | 'weak'
}

export function computeCorrelationMatrix(
  entities: EnrichedEntity[],
  seriesMap: Record<string, TimeseriesPoint[]>
): EntityCorrelation[] {
  const results: EntityCorrelation[] = []
  const names = entities.map(e => e.driverName)

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j]
      const sa = (seriesMap[a] ?? []).sort((x, y) => x.date.localeCompare(y.date))
      const sb = (seriesMap[b] ?? []).sort((x, y) => x.date.localeCompare(y.date))

      // Align by date
      const datesA = new Set(sa.map(d => d.date))
      const datesB = new Set(sb.map(d => d.date))
      const shared = [...datesA].filter(d => datesB.has(d)).sort()
      if (shared.length < 5) continue

      const mapA = Object.fromEntries(sa.map(d => [d.date, d]))
      const mapB = Object.fromEntries(sb.map(d => [d.date, d]))
      const mA = shared.map(d => mapA[d].mentions)
      const mB = shared.map(d => mapB[d].mentions)
      const sA = shared.map(d => mapA[d].sentimentAvg)
      const sB = shared.map(d => mapB[d].sentimentAvg)

      const mc = pearson(mA, mB)
      const sc = pearson(sA, sB)
      const combined = (mc * 0.6 + sc * 0.4)

      const relationship: EntityCorrelation['relationship'] =
        mc > 0.6 && sc < -0.3 ? 'rivals'
        : mc > 0.5 && sc > 0.4 ? 'narrative-linked'
        : mc > 0.5 ? 'co-trending'
        : mc < -0.3 ? 'inverse'
        : 'independent'

      const abs = Math.abs(combined)
      const strength: EntityCorrelation['strength'] =
        abs > 0.6 ? 'strong' : abs > 0.35 ? 'moderate' : 'weak'

      results.push({ entityA: a, entityB: b, mentionCorrelation: mc, sentimentCorrelation: sc, combinedScore: combined, relationship, strength })
    }
  }

  return results.sort((a, b) => Math.abs(b.combinedScore) - Math.abs(a.combinedScore))
}

/* ═══════════════════════════════════════════════════
   7. STORY ARC TRACKING — narrative phases over time
═══════════════════════════════════════════════════ */

export type StoryArc = {
  phase: 'ignition' | 'amplification' | 'peak' | 'resolution' | 'dormant' | 'resurgence'
  startDate: string
  peakDate: string | null
  peakMentions: number
  currentIntensity: number   // 0–100
  sentimentArc: 'improving' | 'worsening' | 'volatile' | 'flat'
  // Story beats: discrete events in the narrative
  beats: StoryBeat[]
  // Estimated time-to-resolution (days) or null if escalating
  estimatedResolutionDays: number | null
  narrative: string
}

export type StoryBeat = {
  date: string
  type: 'spike' | 'sentiment_shift' | 'peak' | 'trough' | 'recovery'
  description: string
  intensity: number
}

export function computeStoryArc(
  entity: EnrichedEntity,
  timeseries: TimeseriesPoint[],
  anomalies: Anomaly[]
): StoryArc {
  const sorted = [...timeseries].sort((a, b) => a.date.localeCompare(b.date))
  const n = sorted.length

  if (n < 3) {
    return {
      phase: 'dormant', startDate: '', peakDate: null, peakMentions: 0,
      currentIntensity: 0, sentimentArc: 'flat', beats: [],
      estimatedResolutionDays: null, narrative: 'Insufficient data for arc analysis.',
    }
  }

  const mVals = sorted.map(d => d.mentions)
  const allMean = mean(mVals)
  const maxM = Math.max(...mVals)
  const maxIdx = mVals.indexOf(maxM)
  const peakDate = sorted[maxIdx]?.date ?? null
  const recent7 = mean(sorted.slice(-7).map(d => d.mentions))
  const currentIntensity = clamp((recent7 / Math.max(maxM, 1)) * 100, 0, 100)

  // Phase detection
  const ramp = sorted.slice(-7)
  const rampSlope = linearSlope(ramp.map(d => d.mentions))
  let phase: StoryArc['phase'] = 'dormant'
  if (recent7 < allMean * 0.3) phase = 'dormant'
  else if (rampSlope > 2 && recent7 < maxM * 0.6) phase = 'ignition'
  else if (rampSlope > 1 && recent7 > allMean) phase = 'amplification'
  else if (currentIntensity > 70) phase = 'peak'
  else if (rampSlope < -1 && recent7 < maxM * 0.5) phase = 'resolution'
  else if (rampSlope > 0.5 && maxIdx < n - 10) phase = 'resurgence'

  // Sentiment arc
  const s7 = mean(sorted.slice(-7).map(d => d.sentimentAvg))
  const s_prev7 = mean(sorted.slice(-14, -7).map(d => d.sentimentAvg))
  const sVol = std(sorted.slice(-14).map(d => d.sentimentAvg))
  const sentimentArc: StoryArc['sentimentArc'] =
    sVol > 0.15 ? 'volatile'
    : s7 > s_prev7 + 0.05 ? 'improving'
    : s7 < s_prev7 - 0.05 ? 'worsening'
    : 'flat'

  // Story beats from anomalies
  const beats: StoryBeat[] = anomalies.slice(0, 5).map(a => ({
    date: a.date,
    type: a.type === 'spike' ? 'spike'
      : a.type === 'drop' ? 'trough'
      : a.type === 'sentiment_reversal' ? 'sentiment_shift'
      : a.type === 'sentiment_spike' ? 'sentiment_shift'
      : 'recovery',
    description: a.description,
    intensity: clamp(a.magnitude * 25, 0, 100),
  }))

  // Estimated resolution
  let estimatedResolutionDays: number | null = null
  if (phase === 'resolution' || phase === 'peak') {
    const decayRate = Math.abs(rampSlope)
    const distanceToBaseline = recent7 - allMean * 0.4
    estimatedResolutionDays = decayRate > 0 ? Math.round(distanceToBaseline / decayRate) : null
  }

  // Narrative summary
  const arcDescriptions: Record<StoryArc['phase'], string> = {
    ignition: 'Story gaining traction — early momentum building',
    amplification: 'Narrative spreading — coverage intensifying',
    peak: 'At maximum visibility — story fully mainstream',
    resolution: 'Coverage winding down — narrative concluding',
    dormant: 'No active story — baseline monitoring only',
    resurgence: 'Revived narrative — renewed interest after quiet period',
  }
  const narrative = `${arcDescriptions[phase]}. Sentiment ${sentimentArc}.${estimatedResolutionDays ? ` Est. ~${estimatedResolutionDays}d to resolution.` : ''}`

  return {
    phase,
    startDate: sorted[0]?.date ?? '',
    peakDate,
    peakMentions: maxM,
    currentIntensity,
    sentimentArc,
    beats,
    estimatedResolutionDays,
    narrative,
  }
}

/* ═══════════════════════════════════════════════════
   8. ENTITY COMPARISON — side-by-side
═══════════════════════════════════════════════════ */

export type ComparisonResult = {
  entityA: string
  entityB: string
  dimensions: ComparisonDimension[]
  winner: string | 'tied'
  summary: string
}

export type ComparisonDimension = {
  label: string
  valueA: number
  valueB: number
  unit: string
  winner: string | 'tied'
  gap: number       // absolute difference
  gapPct: number    // % difference
}

export function compareEntities(
  a: EnrichedEntity, b: EnrichedEntity,
  controversyA?: { score: number }, controversyB?: { score: number },
  sentimentA?: SentimentProfile, sentimentB?: SentimentProfile,
  trendA?: TrendSignal, trendB?: TrendSignal,
): ComparisonResult {
  const dim = (
    label: string, vA: number, vB: number, unit = '',
    higherIsBetter = true
  ): ComparisonDimension => {
    const max = Math.max(Math.abs(vA), Math.abs(vB), 0.001)
    const gap = vA - vB
    const gapPct = (Math.abs(gap) / max) * 100
    const winner = Math.abs(gap) < max * 0.02 ? 'tied'
      : (higherIsBetter ? gap > 0 : gap < 0) ? a.driverName : b.driverName
    return { label, valueA: vA, valueB: vB, unit, winner, gap, gapPct }
  }

  const dimensions: ComparisonDimension[] = [
    dim('MENTIONS',       a.mentions,                   b.mentions,                  '', true),
    dim('INFLUENCE',      a.influenceScore,              b.influenceScore,             '/100', true),
    dim('SENTIMENT AVG',  a.sentimentAvg,                b.sentimentAvg,               '', true),
    dim('SENTIMENT Δ',    a.sentimentDelta,              b.sentimentDelta,             '', true),
    dim('CONTROVERSY',    controversyA?.score ?? 0,      controversyB?.score ?? 0,    '/100', false),
    dim('POLARITY',       sentimentA?.polarityIndex ?? 0, sentimentB?.polarityIndex ?? 0, '', true),
    dim('VOLATILITY',     sentimentA?.volatility ?? 0,   sentimentB?.volatility ?? 0, '', false),
    dim('VELOCITY',       trendA?.mentionVelocity ?? 0,  trendB?.mentionVelocity ?? 0, '/day', true),
  ]

  const wins = dimensions.filter(d => d.winner === a.driverName).length
  const winner = wins > dimensions.length / 2 ? a.driverName
    : wins < dimensions.length / 2 ? b.driverName : 'tied'

  const summary = winner === 'tied'
    ? `${a.driverName} and ${b.driverName} are evenly matched across tracked dimensions.`
    : `${winner} leads on ${dimensions.filter(d => d.winner === winner).length}/${dimensions.length} dimensions.`

  return { entityA: a.driverName, entityB: b.driverName, dimensions, winner, summary }
}

/* ═══════════════════════════════════════════════════
   MATH HELPERS
═══════════════════════════════════════════════════ */
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function mean(arr: number[]) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0 }
function std(arr: number[]) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}
function linearSlope(arr: number[]) {
  const n = arr.length
  if (n < 2) return 0
  const xs = arr.map((_, i) => i)
  const xm = mean(xs), ym = mean(arr)
  const num = xs.reduce((s, x, i) => s + (x - xm) * (arr[i] - ym), 0)
  const den = xs.reduce((s, x) => s + (x - xm) ** 2, 0)
  return den === 0 ? 0 : num / den
}
function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length)
  if (n < 3) return 0
  const am = mean(a.slice(0, n)), bm = mean(b.slice(0, n))
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const ai = a[i] - am, bi = b[i] - bm
    num += ai * bi; da += ai * ai; db += bi * bi
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db)
}
function sign2(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(3)}` }
