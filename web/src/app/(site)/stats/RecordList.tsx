import { recordGroups, recordInsights, recordScopes } from '@/lib/kimi-record-insights'
import { recordClaims } from '@/lib/record-atlas'
import styles from './records.module.css'

const scopeLabel = Object.fromEntries(recordScopes.map(scope => [scope.id, scope.label]))
const sources = new Map(recordClaims.map(claim => [claim.id, claim.source]))

// Every line once, grouped the same way as the comparison chart above it.
export default function RecordList() {
  return <details className={styles.recordList}>
    <summary>Read all {recordInsights.length} lines</summary>
    {recordGroups.map(group => {
      const lines = recordInsights.filter(record => record.group === group.id)
      return <section key={group.id} data-group={group.id} aria-label={`${group.label}: ${lines.length}`}>
        <h4><i aria-hidden="true" />{group.label}<b>{lines.length}</b></h4>
        <ul>
          {lines.map(record => {
            const source = sources.get(record.id)
            return <li key={record.id}>
              {record.text}
              <small>{scopeLabel[record.scope]}{source && <> · <a href={source.url}>{source.name} ↗</a></>}</small>
            </li>
          })}
        </ul>
      </section>
    })}
  </details>
}
