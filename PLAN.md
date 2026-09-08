# Shard Drift — plan

An asteroids-style vector shooter on canvas with procedurally generated rocks,
polygon collision, and toroidal wraparound.

## Goal

Recreate the feel of a vector monitor arcade cabinet in the browser: black
screen, thin white strokes with an additive glow, no fills, HUD text drawn as
line-stroke glyphs. Under the hood, a deterministic, DOM-free simulation that
is fully unit tested.

## Features (all required)

- Ship with thrust, rotation, inertia and friction on a fixed-timestep loop
- Procedural asteroid polygons (per-vertex radius jitter) in three size tiers
- Bullet-vs-asteroid via ray-casting point-in-polygon; ship-vs-asteroid via SAT
- Asteroids split into two smaller ones inheriting velocity + perpendicular kick
- Toroidal wraparound for every entity, with ghost copies drawn across edges
- Waves with increasing count, score, lives, respawn invulnerability, hyperspace
- Particle debris on destruction and a persistent high score (localStorage)

## Architecture

```
src/
  core/            DOM-free, tested with vitest
    rng.ts         mulberry32 seeded PRNG
    geometry.ts    wrap, wrapDelta, pointInPolygon, polygonsOverlap, transform
    asteroid.ts    tiers, generateAsteroidShape, spawnAsteroid, splitAsteroid
    game.ts        GameState, createGame, step(state, input, dt), waves/lives
  render/
    vectorFont.ts  line-stroke glyphs for A-Z 0-9 and punctuation
    draw.ts        glow strokes, ghost copies, HUD, screens
  main.ts          canvas sizing, keyboard/touch input, rAF + accumulator loop
tests/             spec assertions + extra edge cases
```

The simulation advances in fixed 1/120 s steps from an accumulator fed by
requestAnimationFrame. Rendering reads state only. Every random decision goes
through the seeded PRNG so a wave is reproducible from its seed.

## Milestones

1. Plan, license, scaffold
2. Core geometry + asteroid generation + tests
3. Game state: ship physics, bullets, collision, splitting, waves, lives
4. Renderer: glow strokes, wraparound ghosts, vector font HUD, screens
5. Input, loop, hyperspace, particles, high score, touch controls
6. Build, smoke test, screenshot, README, publish
