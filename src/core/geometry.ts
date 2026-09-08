export interface Vec {
  x: number
  y: number
}

/** Polygon as an ordered list of vertices (implicitly closed). */
export type Polygon = readonly Vec[]

/** Wrap a scalar into [0, size) using modular arithmetic; handles negatives. */
export function wrap(value: number, size: number): number {
  const m = value % size
  return m < 0 ? m + size : m
}

/**
 * Shortest signed displacement from `a` to `b` on a circle of length `size`.
 * On a torus the nearest copy of `b` may be across an edge; this picks it.
 */
export function wrapDelta(a: number, b: number, size: number): number {
  let d = b - a
  if (d > size / 2) d -= size
  else if (d < -size / 2) d += size
  return d
}

/** Rotate a local-space polygon by `angle` and translate it to `pos`. */
export function transformPolygon(local: Polygon, pos: Vec, angle: number): Vec[] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return local.map((v) => ({ x: pos.x + v.x * c - v.y * s, y: pos.y + v.x * s + v.y * c }))
}

/**
 * Ray-casting point-in-polygon. Casts a horizontal ray from `p` toward +x and
 * counts how many edges it crosses; odd → inside. Works for concave polygons.
 */
export function pointInPolygon(p: Vec, poly: Polygon): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    const straddles = a.y > p.y !== b.y > p.y
    if (straddles) {
      const xAtY = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)
      if (p.x < xAtY) inside = !inside
    }
  }
  return inside
}

/** Project every vertex onto a unit axis and return the [min, max] interval. */
function projectOnto(poly: Polygon, ax: number, ay: number): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const v of poly) {
    const d = v.x * ax + v.y * ay
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

/**
 * Separating Axis Theorem. Two convex polygons overlap iff no edge normal of
 * either polygon separates their projections. Exact for convex shapes; for a
 * mildly concave asteroid it behaves like a hull test, which is fine for arcade play.
 */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  for (const poly of [a, b]) {
    const n = poly.length
    for (let i = 0; i < n; i++) {
      const p = poly[i]!
      const q = poly[(i + 1) % n]!
      // Edge normal (not normalised — projections stay comparable on the same axis).
      const nx = -(q.y - p.y)
      const ny = q.x - p.x
      if (nx === 0 && ny === 0) continue
      const [minA, maxA] = projectOnto(a, nx, ny)
      const [minB, maxB] = projectOnto(b, nx, ny)
      if (maxA < minB || maxB < minA) return false
    }
  }
  return true
}

/** Andrew's monotone chain convex hull (CCW). Used to hull the notched ship into a triangle. */
export function convexHull(points: Polygon): Vec[] {
  const pts = [...points].sort((p, q) => p.x - q.x || p.y - q.y)
  if (pts.length < 3) return pts
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Vec[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Vec[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}
