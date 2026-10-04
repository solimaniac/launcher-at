export interface Pose { x: number; y: number; /** Heading in degrees, SVG convention (clockwise from +x). */ angle: number }
export interface Trajectory {
  /** SVG path data in viewport pixels. */
  readonly path: string
  readonly length: number
  /** Position and heading at `distance` pixels along the path, clamped to its ends. */
  poseAt(distance: number): Pose
}
interface Point { x: number; y: number }

const SAMPLES = 64

function quadratic(a: Point, b: Point, c: Point, t: number): Point {
  const u = 1 - t
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y }
}

// Sampling into a polyline makes arc length exact and lookups trivial, which a raw Bezier does not.
function polyline(points: Point[]): Trajectory {
  const lengths = [0]
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
    lengths.push(total)
  }
  return {
    path: points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(''),
    length: total,
    poseAt(distance) {
      const d = Math.min(Math.max(distance, 0), total)
      let i = 1
      while (i < points.length - 1 && lengths[i]! < d) i++
      const from = points[i - 1]!, to = points[i]!
      const span = lengths[i]! - lengths[i - 1]!
      const f = span ? (d - lengths[i - 1]!) / span : 0
      return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, angle: Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI }
    },
  }
}

// A gravity turn: lifts off vertically from just below the bottom edge, then pitches over
// eastward (rightward, so labels following the path read left to right) and leaves past the top.
export function planTrajectory(width: number, height: number, random: () => number = Math.random): Trajectory {
  const x = width * (0.05 + random() * 0.5)
  const start = { x, y: height + 16 }
  const control = { x, y: height * (0.25 + random() * 0.35) }
  // Pitch over by a share of the room left to the right so every flight leaves through the top.
  const end = { x: x + (width * 0.95 - x) * (0.4 + random() * 0.6), y: -height * 0.15 }
  return polyline(Array.from({ length: SAMPLES + 1 }, (_, i) => quadratic(start, control, end, i / SAMPLES)))
}
