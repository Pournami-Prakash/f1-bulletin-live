import type { CSSProperties } from 'react'
import type { ChampionshipDriver } from '@/lib/championship'
import styles from './championship.module.css'

const points = (n: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n)

export default function PointsRunway({ drivers, leader, names, color, selected, expanded, onDriver }: {
  drivers: ChampionshipDriver[]
  leader: ChampionshipDriver | undefined
  names: Record<string, string>
  color: (team: string) => string
  selected: string
  expanded: boolean
  onDriver: (code: string) => void
}) {
  const ceiling = Math.max(1, ...drivers.map(d => d.maximum_points))
  const x = (value: number) => 20 + value / ceiling * 600
  const leaderX = x(leader?.current_points ?? 0)
  return <div className={styles.pointsChart} role="group" aria-label="Championship points and remaining potential">
    <div className={styles.pointsLegend} id="points-chart-legend">
      <span><i className={styles.recordedKey} />Recorded points</span>
      <span><i className={styles.potentialKey} />Still available</span>
      <span><i className={styles.leaderKey} />Leader’s current total</span>
    </div>
    <div className={styles.pointsAxis} aria-hidden="true"><svg viewBox="0 0 640 30">
      {[0, ceiling / 2, ceiling].map((value, i) => <text key={i} x={x(value)} y="20" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{points(value)}{i === 2 ? ' pts' : ''}</text>)}
    </svg></div>
    {drivers.map(d => {
      const currentX = x(d.current_points), maximumX = x(d.maximum_points)
      const gap = (leader?.current_points ?? d.current_points) - d.current_points
      const pattern = `points-potential-${d.driver_code}`
      const name = names[d.driver_code] ?? d.driver_code
      return <button key={d.driver_code} className={styles.pointsRow}
        style={{ '--team': color(d.team) } as CSSProperties}
        aria-label={`Explore ${name} championship outlook`} aria-describedby="points-chart-legend"
        aria-controls="season-explorer" aria-expanded={expanded && selected === d.driver_code}
        onClick={() => onDriver(d.driver_code)}>
        <span className={styles.pointsIdentity}><b>{name}</b><small>{d.team}{names[d.driver_code] ? ` · ${d.driver_code}` : ''}</small></span>
        <span className={styles.pointsRunway} role="img" aria-label={`${name}: ${points(d.current_points)} recorded points, ${points(d.maximum_points)} maximum total; leader has ${points(leader?.current_points ?? 0)} points`}>
          <svg viewBox="0 0 640 84" aria-hidden="true" focusable="false">
            <defs><pattern id={pattern} width="12" height="12" patternUnits="userSpaceOnUse"><path d="M-3 3L3-3M0 12L12 0M9 15L15 9" stroke="var(--team)" strokeWidth="2" opacity=".5" /></pattern></defs>
            <line x1="20" x2="620" y1="40" y2="40" className={styles.pointsBaseline} />
            {d.maximum_points > d.current_points && <rect x={currentX} y="32" width={maximumX - currentX} height="16" fill={`url(#${pattern})`} stroke="var(--team)" strokeOpacity=".65" />}
            <rect x="20" y="32" width={Math.max(0, currentX - 20)} height="16" fill="var(--team)" />
            <line x1={leaderX} x2={leaderX} y1="25" y2="55" className={styles.pointsLeader} />
            <circle cx={currentX} cy="40" r="4" fill="var(--team)" stroke="var(--bg)" strokeWidth="2" />
            <text x={currentX} y="19" textAnchor={currentX > 540 ? 'end' : 'start'} className={styles.recordedLabel}>{points(d.current_points)} now</text>
            {d.maximum_points > d.current_points && <><line x1={maximumX} x2={maximumX} y1="28" y2="52" stroke="var(--team)" /><text x={maximumX} y="75" textAnchor={maximumX > 110 ? 'end' : 'start'}>{points(d.maximum_points)} maximum</text></>}
          </svg>
        </span>
        <span className={styles.pointsGap}><b>{d.driver_code === leader?.driver_code ? 'Leader' : `−${points(gap)} pts`}</b><small>{d.driver_code === leader?.driver_code ? 'Sets the target' : `Gain +${points(Math.floor(gap) + 1)} net to pass leader`}</small></span>
      </button>
    })}
  </div>
}
