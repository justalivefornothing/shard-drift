import { describe, expect, it } from 'vitest'
import { convexHull, pointInPolygon, polygonsOverlap, transformPolygon, wrap, wrapDelta } from '../src/core/geometry.ts'

const unitSquare = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
]

const tri = (ox: number, oy: number) => [
  { x: ox, y: oy },
  { x: ox + 20, y: oy },
  { x: ox + 10, y: oy + 20 },
]

describe('wrap', () => {
  it('wraps negatives and overshoots onto [0, size)', () => {
    expect(wrap(-5, 800)).toBe(795)
    expect(wrap(805, 800)).toBe(5)
    expect(wrap(800, 800)).toBe(0)
    expect(wrap(0, 800)).toBe(0)
    expect(wrap(-1605, 800)).toBe(795)
  })

  it('wrapDelta picks the shortest toroidal displacement', () => {
    expect(wrapDelta(10, 790, 800)).toBe(-20)
    expect(wrapDelta(790, 10, 800)).toBe(20)
    expect(wrapDelta(100, 300, 800)).toBe(200)
  })
})

describe('pointInPolygon', () => {
  it('detects points inside and outside a unit square centred at the origin', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, unitSquare)).toBe(true)
    expect(pointInPolygon({ x: 2, y: 0 }, unitSquare)).toBe(false)
  })

  it('handles concave outlines', () => {
    // A "C" shape: the mouth at x>1,y in (1,2) is outside even though it is inside the bounding box.
    const c = [
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 },
      { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 0, y: 3 },
    ]
    expect(pointInPolygon({ x: 2, y: 1.5 }, c)).toBe(false)
    expect(pointInPolygon({ x: 0.5, y: 1.5 }, c)).toBe(true)
  })
})

describe('polygonsOverlap (SAT)', () => {
  it('is false for two triangles 100 units apart and true for overlapping ones', () => {
    expect(polygonsOverlap(tri(0, 0), tri(100, 0))).toBe(false)
    expect(polygonsOverlap(tri(0, 0), tri(5, 3))).toBe(true)
  })

  it('separates shapes whose bounding boxes overlap but bodies do not', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const b = [{ x: 10, y: 10 }, { x: 10, y: 4 }, { x: 4, y: 10 }]
    expect(polygonsOverlap(a, b)).toBe(false)
  })
})

describe('transformPolygon / convexHull', () => {
  it('rotates then translates', () => {
    const [p] = transformPolygon([{ x: 1, y: 0 }], { x: 10, y: 10 }, Math.PI / 2)
    expect(p!.x).toBeCloseTo(10)
    expect(p!.y).toBeCloseTo(11)
  })

  it('drops the notch of a dart, leaving a triangle', () => {
    const dart = [{ x: 16, y: 0 }, { x: -12, y: 10 }, { x: -7, y: 0 }, { x: -12, y: -10 }]
    const hull = convexHull(dart)
    expect(hull).toHaveLength(3)
    expect(hull).not.toContainEqual({ x: -7, y: 0 })
  })
})
