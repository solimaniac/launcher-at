import atmosphereApps from '../config/atmosphere-apps.json'
import { t } from './i18n'
import { element } from './dom'

/** Auto-scroll speed in CSS pixels per millisecond (≈18px/s). */
const SCROLL_SPEED = 0.018
/** Caps the step after a long frame gap (e.g. a background tab) so the strip never jumps. */
const MAX_FRAME_MS = 50

/**
 * Appends the Atmosphere app discovery strip to `parent` and starts auto-scrolling it.
 * Scrolling pauses on hover, focus, hidden tabs and reduced motion, and stops for good once
 * the user scrolls it manually. Returns a function that stops the animation.
 */
export function renderAppCarousel(parent: HTMLElement): () => void {
  const section = element('section', '', 'app-carousel')
  section.setAttribute('aria-labelledby', 'app-carousel-title')
  const title = element('h2', t('complete.explore'))
  title.id = 'app-carousel-title'
  const viewport = element('div', '', 'app-carousel-viewport')
  const list = element('ul')
  for (const entry of atmosphereApps) {
    const item = element('li')
    const link = element('a')
    link.href = entry.url
    link.title = entry.name
    const logo = element('img')
    logo.src = entry.logo
    logo.alt = entry.name
    logo.width = logo.height = 48
    logo.draggable = false
    link.append(logo)
    item.append(link)
    list.append(item)
  }
  viewport.append(list)
  section.append(title, element('p', t('complete.exploreHint')), viewport)

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let pausedByUser = false
  let hovered = false
  let frame = 0
  let previousTime = 0
  let position = 0

  function tick(now: number) {
    const end = viewport.scrollWidth - viewport.clientWidth
    position += Math.min(now - previousTime, MAX_FRAME_MS) * SCROLL_SPEED
    previousTime = now
    if (position >= end) position = 0
    viewport.scrollLeft = position
    frame = requestAnimationFrame(tick)
  }

  function update() {
    cancelAnimationFrame(frame)
    const shouldPause =
      pausedByUser || hovered || reducedMotion.matches || document.hidden || section.contains(document.activeElement)
    if (shouldPause) return
    position = viewport.scrollLeft
    previousTime = performance.now()
    frame = requestAnimationFrame(tick)
  }

  viewport.onpointerenter = () => {
    hovered = true
    update()
  }
  viewport.onpointerleave = () => {
    hovered = false
    update()
  }
  viewport.onpointerdown = viewport.onwheel = () => {
    pausedByUser = true
    update()
  }
  section.addEventListener('focusin', update)
  // Wait for focus to settle so `document.activeElement` reflects the new target.
  section.addEventListener('focusout', () => queueMicrotask(update))
  reducedMotion.addEventListener('change', update)
  document.addEventListener('visibilitychange', update)

  parent.append(section)
  update()

  return () => {
    cancelAnimationFrame(frame)
    reducedMotion.removeEventListener('change', update)
    document.removeEventListener('visibilitychange', update)
  }
}
