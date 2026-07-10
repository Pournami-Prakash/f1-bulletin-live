const JOLPICA_BASE = 'https://api.jolpi.ca/ergast/f1'

export type StandingType = 'drivers' | 'constructors'

export function standingsPath(season: string, type: StandingType) {
  const resource = type === 'constructors'
    ? 'constructorStandings'
    : 'driverStandings'
  return `${JOLPICA_BASE}/${season}/${resource}.json`
}

export function jolpicaPath(path: string) {
  return `${JOLPICA_BASE}/${path.replace(/^\/+/, '')}`
}

export async function fetchJolpicaJson(path: string, revalidate = 3600) {
  const res = await fetch(path, { next: { revalidate } })
  if (!res.ok) {
    throw new Error(`Jolpica request failed with ${res.status}`)
  }
  return res.json()
}

export function parseStandingType(value: string | null): StandingType {
  return value === 'constructors' ? 'constructors' : 'drivers'
}
