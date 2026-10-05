import { t } from './i18n'
import providerSource from '../config/providers.json'
import atmosphereApps from '../config/atmosphere-apps.json'
import { parseProviders, httpsUrl, type Provider } from './config'
import { selectApp, applyTheme } from './apps'
import { SignupError, type SignupOAuth } from './signup'
import { formatJoinCount, type JoinCounts } from './activity'

const regionFlags: Record<string, string> = {
  'United States': '🇺🇸',
  Europe: '🇪🇺',
  Canada: '🇨🇦',
  Japan: '🇯🇵',
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}

export async function launch(root: HTMLElement, oauth: SignupOAuth, callback = false, counts?: Promise<JoinCounts>) {
  let selection = selectApp(callback ? null : new URLSearchParams(location.search).get('app'))
  let app = selection.app
  let providers: Provider[] | undefined
  let countdown: number | undefined
  let stopCarousel: (() => void) | undefined
  applyTheme(app)
  let joinCounts: JoinCounts | undefined
  let sortBy = 'joins'
  let inviteFilter = 'all'
  const selectedRegions = new Set<string>()
  let refreshProviders: (() => void) | undefined
  counts?.then(
    result => {
      joinCounts = result
      showCounts()
      refreshProviders?.()
    },
    () => {},
  )
  function showCounts() {
    if (!joinCounts) return
    for (const node of root.querySelectorAll<HTMLElement>('.provider .joins')) {
      const joined = joinCounts.providers.get(node.dataset.provider!)
      if (joined !== undefined)
        node.textContent = t('providers.joined', { joined: formatJoinCount(joined), days: joinCounts.windowDays })
    }
  }

  function stopCountdown() {
    window.clearInterval(countdown)
    countdown = undefined
  }
  function screen(title: string, ...content: HTMLElement[]) {
    document.title = app.id === 'default' ? t('site.title') : t('embed.appTitle', { appName: app.appName })
    refreshProviders = undefined
    stopCountdown()
    stopCarousel?.()
    stopCarousel = undefined
    root.removeAttribute('aria-busy')
    const heading = element('h1', title)
    heading.tabIndex = -1
    const brand = element('div', app.appName)
    brand.className = 'brand'
    root.replaceChildren(brand, heading, ...content)
    const logo = element('img')
    logo.src = app.logo_url ?? '/logo.png'
    logo.alt = ''
    logo.className = 'app-logo'
    logo.referrerPolicy = 'no-referrer'
    brand.prepend(logo)
    heading.focus({ preventScroll: true })
  }
  function unknownAppNotice() {
    if (!selection.unknown) return
    const notice = element('p', t('errors.unknownApp'))
    notice.className = 'notice'
    root.append(notice)
  }
  function intro() {
    screen(
      t('intro.title'),
      element('p', app.id === 'default' ? t('intro.generic') : t('intro.app', { appName: app.appName })),
    )
    root.dataset.view = 'intro'
    unknownAppNotice()
    const list = element('ul')
    list.className = 'benefits'
    for (const key of ['network', 'hosting', 'reuse', 'ownership']) {
      const item = element('li')
      item.append(element('strong', t(`intro.${key}Title`)), element('p', t(`intro.${key}`)))
      list.append(item)
    }
    const create = element('button', t('intro.create'))
    create.onclick = selector
    root.append(create, list)
  }
  function selector() {
    try {
      providers ??= parseProviders(providerSource).filter(p => p.enabled)
    } catch {
      showError('errors.providers', selector)
      return
    }
    screen(t('providers.title'), element('p', t('providers.intro')))
    root.dataset.view = 'providers'
    const cards = element('div')
    const controls = element('div')
    controls.className = 'provider-controls'
    controls.id = 'provider-controls'
    controls.hidden = true
    const toggle = element('button', t('providers.filterSort'))
    toggle.className = 'provider-toggle'
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-controls', controls.id)
    toggle.onclick = () => {
      controls.hidden = !controls.hidden
      toggle.setAttribute('aria-expanded', String(!controls.hidden))
    }
    function dropdown(id: string, title: string, options: [string, string][], value: string) {
      const field = element('div')
      field.className = 'provider-field'
      const label = element('label', title)
      label.htmlFor = id
      const select = element('select')
      select.id = id
      for (const [value, title] of options) {
        const option = element('option', title)
        option.value = value
        select.append(option)
      }
      select.value = value
      field.append(label, select)
      controls.append(field)
      return select
    }
    const invites = dropdown(
      'provider-invites',
      t('providers.inviteFilter'),
      [
        ['all', t('providers.inviteAny')],
        ['none', t('providers.inviteNone')],
        ['required', t('providers.inviteRequired')],
      ],
      inviteFilter,
    )
    const sort = dropdown(
      'provider-sort',
      t('providers.sortBy'),
      [
        ['az', t('providers.sortAZ')],
        ['za', t('providers.sortZA')],
      ],
      sortBy,
    )
    const joinSortOption = element('option', t('providers.sortJoins'))
    joinSortOption.value = 'joins'
    const regions = element('fieldset')
    regions.className = 'provider-regions'
    regions.append(element('legend', t('providers.regions')))
    const regionChoices = element('div')
    regionChoices.className = 'region-choices'
    for (const region of [...new Set(providers.map(provider => provider.region))].sort((a, b) => a.localeCompare(b))) {
      const label = element('label')
      label.className = 'region-choice'
      const checkbox = element('input')
      checkbox.type = 'checkbox'
      checkbox.value = region
      checkbox.checked = selectedRegions.has(region)
      checkbox.onchange = () => {
        if (checkbox.checked) selectedRegions.add(region)
        else selectedRegions.delete(region)
        refreshProviders?.()
      }
      label.append(checkbox, element('span', region))
      regionChoices.append(label)
    }
    const regionHint = element('p', t('providers.regionHint'))
    regionHint.id = 'provider-region-hint'
    regions.setAttribute('aria-describedby', regionHint.id)
    regions.append(regionChoices, regionHint)
    controls.append(regions)
    const summary = element('div')
    summary.className = 'provider-summary'
    const resultCount = element('p')
    resultCount.setAttribute('role', 'status')
    resultCount.setAttribute('aria-atomic', 'true')
    const reset = element('button', t('providers.clearFilters'))
    reset.className = 'secondary clear-filters'
    reset.onclick = () => {
      selectedRegions.clear()
      inviteFilter = invites.value = 'all'
      for (const checkbox of regionChoices.querySelectorAll('input')) checkbox.checked = false
      if (controls.hidden) toggle.focus()
      else invites.focus()
      refreshProviders?.()
    }
    summary.append(resultCount, reset, toggle)
    cards.className = 'providers'
    const providerCards = new Map<string, HTMLButtonElement>()
    for (const provider of providers) {
      const card = element('button')
      card.className = 'provider'
      card.dataset.provider = provider.id
      card.setAttribute('aria-label', t('providers.choose', { name: provider.name }))
      const details = element('span')
      details.className = 'provider-details'
      if (provider.logo) {
        const logo = element('img')
        logo.src = provider.logo
        logo.alt = ''
        card.append(logo)
      }
      const region = element('span')
      const flag = element('span', regionFlags[provider.region] ?? '🌐')
      flag.setAttribute('aria-hidden', 'true')
      region.append(flag, document.createTextNode(` ${provider.region}`))
      region.className = 'region'
      region.id = `provider-${provider.id}-region`
      const joins = element('span')
      joins.className = 'joins'
      joins.dataset.provider = provider.id
      const description = element('span', t(provider.description))
      description.className = 'provider-description'
      description.id = `provider-${provider.id}-description`
      card.setAttribute('aria-describedby', `${region.id} ${description.id}`)
      details.append(element('strong', provider.name), region, description, joins)
      card.append(details)
      if (provider.requiresInvite) {
        const invite = element('span', t('providers.inviteRequired'))
        invite.className = 'invite-required'
        details.append(invite)
        card.setAttribute(
          'aria-label',
          `${t('providers.choose', { name: provider.name })}. ${t('providers.inviteRequired')}`,
        )
      }
      card.onclick = async () => {
        for (const control of root.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(
          'button, select, input',
        ))
          control.disabled = true
        root.setAttribute('aria-busy', 'true')
        const status = element('p', t('oauth.opening'))
        status.className = 'notice'
        status.setAttribute('role', 'status')
        root.append(status)
        try {
          await oauth.start(provider.serviceUrl, app.id)
        } catch (error) {
          showError(error instanceof SignupError ? error.key : 'errors.authorization', selector)
        }
      }
      cards.append(card)
      providerCards.set(provider.id, card)
    }
    const empty = element('div')
    empty.className = 'provider-empty'
    empty.append(element('strong', t('providers.noMatches')), element('p', t('providers.noMatchesHint')))
    refreshProviders = () => {
      if (root.hasAttribute('aria-busy')) return
      const hasCounts = providers!.some(provider => joinCounts?.providers.has(provider.id))
      if (hasCounts && !joinSortOption.parentNode) sort.prepend(joinSortOption)
      sort.value = sortBy === 'joins' && !hasCounts ? 'az' : sortBy
      const ordered = [...providers!].sort((a, b) => {
        const alphabetical = a.name.localeCompare(b.name)
        if (sortBy === 'az') return alphabetical
        if (sortBy === 'za') return -alphabetical
        // Missing counts rank below zero; ties and unavailable data use A-Z.
        return (joinCounts?.providers.get(b.id) ?? -1) - (joinCounts?.providers.get(a.id) ?? -1) || alphabetical
      })
      const focused =
        document.activeElement instanceof HTMLButtonElement && cards.contains(document.activeElement)
          ? document.activeElement
          : null
      let visible = 0
      for (const provider of ordered) {
        const card = providerCards.get(provider.id)!
        card.hidden =
          (selectedRegions.size > 0 && !selectedRegions.has(provider.region)) ||
          (inviteFilter === 'required' && !provider.requiresInvite) ||
          (inviteFilter === 'none' && !!provider.requiresInvite)
        if (!card.hidden) visible++
        cards.append(card)
      }
      if (focused && !focused.hidden) focused.focus({ preventScroll: true })
      resultCount.textContent = t('providers.results', { count: visible, total: providers!.length })
      const activeFilters = selectedRegions.size + Number(inviteFilter !== 'all')
      resultCount.hidden = !activeFilters
      reset.hidden = !activeFilters
      toggle.textContent = activeFilters
        ? t('providers.filterSortActive', { count: activeFilters })
        : t('providers.filterSort')
      empty.hidden = visible > 0
      if (!providers!.length) empty.replaceChildren(element('p', t('providers.empty')))
    }
    invites.onchange = () => {
      inviteFilter = invites.value
      refreshProviders?.()
    }
    sort.onchange = () => {
      sortBy = sort.value
      refreshProviders?.()
    }
    const back = element('button', t('actions.back'))
    back.className = 'secondary'
    back.onclick = intro
    root.append(summary, controls, cards, empty)
    root.append(back)
    showCounts()
    refreshProviders()
  }
  function restart() {
    history.replaceState(null, '', app.id === 'default' ? '/' : `/?app=${encodeURIComponent(app.id)}`)
    intro()
  }
  function showError(key: string, retry: () => void) {
    screen(t('errors.title'), element('p', t(key)))
    root.dataset.view = 'error'
    const button = element('button', t('actions.retry'))
    button.onclick = retry
    const startOver = element('button', t('actions.restart'))
    startOver.className = 'secondary'
    startOver.onclick = restart
    root.append(button, startOver)
  }
  function appCarousel() {
    const section = element('section')
    section.className = 'app-carousel'
    section.setAttribute('aria-labelledby', 'app-carousel-title')
    const title = element('h2', t('complete.explore'))
    title.id = 'app-carousel-title'
    const viewport = element('div')
    viewport.className = 'app-carousel-viewport'
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
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let paused = false,
      hovered = false,
      frame = 0,
      previous = 0,
      position = 0
    function tick(now: number) {
      const end = viewport.scrollWidth - viewport.clientWidth
      position += Math.min(now - previous, 50) * 0.018
      previous = now
      if (position >= end) position = 0
      viewport.scrollLeft = position
      frame = requestAnimationFrame(tick)
    }
    function update() {
      cancelAnimationFrame(frame)
      if (paused || hovered || motion.matches || document.hidden || section.contains(document.activeElement)) return
      position = viewport.scrollLeft
      previous = performance.now()
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
      paused = true
      update()
    }
    section.addEventListener('focusin', update)
    section.addEventListener('focusout', () => queueMicrotask(update))
    motion.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    root.append(section)
    update()
    stopCarousel = () => {
      cancelAnimationFrame(frame)
      motion.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
    }
  }
  function complete(cleanupFailed: boolean) {
    screen(
      t('complete.title'),
      element('p', app.id === 'default' ? t('complete.generic') : t('complete.app', { appName: app.appName })),
    )
    root.dataset.view = 'complete'
    unknownAppNotice()
    if (cleanupFailed) root.append(element('p', t('errors.cleanup')))
    if (app.id === 'default') appCarousel()
    if (!app.redirectUrl) return
    let destination: string
    try {
      destination = httpsUrl(app.redirectUrl)
    } catch {
      root.append(element('p', t('errors.redirect')))
      return
    }
    const fallback = element('p', `${t('complete.redirectFallback')} `)
    fallback.className = 'redirect-fallback'
    const link = element('a', t('complete.redirectHere'))
    link.setAttribute('aria-label', t('complete.redirectLink', { appName: app.appName }))
    link.href = destination
    link.onclick = stopCountdown
    fallback.append(link, document.createTextNode('.'))
    let remaining = 8
    const status = element('p', t('complete.countdown', { appName: app.appName, count: remaining }))
    root.append(status, fallback)
    countdown = window.setInterval(() => {
      remaining -= 1
      if (remaining === 0) {
        stopCountdown()
        location.assign(destination)
      } else status.textContent = t('complete.countdown', { appName: app.appName, count: remaining })
    }, 1000)
  }
  window.addEventListener('pagehide', stopCountdown)
  if (callback) {
    screen(t('oauth.finishing'))
    root.dataset.view = 'pending'
    root.setAttribute('aria-busy', 'true')
    try {
      const result = await oauth.finish()
      selection = selectApp(result.appId)
      app = selection.app
      applyTheme(app)
      complete(result.cleanupFailed)
    } catch (error) {
      selection = selectApp(error instanceof SignupError ? error.appId : null)
      app = selection.app
      applyTheme(app)
      showError(error instanceof SignupError ? error.key : 'errors.callback', restart)
    }
  } else intro()
  return () => {
    stopCountdown()
    stopCarousel?.()
    window.removeEventListener('pagehide', stopCountdown)
  }
}
