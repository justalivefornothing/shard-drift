import { createRng, type Rng } from './rng.ts'
import type { Vec } from './geometry.ts'

export type Tier = 'large' | 'medium' | 'small'

export interface TierSpec {
  radius: number
  score: number
  /** Speed range (units/s) for a freshly spawned rock of this tier. */
  speed: [number, number]
  next: Tier | null
}

export const TIERS: Record<Tier, TierSpec> = {
  large: { radius: 40, score: 20, speed: [30, 60], next: 'medium' },
  medium: { radius: 22, score: 50, speed: [50, 90], next: 'small' },
  small: { radius: 12, score: 100, speed: [80, 130], next: null },
}

export const SHAPE_VERTICES = 12
/** Per-vertex radius jitter: each vertex lands in [radius·(1−J), radius·(1+J)]. */
export const SHAPE_JITTER = 0.3

export interface Asteroid {
  id: number
  tier: Tier
  pos: Vec
  vel: Vec
  angle: number
  spin: number
  /** Local-space outline; the rock is drawn and collided as this polygon rotated by `angle`. */
  shape: Vec[]
  /** Nominal radius for the tier. */
  radius: number
  /** Largest vertex distance — used for edge-proximity (ghost drawing) and broad-phase culling. */
  bound: number
}

/**
 * Build a jagged, roughly circular outline. Angles are spread evenly with a
 * little wobble; radii are jittered per vertex. Fully determined by `seed`.
 */
export function generateAsteroidShape(seed: number, radius: number): Vec[] {
  const rng = createRng(seed)
  const step = (Math.PI * 2) / SHAPE_VERTICES
  const shape: Vec[] = []
  for (let i = 0; i < SHAPE_VERTICES; i++) {
    const a = i * step + rng.range(-step * 0.3, step * 0.3)
    const r = radius * rng.range(1 - SHAPE_JITTER, 1 + SHAPE_JITTER)
    shape.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  return shape
}

let nextId = 1

export function makeAsteroid(tier: Tier, pos: Vec, vel: Vec, shapeSeed: number, rng: Rng): Asteroid {
  const spec = TIERS[tier]
  const shape = generateAsteroidShape(shapeSeed, spec.radius)
  let bound = 0
  for (const v of shape) bound = Math.max(bound, Math.hypot(v.x, v.y))
  return {
    id: nextId++,
    tier,
    pos: { ...pos },
    vel: { ...vel },
    angle: rng.range(0, Math.PI * 2),
    spin: rng.range(-1.2, 1.2),
    shape,
    radius: spec.radius,
    bound,
  }
}

/** Spawn a rock at `pos` heading in a random direction at a tier-appropriate speed. */
export function spawnAsteroid(tier: Tier, pos: Vec, rng: Rng): Asteroid {
  const heading = rng.range(0, Math.PI * 2)
  const speed = rng.range(...TIERS[tier].speed)
  const vel = { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed }
  return makeAsteroid(tier, pos, vel, rng.int(1, 0x7fffffff), rng)
}

/**
 * Fracture a rock into two of the next tier. Children keep the parent's
 * velocity and receive equal and opposite kicks perpendicular to it, so they
 * peel apart along the parent's flank. Small rocks just vanish (returns []).
 */
export function splitAsteroid(parent: Asteroid, rng: Rng): Asteroid[] {
  const nextTier = TIERS[parent.tier].next
  if (!nextTier) return []
  const speed = Math.hypot(parent.vel.x, parent.vel.y)
  let px: number
  let py: number
  if (speed > 1e-6) {
    px = -parent.vel.y / speed
    py = parent.vel.x / speed
  } else {
    const a = rng.range(0, Math.PI * 2)
    px = Math.cos(a)
    py = Math.sin(a)
  }
  const kick = rng.range(40, 70)
  const offset = TIERS[nextTier].radius * 0.6
  const children: Asteroid[] = []
  for (const sign of [1, -1]) {
    const pos = { x: parent.pos.x + px * offset * sign, y: parent.pos.y + py * offset * sign }
    const vel = { x: parent.vel.x * 1.15 + px * kick * sign, y: parent.vel.y * 1.15 + py * kick * sign }
    children.push(makeAsteroid(nextTier, pos, vel, rng.int(1, 0x7fffffff), rng))
  }
  return children
}
