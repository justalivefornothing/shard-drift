import { describe, expect, it } from 'vitest'
import { generateAsteroidShape, makeAsteroid, splitAsteroid, spawnAsteroid, TIERS } from '../src/core/asteroid.ts'
import { createRng } from '../src/core/rng.ts'

describe('generateAsteroidShape', () => {
  it('yields 12 vertices between 28 and 52 units from the centre for seed 1, radius 40', () => {
    const shape = generateAsteroidShape(1, 40)
    expect(shape).toHaveLength(12)
    for (const v of shape) {
      const d = Math.hypot(v.x, v.y)
      expect(d).toBeGreaterThanOrEqual(28)
      expect(d).toBeLessThanOrEqual(52)
    }
  })

  it('is deterministic per seed and differs across seeds', () => {
    expect(generateAsteroidShape(7, 40)).toEqual(generateAsteroidShape(7, 40))
    expect(generateAsteroidShape(7, 40)).not.toEqual(generateAsteroidShape(8, 40))
  })

  it('keeps vertices in angular order (a simple, non-self-intersecting outline)', () => {
    const shape = generateAsteroidShape(3, 40)
    const angles = shape.map((v) => Math.atan2(v.y, v.x))
    // unwrap so the sequence is monotonic
    for (let i = 1; i < angles.length; i++) while (angles[i]! < angles[i - 1]!) angles[i]! += Math.PI * 2
    for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeGreaterThan(angles[i - 1]!)
  })
})

describe('splitAsteroid', () => {
  it('turns a large rock into exactly two medium ones and a small rock into nothing', () => {
    const rng = createRng(42)
    const large = makeAsteroid('large', { x: 100, y: 100 }, { x: 30, y: 0 }, 1, rng)
    const shards = splitAsteroid(large, rng)
    expect(shards).toHaveLength(2)
    expect(shards.every((s) => s.tier === 'medium')).toBe(true)

    const small = makeAsteroid('small', { x: 0, y: 0 }, { x: 0, y: 0 }, 2, rng)
    expect(splitAsteroid(small, rng)).toEqual([])
  })

  it('children inherit the parent velocity and receive opposite perpendicular kicks', () => {
    const rng = createRng(5)
    const parent = makeAsteroid('large', { x: 0, y: 0 }, { x: 40, y: 0 }, 1, rng)
    const [a, b] = splitAsteroid(parent, rng)
    // Along the parent's heading both keep (boosted) forward momentum.
    expect(a!.vel.x).toBeCloseTo(parent.vel.x * 1.15)
    expect(b!.vel.x).toBeCloseTo(parent.vel.x * 1.15)
    // Perpendicular components are equal and opposite, and non-zero.
    expect(a!.vel.y).toBeCloseTo(-b!.vel.y)
    expect(Math.abs(a!.vel.y)).toBeGreaterThan(30)
  })

  it('medium splits to small, which carries the highest score', () => {
    const rng = createRng(9)
    const medium = spawnAsteroid('medium', { x: 10, y: 10 }, rng)
    const shards = splitAsteroid(medium, rng)
    expect(shards.map((s) => s.tier)).toEqual(['small', 'small'])
    expect(TIERS.small.score).toBeGreaterThan(TIERS.large.score)
  })
})
