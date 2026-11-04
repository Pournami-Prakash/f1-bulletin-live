import { ageBands } from '@/lib/kimi-record-insights'
import styles from './records.module.css'

// Shared x-axis for the record charts: one column per race weekend, banded by Kimi's age.
export default function AgeStrip({ x, column, y }: { x: (index: number) => number; column: number; y: number }) {
  return <g className={styles.ageStrip} aria-hidden="true">
    {ageBands.map(band => {
      const left = x(band.from) - column / 2 + 1
      const right = x(band.to) + column / 2 - 1
      return <g key={band.years} data-teen={band.years < 20}>
        <rect x={left} y={y} width={Math.max(0, right - left)} height={4} rx={2} />
        <text x={left} y={y + 18}>{band.years < 20 ? `Age ${band.years} · teen` : `Age ${band.years}`}</text>
      </g>
    })}
  </g>
}
