import { createRng, type Rng } from './rng.ts'
import { convexHull, pointInPolygon, polygonsOverlap, transformPolygon, wrap, wrapDelta, type Vec } from './geometry.ts'
import { TIERS, spawnAsteroid, splitAsteroid, type Asteroid } from './asteroid.ts'

export const WORLD = { w: 960, h: 720 } as const
/** Simulation tick length in seconds (120 Hz). */
export const STEP = 1 / 120

export const SHIP = {
  /** Notched dart in local space, nose toward +x. */
  shape: [
    { x: 16, y: 0 },
    { x: -12, y: 10 },
    { x: -7, y: 0 },
    { x: -12, y: -10 },
  ] as Vec[],
  radius: 16,
  turnRate: 4.2, // rad/s
  thrust: 260, // units/s²
  drag: 0.55, // fraction of velocity lost per second
  maxSpeed: 340,
  fireInterval: 0.16,
  maxBullets: 5,
  bulletSpeed: 460,
  bulletLife: 1.1,
  invulnTime: 3,
  respawnDelay: 2,
  hyperTime: 0.55,
  hyperCooldown: 1.6,
} as const
/** Collision proxy: the notch is filled in, leaving a convex triangle. */
export const SHIP_HULL: Vec[] = convexHull(SHIP.shape)

export const RULES = {
  startLives: 3,
  baseRocks: 3,
  maxRocks: 11,
  waveDelay: 2,
  bannerTime: 2.2,
  extraLifeEvery: 10000,
  safeRadius: 160,
} as const

export interface Input {
  left: boolean
  right: boolean
  thrust: boolean
  fire: boolean
  hyper: boolean
  start: boolean
}

export const EMPTY_INPUT: Input = { left: false, right: false, thrust: false, fire: false, hyper: false, start: false }

export interface Ship {
  pos: Vec
  vel: Vec
  angle: number
  alive: boolean
  thrusting: boolean
  /** Seconds of spawn protection left. */
  invuln: number
  /** Seconds left inside a hyperspace jump (ship is hidden and untouchable). */
  hyper: number
  hyperCooldown: number
  fireCooldown: number
  /** Seconds until the next ship appears after a death. */
  respawnTimer: number
}

export interface Bullet {
  pos: Vec
  vel: Vec
  life: number
}

export interface Particle {
  pos: Vec
  vel: Vec
  angle: number
  spin: number
  len: number
  life: number
  maxLife: number
}

export type Phase = 'title' | 'playing' | 'gameover'

export interface GameState {
  phase: Phase
  seed: number
  rng: Rng
  time: number
  wave: number
  score: number
  lives: number
  highScore: number
  nextExtraLife: number
  ship: Ship
  asteroids: Asteroid[]
  bullets: Bullet[]
  particles: Particle[]
  /** Countdown to the next wave once the field is clear (0 = not counting). */
  waveTimer: number
  /** Seconds left to show the WAVE N banner. */
  banner: number
  prevHyper: boolean
  prevStart: boolean
}

function newShip(): Ship {
  return {
    pos: { x: WORLD.w / 2, y: WORLD.h / 2 },
    vel: { x: 0, y: 0 },
    angle: -Math.PI / 2,
    alive: true,
    thrusting: false,
    invuln: SHIP.invulnTime,
    hyper: 0,
    hyperCooldown: 0,
    fireCooldown: 0,
    respawnTimer: 0,
  }
}

/** Fresh state on the title screen with a drifting demo field. */
export function createGame(seed = 1, highScore = 0): GameState {
  const state: GameState = {
    phase: 'title',
    seed,
    rng: createRng(seed),
    time: 0,
    wave: 0,
    score: 0,
    lives: RULES.startLives,
    highScore,
    nextExtraLife: RULES.extraLifeEvery,
    ship: newShip(),
    asteroids: [],
    bullets: [],
    particles: [],
    waveTimer: 0,
    banner: 0,
    prevHyper: false,
    prevStart: false,
  }
  state.ship.alive = false
  spawnWave(state, 4)
  return state
}

/** Reset score/lives/field and drop the player into wave 1. */
export function startGame(state: GameState): void {
  state.phase = 'playing'
  state.rng = createRng(state.seed)
  state.wave = 0
  state.score = 0
  state.lives = RULES.startLives
  state.nextExtraLife = RULES.extraLifeEvery
  state.ship = newShip()
  state.asteroids = []
  state.bullets = []
  state.particles = []
  state.waveTimer = 0
  nextWave(state)
}

function nextWave(state: GameState): void {
  state.wave += 1
  state.banner = RULES.bannerTime
  spawnWave(state, Math.min(RULES.maxRocks, RULES.baseRocks + state.wave))
}

/** Wave layout is derived from a wave-specific seed so the same wave always looks the same. */
function spawnWave(state: GameState, count: number): void {
  const rng = createRng((state.seed * 7919 + state.wave * 104729) >>> 0)
  for (let i = 0; i < count; i++) {
    let pos: Vec
    let tries = 0
    do {
      pos = { x: rng.range(0, WORLD.w), y: rng.range(0, WORLD.h) }
      tries++
    } while (tries < 20 && torusDist(pos, state.ship.pos) < RULES.safeRadius + TIERS.large.radius)
    state.asteroids.push(spawnAsteroid('large', pos, rng))
  }
}

function torusDist(a: Vec, b: Vec): number {
  return Math.hypot(wrapDelta(a.x, b.x, WORLD.w), wrapDelta(a.y, b.y, WORLD.h))
}

function emitDebris(state: GameState, pos: Vec, vel: Vec, count: number, size: number): void {
  const { rng } = state
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2)
    const sp = rng.range(30, 110)
    const life = rng.range(0.5, 1.1)
    state.particles.push({
      pos: { ...pos },
      vel: { x: vel.x * 0.4 + Math.cos(a) * sp, y: vel.y * 0.4 + Math.sin(a) * sp },
      angle: rng.range(0, Math.PI * 2),
      spin: rng.range(-6, 6),
      len: rng.range(size * 0.3, size),
      life,
      maxLife: life,
    })
  }
}

/** The ship comes apart along its own edges: each outline segment becomes a drifting particle. */
function explodeShip(state: GameState): void {
  const ship = state.ship
  const world = transformPolygon(SHIP.shape, ship.pos, ship.angle)
  for (let i = 0; i < world.length; i++) {
    const a = world[i]!
    const b = world[(i + 1) % world.length]!
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const away = { x: mid.x - ship.pos.x, y: mid.y - ship.pos.y }
    state.particles.push({
      pos: mid,
      vel: { x: ship.vel.x * 0.3 + away.x * 4, y: ship.vel.y * 0.3 + away.y * 4 },
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      spin: state.rng.range(-3, 3),
      len: Math.hypot(b.x - a.x, b.y - a.y),
      life: 2.2,
      maxLife: 2.2,
    })
  }
  emitDebris(state, ship.pos, ship.vel, 10, 5)
}

function killShip(state: GameState): void {
  explodeShip(state)
  state.ship.alive = false
  state.ship.thrusting = false
  state.lives -= 1
  state.ship.respawnTimer = SHIP.respawnDelay
}

function addScore(state: GameState, points: number): void {
  state.score += points
  if (state.score > state.highScore) state.highScore = state.score
  if (state.score >= state.nextExtraLife) {
    state.lives += 1
    state.nextExtraLife += RULES.extraLifeEvery
  }
}

/** Break a rock: score it, spawn debris, and replace it with its shards. */
export function destroyAsteroid(state: GameState, index: number): void {
  const rock = state.asteroids[index]!
  addScore(state, TIERS[rock.tier].score)
  emitDebris(state, rock.pos, rock.vel, rock.tier === 'large' ? 12 : rock.tier === 'medium' ? 8 : 5, rock.radius * 0.5)
  const shards = splitAsteroid(rock, state.rng)
  state.asteroids.splice(index, 1, ...shards)
}

function stepShip(state: GameState, input: Input, dt: number): void {
  const ship = state.ship
  if (!ship.alive) {
    if (state.phase !== 'playing') return
    ship.respawnTimer -= dt
    if (ship.respawnTimer <= 0) {
      if (state.lives <= 0) state.phase = 'gameover'
      else state.ship = newShip()
    }
    return
  }

  ship.invuln = Math.max(0, ship.invuln - dt)
  ship.hyperCooldown = Math.max(0, ship.hyperCooldown - dt)
  ship.fireCooldown = Math.max(0, ship.fireCooldown - dt)

  if (ship.hyper > 0) {
    ship.hyper -= dt
    if (ship.hyper <= 0) {
      ship.hyper = 0
      ship.pos = { x: state.rng.range(40, WORLD.w - 40), y: state.rng.range(40, WORLD.h - 40) }
      ship.vel = { x: 0, y: 0 }
      ship.invuln = 0.6
    }
    return
  }

  if (input.hyper && !state.prevHyper && ship.hyperCooldown === 0) {
    ship.hyper = SHIP.hyperTime
    ship.hyperCooldown = SHIP.hyperCooldown
    ship.thrusting = false
    emitDebris(state, ship.pos, ship.vel, 6, 4)
    return
  }

  if (input.left) ship.angle -= SHIP.turnRate * dt
  if (input.right) ship.angle += SHIP.turnRate * dt
  ship.thrusting = input.thrust
  if (input.thrust) {
    ship.vel.x += Math.cos(ship.angle) * SHIP.thrust * dt
    ship.vel.y += Math.sin(ship.angle) * SHIP.thrust * dt
  }
  const decay = Math.exp(-SHIP.drag * dt)
  ship.vel.x *= decay
  ship.vel.y *= decay
  const speed = Math.hypot(ship.vel.x, ship.vel.y)
  if (speed > SHIP.maxSpeed) {
    ship.vel.x *= SHIP.maxSpeed / speed
    ship.vel.y *= SHIP.maxSpeed / speed
  }
  ship.pos.x = wrap(ship.pos.x + ship.vel.x * dt, WORLD.w)
  ship.pos.y = wrap(ship.pos.y + ship.vel.y * dt, WORLD.h)

  if (input.fire && ship.fireCooldown === 0 && state.bullets.length < SHIP.maxBullets) {
    ship.fireCooldown = SHIP.fireInterval
    const dir = { x: Math.cos(ship.angle), y: Math.sin(ship.angle) }
    state.bullets.push({
      pos: { x: ship.pos.x + dir.x * SHIP.radius, y: ship.pos.y + dir.y * SHIP.radius },
      vel: { x: ship.vel.x + dir.x * SHIP.bulletSpeed, y: ship.vel.y + dir.y * SHIP.bulletSpeed },
      life: SHIP.bulletLife,
    })
  }
}

/** Is the world point `p` inside `rock`? Uses the nearest toroidal copy, then tests in rock-local space. */
export function pointHitsAsteroid(p: Vec, rock: Asteroid): boolean {
  const dx = wrapDelta(rock.pos.x, p.x, WORLD.w)
  const dy = wrapDelta(rock.pos.y, p.y, WORLD.h)
  if (dx * dx + dy * dy > rock.bound * rock.bound) return false
  const c = Math.cos(-rock.angle)
  const s = Math.sin(-rock.angle)
  return pointInPolygon({ x: dx * c - dy * s, y: dx * s + dy * c }, rock.shape)
}

/** Does the ship's convex hull overlap `rock`? Both are expressed relative to the rock's centre. */
export function shipHitsAsteroid(ship: Ship, rock: Asteroid): boolean {
  const dx = wrapDelta(rock.pos.x, ship.pos.x, WORLD.w)
  const dy = wrapDelta(rock.pos.y, ship.pos.y, WORLD.h)
  const reach = rock.bound + SHIP.radius
  if (dx * dx + dy * dy > reach * reach) return false
  const hull = transformPolygon(SHIP_HULL, { x: dx, y: dy }, ship.angle)
  const rockPoly = transformPolygon(rock.shape, { x: 0, y: 0 }, rock.angle)
  return polygonsOverlap(hull, rockPoly)
}

function stepBodies(state: GameState, dt: number): void {
  for (const rock of state.asteroids) {
    rock.pos.x = wrap(rock.pos.x + rock.vel.x * dt, WORLD.w)
    rock.pos.y = wrap(rock.pos.y + rock.vel.y * dt, WORLD.h)
    rock.angle += rock.spin * dt
  }
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i]!
    b.life -= dt
    if (b.life <= 0) {
      state.bullets.splice(i, 1)
      continue
    }
    b.pos.x = wrap(b.pos.x + b.vel.x * dt, WORLD.w)
    b.pos.y = wrap(b.pos.y + b.vel.y * dt, WORLD.h)
  }
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i]!
    p.life -= dt
    if (p.life <= 0) {
      state.particles.splice(i, 1)
      continue
    }
    const decay = Math.exp(-1.2 * dt)
    p.vel.x *= decay
    p.vel.y *= decay
    p.pos.x = wrap(p.pos.x + p.vel.x * dt, WORLD.w)
    p.pos.y = wrap(p.pos.y + p.vel.y * dt, WORLD.h)
    p.angle += p.spin * dt
  }
}

function resolveCollisions(state: GameState): void {
  // Bullets vs rocks. Iterate backwards so splicing is safe; a bullet hits at most one rock.
  for (let bi = state.bullets.length - 1; bi >= 0; bi--) {
    const b = state.bullets[bi]!
    for (let ai = 0; ai < state.asteroids.length; ai++) {
      if (pointHitsAsteroid(b.pos, state.asteroids[ai]!)) {
        state.bullets.splice(bi, 1)
        destroyAsteroid(state, ai)
        break
      }
    }
  }
  const ship = state.ship
  if (state.phase !== 'playing' || !ship.alive || ship.invuln > 0 || ship.hyper > 0) return
  for (let ai = 0; ai < state.asteroids.length; ai++) {
    if (shipHitsAsteroid(ship, state.asteroids[ai]!)) {
      killShip(state)
      destroyAsteroid(state, ai)
      return
    }
  }
}

/** Advance the world by one fixed tick. Pure with respect to `input`; mutates `state` in place. */
export function step(state: GameState, input: Input, dt = STEP): void {
  state.time += dt
  if (state.phase !== 'playing') {
    if (input.start && !state.prevStart) startGame(state)
    else stepBodies(state, dt)
    state.prevStart = input.start
    state.prevHyper = input.hyper
    return
  }

  stepShip(state, input, dt)
  stepBodies(state, dt)
  resolveCollisions(state)

  state.banner = Math.max(0, state.banner - dt)
  if (state.asteroids.length === 0) {
    if (state.waveTimer === 0) state.waveTimer = RULES.waveDelay
    state.waveTimer -= dt
    if (state.waveTimer <= 0) {
      state.waveTimer = 0
      nextWave(state)
    }
  }
  state.prevStart = input.start
  state.prevHyper = input.hyper
}
