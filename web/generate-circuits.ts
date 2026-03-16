import fs from "fs"
import { CALENDAR } from "./f1-calendar.ts"

/* -------------------------------------------------------------------------- */
/*                               FILE PATHS                                   */
/* -------------------------------------------------------------------------- */

const GEOJSON_PATH =
  "/Users/pournami/Documents/Projects/f1-bulletin/data/f1-circuits.geojson"

const OUTPUT_PATH =
  "/Users/pournami/Documents/Projects/f1-bulletin/web/src/components/circuit_paths.ts"

const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"))

/* -------------------------------------------------------------------------- */
/*                               PROJECTION                                   */
/* -------------------------------------------------------------------------- */

function project(lat: number, lon: number, lat0: number) {
  const rad = Math.PI / 180
  const x = lon * Math.cos(lat0 * rad)
  const y = lat
  return [x, y]
}

/* -------------------------------------------------------------------------- */
/*                             NORMALIZE TRACK                                */
/* -------------------------------------------------------------------------- */

function normalize(points: number[][]) {

  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const width = maxX - minX
  const height = maxY - minY

  const scale = 80 / Math.max(width, height)

  const padX = (100 - width * scale) / 2
  const padY = (80 - height * scale) / 2

  const norm = points.map(([x, y]) => [
    (x - minX) * scale + padX,
    (y - minY) * scale + padY
  ])

  return {
    points: norm,
    vw: 100,
    vh: 80
  }
}

/* -------------------------------------------------------------------------- */
/*                             BUILD SVG PATH                                 */
/* -------------------------------------------------------------------------- */

function pathFromPoints(points: number[][]) {

  if (points.length < 2) return ""

  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`

  for (let i = 1; i < points.length - 1; i++) {

    const curr = points[i]
    const next = points[i + 1]

    const midX = (curr[0] + next[0]) / 2
    const midY = (curr[1] + next[1]) / 2

    d += ` Q ${curr[0].toFixed(1)} ${curr[1].toFixed(1)} ${midX.toFixed(
      1
    )} ${midY.toFixed(1)}`
  }

  d += " Z"

  return d
}

/* -------------------------------------------------------------------------- */
/*                       EXTRACT COORDINATES SAFELY                           */
/* -------------------------------------------------------------------------- */

function extractCoords(geometry: any): number[][] {

  if (!geometry) return []

  if (geometry.type === "Polygon") {
    return geometry.coordinates[0]
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates[0][0]
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates
  }

  console.warn("Unsupported geometry type:", geometry.type)
  return []
}

/* -------------------------------------------------------------------------- */
/*                              PROCESS CIRCUITS                              */
/* -------------------------------------------------------------------------- */

const circuits = geojson.features
  .map((f: any) => {

    const props = f.properties ?? {}
    const coords = extractCoords(f.geometry)

    if (!coords || coords.length === 0) {
      return null
    }

    const id = props.id
    const name = props.Name ?? props.name ?? "Unknown Circuit"

    const meta = CALENDAR.find(m => m.id === id)

    /* Skip circuits not in the calendar */
    if (!meta) {
      return null
    }

    const avgLat =
      coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length

    const projected = coords.map(([lon, lat]) =>
      project(lat, lon, avgLat)
    )

    const { points, vw, vh } = normalize(projected)

    const d = pathFromPoints(points)

    const sf = points[0]

    return {
      id,
      rd: meta.rd,
      name: name.replace(" Circuit", "").toUpperCase(),
      country: meta.country,
      dates: meta.dates,
      et: meta.et,
      vw: Number(vw.toFixed(1)),
      vh: Number(vh.toFixed(1)),
      sf: [Number(sf[0].toFixed(1)), Number(sf[1].toFixed(1))],
      d
    }

  })
  .filter(Boolean)

/* -------------------------------------------------------------------------- */
/*                            SORT BY ROUND                                   */
/* -------------------------------------------------------------------------- */

circuits.sort((a: any, b: any) => Number(a.rd) - Number(b.rd))


/* -------------------------------------------------------------------------- */
/*                              WRITE OUTPUT                                  */
/* -------------------------------------------------------------------------- */

const output = `
// AUTO-GENERATED from f1-circuits.geojson
// Projection: equirectangular (cos-lat corrected)
// DO NOT EDIT MANUALLY

export const CIRCUITS = ${JSON.stringify(circuits, null, 2)} as const
`

fs.writeFileSync(OUTPUT_PATH, output)

console.log("✓ circuit_paths.ts generated")
