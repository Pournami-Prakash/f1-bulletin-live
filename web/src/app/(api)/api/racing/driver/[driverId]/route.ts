import { NextResponse } from 'next/server'

const JOLPICA = 'https://api.jolpi.ca/ergast/f1'
const CURRENT_YEAR = new Date().getFullYear()

export const revalidate = 3600

async function fetchJSON(url: string) {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Paginate through all races — Jolpica hard caps at 100 per page
async function fetchAllRaces(driverId: string): Promise<any[]> {
  const first = await fetchJSON(
    `${JOLPICA}/drivers/${driverId}/results.json?limit=100&offset=0`
  )
  if (!first) return []

  const total = Number(first?.MRData?.total ?? 0)
  const firstRaces: any[] = first?.MRData?.RaceTable?.Races ?? []
  if (total <= 100) return firstRaces

  const pages = Math.ceil(total / 100)
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      fetchJSON(
        `${JOLPICA}/drivers/${driverId}/results.json?limit=100&offset=${(i + 1) * 100}`
      )
    )
  )

  return [
    ...firstRaces,
    ...rest.flatMap((d: any) => d?.MRData?.RaceTable?.Races ?? []),
  ]
}

// Championships: only check completed seasons to avoid live-standings false positives
async function countChampionships(
  driverId: string,
  seasonsList: any[]
): Promise<number> {
  if (!seasonsList.length) return 0

  const completedSeasons = seasonsList.filter(
    s => Number(s.season) < CURRENT_YEAR
  )
  if (!completedSeasons.length) return 0

  const results = await Promise.all(
    completedSeasons.map(s =>
      fetchJSON(
        `${JOLPICA}/${s.season}/drivers/${driverId}/driverstandings.json?limit=1`
      )
    )
  )

  return results.filter(d => {
    const lists = d?.MRData?.StandingsTable?.StandingsLists ?? []
    return lists[0]?.DriverStandings?.[0]?.position === '1'
  }).length
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ driverId: string }> }
) {
  const { driverId } = await context.params

  try {
    const [
      winsData,
      racesData,
      polesData,
      driverData,
      currentData,
      seasonsData,
    ] = await Promise.all([
      fetchJSON(`${JOLPICA}/drivers/${driverId}/results/1.json?limit=1`),
      fetchJSON(`${JOLPICA}/drivers/${driverId}/results.json?limit=1`),
      fetchJSON(`${JOLPICA}/drivers/${driverId}/qualifying/1.json?limit=1`),
      fetchJSON(`${JOLPICA}/drivers/${driverId}.json?limit=1`),
      fetchJSON(`${JOLPICA}/current/drivers/${driverId}/results.json?limit=30`),
      fetchJSON(`${JOLPICA}/drivers/${driverId}/seasons.json?limit=100`),
    ])

    const driverInfo = driverData?.MRData?.DriverTable?.Drivers?.[0] ?? null
    const races      = Number(racesData?.MRData?.total  ?? 0)
    const winsCount  = Number(winsData?.MRData?.total   ?? 0)
    const poles      = Number(polesData?.MRData?.total  ?? 0)

    const seasonsList: any[] = seasonsData?.MRData?.SeasonTable?.Seasons ?? []
    const seasons = seasonsList.length || Number(seasonsData?.MRData?.total ?? 0)

    // Paginate all races for accurate points and full team history
    const allRaces = await fetchAllRaces(driverId)

    const totalPoints = allRaces.reduce(
      (sum: number, r: any) => sum + Number(r.Results?.[0]?.points ?? 0),
      0
    )

    // Teams sorted by most recent season first
    const teamsByYear = new Map<string, number>()
    for (const r of allRaces) {
      const name = r.Results?.[0]?.Constructor?.name
      const year = Number(r.season ?? 0)
      if (name && (!teamsByYear.has(name) || teamsByYear.get(name)! < year)) {
        teamsByYear.set(name, year)
      }
    }
    const teams = [...teamsByYear.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    // Championships from completed seasons only
    const championships = await countChampionships(driverId, seasonsList)

    const currentRaces: any[] = currentData?.MRData?.RaceTable?.Races ?? []

    const currentWins = currentRaces.filter(
      r => r.Results?.[0]?.position === '1'
    ).length

    const currentPodiums = currentRaces.filter(r => {
      const pos = Number(r.Results?.[0]?.position)
      return Number.isFinite(pos) && pos >= 1 && pos <= 3
    }).length

    const currentPoints = currentRaces.reduce(
      (sum: number, r: any) => sum + Number(r.Results?.[0]?.points ?? 0),
      0
    )

    const recentResults = currentRaces
      .slice(-5)
      .reverse()
      .map((r: any) => ({
        race:        r.raceName,
        round:       r.round,
        position:    r.Results?.[0]?.position    ?? '—',
        points:      r.Results?.[0]?.points      ?? '0',
        grid:        r.Results?.[0]?.grid        ?? '—',
        status:      r.Results?.[0]?.status      ?? '—',
        constructor: r.Results?.[0]?.Constructor?.name ?? '—',
        date:        r.date,
      }))

    return NextResponse.json({
      ok: true,
      driver: driverInfo,
      career: {
        races,
        wins:          winsCount,
        poles,
        points:        Math.round(totalPoints),
        seasons,
        championships,
        teams,
      },
      currentSeason: {
        year:    Number(currentData?.MRData?.RaceTable?.season) || CURRENT_YEAR,
        races:   currentRaces.length,
        wins:    currentWins,
        podiums: currentPodiums,
        points:  Math.round(currentPoints),
        results: recentResults,
      },
    })
  } catch (err) {
    console.error('[driver API]', err)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch driver data' },
      { status: 500 }
    )
  }
}