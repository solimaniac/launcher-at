import { expect, test } from 'vitest'
import { planTrajectory } from './trajectory'

// Extremes of the random range bound every possible flight.
for (const value of [0, 0.5, 0.999]) {
  test(`launch rises off-screen to off-screen and stays readable (random ${value})`, () => {
    const width = 1280, height = 800
    const flight = planTrajectory(width, height, () => value)
    const start = flight.poseAt(-1), end = flight.poseAt(flight.length + 1)
    expect(start.y).toBeGreaterThan(height)
    expect(end.y).toBeLessThan(0)
    expect(end.x).toBeGreaterThan(start.x)
    for (let d = 0; d <= flight.length; d += flight.length / 50) {
      const { x, y, angle } = flight.poseAt(d)
      // Heading stays between straight up and level-right, so path-following text never renders upside down.
      expect(angle).toBeGreaterThanOrEqual(-90.001)
      expect(angle).toBeLessThanOrEqual(0)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(width * 1.05)
      expect(y).toBeLessThanOrEqual(start.y)
    }
  })
}
