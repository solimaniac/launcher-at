import { planTrajectory, type Trajectory } from './trajectory'
import './launches.scss'

export interface LaunchLabel {
  text: string
  logo?: string
}

/** Draws labelled rocket launches across the sky. Knows nothing about where labels come from. */
export interface LaunchLayer {
  launch(label: LaunchLabel): void
  dispose(): void
}

const SVG = 'http://www.w3.org/2000/svg'
const FLIGHT_MS = 18_000
const FADE_MS = 1_200
// Reduced motion: the launch appears frozen mid-flight, then fades. Shorter than the feed's
// 3-second reveal interval so static launches never stack on top of each other.
const STILL_MS = 2_800
const STILL_AT = 0.7
// Seven slots let 18-second flights finish fading at the feed's 3-second cadence.
const MAX_FLIGHTS = 7
// Pixels between the rocket and the end of its trailing label.
const LABEL_GAP = 14
const LOGO_SIZE = 12
const LOGO_GAP = 4
// Rocket chevron pointing along +x, centred on the trajectory head.
const ROCKET = 'M5 0L-4 -3.5L-2 0L-4 3.5Z'

const clamp = (value: number) => Math.min(Math.max(value, 0), 1)

function node<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string> = {}) {
  const element = document.createElementNS(SVG, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

interface Flight {
  readonly group: SVGGElement
  /** Advances to `now`; returns false once the flight has fully faded. */
  update(now: number): boolean
}

let flightIds = 0

function createFlight(trajectory: Trajectory, label: LaunchLabel, still: boolean): Flight {
  const id = `launch-trail-${++flightIds}`
  const group = node('g', { class: 'launch' })
  const trail = node('path', {
    id,
    class: 'launch-trail',
    d: trajectory.path,
    'stroke-dasharray': `${trajectory.length}`,
  })
  const text = node('text', { class: 'launch-label', dy: '-7' })
  const textPath = node('textPath', { href: `#${id}`, 'text-anchor': 'end' })
  textPath.textContent = label.text
  text.append(textPath)
  const logo = label.logo
    ? node('image', {
        class: 'launch-logo',
        href: label.logo,
        x: '0',
        y: `${-LOGO_SIZE}`,
        width: `${LOGO_SIZE}`,
        height: `${LOGO_SIZE}`,
        preserveAspectRatio: 'xMidYMid meet',
      })
    : undefined
  const rocket = node('path', { class: 'launch-rocket', d: ROCKET })
  group.append(trail, text, rocket)
  if (logo) group.append(logo)
  let start: number | undefined
  let lastCharacter: number | undefined
  return {
    group,
    update(now) {
      start ??= now
      const elapsed = now - start
      // Accelerating ascent: a slow lift-off that speeds up as it pitches over.
      const progress = still ? STILL_AT : clamp(elapsed / FLIGHT_MS) ** 1.8
      const opacity = still
        ? clamp(Math.min(elapsed, STILL_MS - elapsed) / FADE_MS)
        : clamp((FLIGHT_MS + FADE_MS - elapsed) / FADE_MS)
      const head = trajectory.length * progress
      const pose = trajectory.poseAt(head)
      trail.setAttribute('stroke-dashoffset', `${trajectory.length - head}`)
      const labelEnd = head - LABEL_GAP
      textPath.setAttribute('startOffset', `${labelEnd - (logo ? LOGO_SIZE + LOGO_GAP : 0)}`)
      if (logo) {
        lastCharacter ??= text.getNumberOfChars() - 1
        // SVG glyph positions already include the curved baseline and its offset.
        // Project the final glyph's bounds onto its tangent to reserve real clearance.
        const end = text.getEndPositionOfChar(lastCharacter)
        const bounds = text.getExtentOfChar(lastCharacter)
        const angle = text.getRotationOfChar(lastCharacter)
        const radians = (angle * Math.PI) / 180
        const cos = Math.cos(radians),
          sin = Math.sin(radians)
        const edge =
          (cos >= 0 ? bounds.x + bounds.width : bounds.x) * cos +
          (sin >= 0 ? bounds.y + bounds.height : bounds.y) * sin -
          end.x * cos -
          end.y * sin
        logo.setAttribute('x', `${edge + LOGO_GAP}`)
        logo.setAttribute('transform', `translate(${end.x} ${end.y}) rotate(${angle})`)
        logo.setAttribute('visibility', bounds.width > 0 && bounds.height > 0 ? 'visible' : 'hidden')
      }
      rocket.setAttribute('transform', `translate(${pose.x} ${pose.y}) rotate(${pose.angle})`)
      group.setAttribute('opacity', `${opacity}`)
      return elapsed < (still ? STILL_MS : FLIGHT_MS + FADE_MS)
    },
  }
}

export function createLaunchLayer(container: HTMLElement, plan: typeof planTrajectory = planTrajectory): LaunchLayer {
  const canvas = node('svg', { class: 'launches-canvas' })
  container.replaceChildren(canvas)
  const flights = new Set<Flight>()
  let frame: number | undefined

  function tick(now: number) {
    for (const flight of flights) {
      if (flight.update(now)) continue
      flight.group.remove()
      flights.delete(flight)
    }
    frame = flights.size ? requestAnimationFrame(tick) : undefined
  }

  return {
    launch(label) {
      for (const oldest of flights) {
        if (flights.size < MAX_FLIGHTS) break
        oldest.group.remove()
        flights.delete(oldest)
      }
      // Unhide first: a hidden container measures 0×0.
      container.hidden = false
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      const flight = createFlight(plan(container.clientWidth, container.clientHeight), label, still)
      flights.add(flight)
      canvas.append(flight.group)
      frame ??= requestAnimationFrame(tick)
    },
    dispose() {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      flights.clear()
      container.replaceChildren()
      container.hidden = true
    },
  }
}
