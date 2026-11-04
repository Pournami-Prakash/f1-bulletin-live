'use client'

import { useState } from 'react'
import { recordGroups, recordInsights, recordScopes, type RecordGroup } from '@/lib/kimi-record-insights'
import RecordList from './RecordList'
import styles from './records.module.css'
import kimi from './kimi.module.css'

const order = recordGroups.map(group => group.id)
const scopeOrder = recordScopes.map(scope => scope.id)
const cells = [...recordInsights].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || scopeOrder.indexOf(a.scope) - scopeOrder.indexOf(b.scope))
const groups = recordGroups.map(group => {
  const items = recordInsights.filter(record => record.group === group.id)
  return { ...group, count: items.length, parts: recordScopes.filter(scope => (group.scopes as readonly string[]).includes(scope.id)).map(scope => ({ ...scope, count: items.filter(r => r.scope === scope.id).length })) }
})

export default function RecordMix() {
  // Hover previews a group; a click pins it, so the pointer entering first never undoes the click.
  const [pinned, setPinned] = useState<RecordGroup | null>(null)
  const [hovered, setHovered] = useState<RecordGroup | null>(null)
  const focus = hovered ?? pinned
  const everyone = groups[0].count
  return <section id="record-types" className={`${kimi.section} ${styles.records}`} aria-labelledby="record-types-title">
    <header className={kimi.sectionHead}>
      <p className={kimi.kicker}><span>08</span> Who he beat</p>
      <h2 id="record-types-title">Who was he compared with?</h2>
      <p><b>{everyone} of {recordInsights.length}</b> put him against every driver in F1 history. The rest narrow the field to one race, an age group, a team or a nation.</p>
    </header>
    <div className={styles.mixLayout}>
      <div className={styles.waffle} data-focus={focus ?? undefined} role="img" aria-label={groups.map(group => `${group.label}: ${group.count}`).join(', ')}>
        {cells.map(cell => <span key={cell.id} data-group={cell.group} title={cell.text} />)}
      </div>
      <ul className={styles.mixLegend}>
        {groups.map(group => <li key={group.id} data-group={group.id}>
          <button type="button" aria-pressed={pinned === group.id} onClick={() => setPinned(pinned === group.id ? null : group.id)} onPointerEnter={event => event.pointerType === 'mouse' && setHovered(group.id)} onPointerLeave={() => setHovered(null)}>
            <i aria-hidden="true" />
            <span><b>{group.label}</b><small>{group.note}</small><small>{group.parts.map(part => `${part.count} ${part.label}`).join(' · ')}</small></span>
            <strong>{group.count}</strong>
          </button>
        </li>)}
      </ul>
    </div>
    <RecordList />
  </section>
}
