import { describe, expect, it } from 'vitest'
import { createGame, EMPTY_INPUT, pointHitsAsteroid, shipHitsAsteroid, startGame, step, STEP, WORLD, type Input } from '../src/core/game.ts'
import { makeAsteroid } from '../src/core/asteroid.ts'
import { createRng } from '../src/core/rng.ts'

const input = (over: Partial<Input>): Input => ({ ...EMPTY_INPUT, ...over })
const run = (state: ReturnType<typeof createGame>, inp: Input, seconds: number) => {
  for (let t = 0; t < seconds; t += STEP) step(state, inp)
}

describe('game flow', () => {
  it('starts on the title screen with a demo field and enters wave 1 on start', () => {
    const g = createGame(1)
    expect(g.phase).toBe('title')
    expect(g.asteroids.length).toBeGreaterThan(0)
    step(g, input({ start: true }))
    expect(g.phase).toBe('playing')
    expect(g.wave).toBe(1)
    expect(g.asteroids).toHaveLength(4)
    expect(g.asteroids.every((a) => a.tier === 'large')).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    const a = createGame(123)
    const b = createGame(123)
    startGame(a)
    startGame(b)
    run(a, input({ thrust: true, left: true, fire: true }), 3)
    run(b, input({ thrust: true, left: true, fire: true }), 3)
    expect(a.asteroids.map((r) => r.pos)).toEqual(b.asteroids.map((r) => r.pos))
    expect(a.score).toBe(b.score)
  })
})

describe('ship physics', () => {
  it('thrusts along its heading, coasts with inertia, and slows under drag', () => {
    const g = createGame(1)
    startGame(g)
    g.asteroids = []
    run(g, input({ thrust: true }), 1)
    const speedAfterThrust = Math.hypot(g.ship.vel.x, g.ship.vel.y)
    expect(speedAfterThrust).toBeGreaterThan(100)
    expect(g.ship.vel.y).toBeLessThan(0) // heading is -PI/2 (up)
    expect(Math.abs(g.ship.vel.x)).toBeLessThan(1e-6)
    run(g, EMPTY_INPUT, 1)
    const speedAfterCoast = Math.hypot(g.ship.vel.x, g.ship.vel.y)
    expect(speedAfterCoast).toBeGreaterThan(0)
    expect(speedAfterCoast).toBeLessThan(speedAfterThrust)
  })

  it('wraps across the top edge and reappears at the bottom', () => {
    const g = createGame(1)
    startGame(g)
    g.asteroids = []
    g.ship.pos = { x: 480, y: 0.5 }
    g.ship.vel = { x: 0, y: -120 }
    step(g, EMPTY_INPUT)
    // moved -1 unit past y=0 (minus a little drag) and came back in from the bottom
    expect(g.ship.pos.y).toBeGreaterThan(WORLD.h - 1)
    expect(g.ship.pos.y).toBeLessThan(WORLD.h)
  })

  it('caps bullets in flight and expires them', () => {
    const g = createGame(1)
    startGame(g)
    g.asteroids = []
    run(g, input({ fire: true }), 2)
    expect(g.bullets.length).toBeLessThanOrEqual(5)
    run(g, EMPTY_INPUT, 1.5)
    expect(g.bullets).toHaveLength(0)
  })

  it('hyperspace hides the ship, relocates it, then enforces a cooldown', () => {
    const g = createGame(1)
    startGame(g)
    g.asteroids = []
    const before = { ...g.ship.pos }
    step(g, input({ hyper: true }))
    expect(g.ship.hyper).toBeGreaterThan(0)
    run(g, EMPTY_INPUT, 0.7)
    expect(g.ship.hyper).toBe(0)
    expect(g.ship.pos).not.toEqual(before)
    expect(g.ship.vel).toEqual({ x: 0, y: 0 })
    expect(g.ship.hyperCooldown).toBeGreaterThan(0)
  })
})

describe('collisions and scoring', () => {
  it('a bullet inside a large rock scores 20 and leaves two medium shards plus debris', () => {
    const g = createGame(1)
    startGame(g)
    const rock = g.asteroids[0]!
    g.bullets.push({ pos: { ...rock.pos }, vel: { x: 0, y: 0 }, life: 1 })
    step(g, EMPTY_INPUT)
    expect(g.score).toBe(20)
    expect(g.bullets).toHaveLength(0)
    expect(g.asteroids).toHaveLength(5)
    expect(g.asteroids.filter((a) => a.tier === 'medium')).toHaveLength(2)
    expect(g.particles.length).toBeGreaterThan(0)
  })

  it('point and hull tests see rocks across the wraparound seam', () => {
    const rng = createRng(1)
    const rock = makeAsteroid('large', { x: 2, y: 100 }, { x: 0, y: 0 }, 1, rng)
    expect(pointHitsAsteroid({ x: WORLD.w - 2, y: 100 }, rock)).toBe(true)
    expect(pointHitsAsteroid({ x: WORLD.w - 100, y: 100 }, rock)).toBe(false)
    const g = createGame(1)
    g.ship.pos = { x: WORLD.w - 4, y: 100 }
    expect(shipHitsAsteroid(g.ship, rock)).toBe(true)
  })

  it('a rock hitting an unprotected ship costs a life and later respawns with invulnerability', () => {
    const g = createGame(1)
    startGame(g)
    g.ship.invuln = 0
    const rock = g.asteroids[0]!
    rock.pos = { ...g.ship.pos }
    rock.vel = { x: 0, y: 0 }
    step(g, EMPTY_INPUT)
    expect(g.ship.alive).toBe(false)
    expect(g.lives).toBe(2)
    run(g, EMPTY_INPUT, 2.1)
    expect(g.ship.alive).toBe(true)
    expect(g.ship.invuln).toBeGreaterThan(0)
  })

  it('ends the game when the last life is lost and tracks the high score', () => {
    const g = createGame(1, 10)
    startGame(g)
    g.score = 0
    g.lives = 1
    g.ship.invuln = 0
    const rock = g.asteroids[0]!
    rock.pos = { ...g.ship.pos }
    step(g, EMPTY_INPUT)
    expect(g.score).toBe(20)
    expect(g.highScore).toBe(20)
    run(g, EMPTY_INPUT, 2.1)
    expect(g.phase).toBe('gameover')
  })

  it('advances to the next, larger wave once the field is clear', () => {
    const g = createGame(1)
    startGame(g)
    g.asteroids = []
    run(g, EMPTY_INPUT, 2.1)
    expect(g.wave).toBe(2)
    expect(g.asteroids).toHaveLength(5)
    expect(g.banner).toBeGreaterThan(0)
  })
})
