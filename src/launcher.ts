import { t } from './i18n'
import providerSource from '../config/providers.json'
import { DEFAULT_APP_ID, parseProviders, httpsUrl, type Provider } from './config'
import { selectApp, applyTheme } from './apps'
import { SignupError, type SignupOAuth } from './signup'
import { formatJoinCount, type JoinCounts } from './activity'
import { element } from './dom'
import { renderAppCarousel } from './carousel'

/** Seconds before the completion screen sends the user back to the app's `redirectUrl`. */
const REDIRECT_SECONDS = 8

const REGION_FLAGS: Record<string, string> = {
  'United States': '🇺🇸',
  'United Kingdom': '🇬🇧',
  'European Union': '🇪🇺',
  Canada: '🇨🇦',
  Japan: '🇯🇵',
}
const DEFAULT_FLAG = '🌐'

type SortOrder = 'joins' | 'az' | 'za'
type InviteFilter = 'all' | 'none' | 'required'

interface ProviderFilters {
  regions: Set<string>
  invite: InviteFilter
}

/** Join-count order puts missing counts below zero; ties and missing data fall back to A–Z. */
function sortProviders(providers: Provider[], order: SortOrder, counts?: JoinCounts) {
  return [...providers].sort((a, b) => {
    const alphabetical = a.name.localeCompare(b.name)
    if (order === 'az') return alphabetical
    if (order === 'za') return -alphabetical
    const joinsA = counts?.providers.get(a.id) ?? -1
    const joinsB = counts?.providers.get(b.id) ?? -1
    return joinsB - joinsA || alphabetical
  })
}

/** No selected regions means every region matches. */
function matchesFilters(provider: Provider, filters: ProviderFilters) {
  if (filters.regions.size > 0 && !filters.regions.has(provider.region)) return false
  if (filters.invite === 'required' && !provider.requiresInvite) return false
  if (filters.invite === 'none' && provider.requiresInvite) return false
  return true
}

function providerCard(provider: Provider, showJoinCounts: boolean) {
  const card = element('button', '', 'provider')
  card.dataset.provider = provider.id
  const chooseLabel = t('providers.choose', { name: provider.name })
  card.setAttribute(
    'aria-label',
    provider.requiresInvite ? `${chooseLabel}. ${t('providers.inviteRequired')}` : chooseLabel,
  )

  if (provider.logo) {
    const logo = element('img')
    logo.src = provider.logo
    logo.alt = ''
    card.append(logo)
  }

  const region = element('span', '', 'region')
  region.id = `provider-${provider.id}-region`
  const flag = element('span', REGION_FLAGS[provider.region] ?? DEFAULT_FLAG)
  flag.setAttribute('aria-hidden', 'true')
  region.append(flag, document.createTextNode(` ${provider.region}`))

  const description = element('span', t(provider.description), 'provider-description')
  description.id = `provider-${provider.id}-description`
  card.setAttribute('aria-describedby', `${region.id} ${description.id}`)

  const details = element('span', '', 'provider-details')
  details.append(element('strong', provider.name), region, description)
  if (showJoinCounts) {
    // Filled in by `showCounts` once join counts arrive.
    const joins = element('span', '', 'joins')
    joins.dataset.provider = provider.id
    details.append(joins)
  }
  if (provider.requiresInvite) details.append(element('span', t('providers.inviteRequired'), 'invite-required'))
  card.append(details)
  return card
}

function dropdown(id: string, label: string, options: [value: string, label: string][], value: string) {
  const field = element('div', '', 'provider-field')
  const labelElement = element('label', label)
  labelElement.htmlFor = id
  const select = element('select')
  select.id = id
  for (const [optionValue, optionLabel] of options) {
    const option = element('option', optionLabel)
    option.value = optionValue
    select.append(option)
  }
  select.value = value
  field.append(labelElement, select)
  return { field, select }
}

/**
 * Renders the signup wizard into `root`: intro → provider picker → OAuth redirect.
 * With `callback`, finishes the OAuth response instead and shows completion or an error.
 * Returns a cleanup function that stops any running timers.
 */
export async function launch(root: HTMLElement, oauth: SignupOAuth, callback = false, counts?: Promise<JoinCounts>) {
  // The callback page ignores its query string; the app is recovered from the OAuth state instead.
  let selection = selectApp(callback ? null : new URLSearchParams(location.search).get('app'))
  let app = selection.app
  applyTheme(app)

  let providers: Provider[] | undefined
  let joinCounts: JoinCounts | undefined
  // Picker choices persist when the user leaves and returns to the provider screen.
  let sortBy: SortOrder = app.joinCounts === false ? 'az' : 'joins'
  const filters: ProviderFilters = { regions: new Set(), invite: 'all' }
  /** Re-sorts and re-filters the provider picker; set only while it is on screen. */
  let refreshProviders: (() => void) | undefined
  let countdown: number | undefined
  let stopCarousel: (() => void) | undefined

  counts?.then(
    result => {
      joinCounts = result
      showCounts()
      refreshProviders?.()
    },
    () => {},
  )

  const isDefaultApp = () => app.id === DEFAULT_APP_ID

  function showCounts() {
    if (app.joinCounts === false || !joinCounts) return
    for (const node of root.querySelectorAll<HTMLElement>('.provider .joins')) {
      const joined = joinCounts.providers.get(node.dataset.provider!)
      if (joined !== undefined) {
        node.textContent = t('providers.joined', { joined: formatJoinCount(joined), days: joinCounts.windowDays })
      }
    }
  }

  function stopCountdown() {
    window.clearInterval(countdown)
    countdown = undefined
  }

  /** Replaces the page with a new screen: brand header, focused heading, then `content`. */
  function screen(title: string, ...content: HTMLElement[]) {
    document.title = isDefaultApp() ? t('site.title') : t('embed.appTitle', { appName: app.appName })
    refreshProviders = undefined
    stopCountdown()
    stopCarousel?.()
    stopCarousel = undefined
    root.removeAttribute('aria-busy')

    const heading = element('h1', title)
    heading.tabIndex = -1
    const brand = element('div', app.appName, 'brand')
    const logo = element('img', '', 'app-logo')
    logo.src = app.logo_url ?? '/logo.png'
    logo.alt = ''
    logo.referrerPolicy = 'no-referrer'
    brand.prepend(logo)

    root.replaceChildren(brand, heading, ...content)
    heading.focus({ preventScroll: true })
  }

  function unknownAppNotice() {
    if (selection.unknown) root.append(element('p', t('errors.unknownApp'), 'notice'))
  }

  function intro() {
    const lead = isDefaultApp() ? t('intro.generic') : t('intro.app', { appName: app.appName })
    screen(t('intro.title'), element('p', lead))
    root.dataset.view = 'intro'
    unknownAppNotice()

    const benefits = element('ul', '', 'benefits')
    for (const key of ['network', 'hosting', 'reuse', 'ownership']) {
      const item = element('li')
      item.append(element('strong', t(`intro.${key}Title`)), element('p', t(`intro.${key}`)))
      benefits.append(item)
    }
    const create = element('button', t('intro.create'))
    create.onclick = selector
    root.append(create, benefits)
  }

  async function chooseProvider(provider: Provider) {
    for (const control of root.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(
      'button, select, input',
    )) {
      control.disabled = true
    }
    root.setAttribute('aria-busy', 'true')
    const status = element('p', t('oauth.opening'), 'notice')
    status.setAttribute('role', 'status')
    root.append(status)
    try {
      await oauth.start(provider.serviceUrl, app.id)
    } catch (error) {
      showError(error instanceof SignupError ? error.key : 'errors.authorization', selector)
    }
  }

  function selector() {
    try {
      providers ??= parseProviders(providerSource).filter(
        provider => provider.enabled && (!app.providerAllowlist || app.providerAllowlist.includes(provider.id)),
      )
    } catch {
      showError('errors.providers', selector)
      return
    }
    const enabledProviders = providers
    screen(t('providers.title'), element('p', t('providers.intro')))
    root.dataset.view = 'providers'

    // Collapsible "Filter & sort" panel.
    const controls = element('div', '', 'provider-controls')
    controls.id = 'provider-controls'
    controls.hidden = true
    const toggle = element('button', t('providers.filterSort'), 'provider-toggle')
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-controls', controls.id)
    toggle.onclick = () => {
      controls.hidden = !controls.hidden
      toggle.setAttribute('aria-expanded', String(!controls.hidden))
    }

    const invites = dropdown(
      'provider-invites',
      t('providers.inviteFilter'),
      [
        ['all', t('providers.inviteAny')],
        ['none', t('providers.inviteNone')],
        ['required', t('providers.inviteRequired')],
      ],
      filters.invite,
    )
    invites.select.onchange = () => {
      filters.invite = invites.select.value as InviteFilter
      refreshProviders?.()
    }

    const sort = dropdown(
      'provider-sort',
      t('providers.sortBy'),
      [
        ['az', t('providers.sortAZ')],
        ['za', t('providers.sortZA')],
      ],
      sortBy,
    )
    sort.select.onchange = () => {
      sortBy = sort.select.value as SortOrder
      refreshProviders?.()
    }
    // Offered only once join counts are known for at least one provider.
    const joinSortOption = element('option', t('providers.sortJoins'))
    joinSortOption.value = 'joins'

    const regions = element('fieldset', '', 'provider-regions')
    regions.append(element('legend', t('providers.regions')))
    const regionChoices = element('div', '', 'region-choices')
    const regionNames = [...new Set(enabledProviders.map(provider => provider.region))].sort((a, b) =>
      a.localeCompare(b),
    )
    for (const region of regionNames) {
      const label = element('label', '', 'region-choice')
      const checkbox = element('input')
      checkbox.type = 'checkbox'
      checkbox.value = region
      checkbox.checked = filters.regions.has(region)
      checkbox.onchange = () => {
        if (checkbox.checked) filters.regions.add(region)
        else filters.regions.delete(region)
        refreshProviders?.()
      }
      label.append(checkbox, element('span', region))
      regionChoices.append(label)
    }
    const regionHint = element('p', t('providers.regionHint'))
    regionHint.id = 'provider-region-hint'
    regions.setAttribute('aria-describedby', regionHint.id)
    regions.append(regionChoices, regionHint)
    controls.append(invites.field, sort.field, regions)

    // Summary row: result count and "Clear filters", shown only while filters are active.
    const summary = element('div', '', 'provider-summary')
    const resultCount = element('p')
    resultCount.setAttribute('role', 'status')
    resultCount.setAttribute('aria-atomic', 'true')
    const clearFilters = element('button', t('providers.clearFilters'), 'secondary clear-filters')
    clearFilters.onclick = () => {
      filters.regions.clear()
      filters.invite = 'all'
      invites.select.value = 'all'
      for (const checkbox of regionChoices.querySelectorAll('input')) checkbox.checked = false
      // The clicked button hides itself, so move focus to a control that stays visible.
      if (controls.hidden) toggle.focus()
      else invites.select.focus()
      refreshProviders?.()
    }
    summary.append(resultCount, clearFilters, toggle)

    const cards = element('div', '', 'providers')
    const cardsById = new Map<string, HTMLButtonElement>()
    for (const provider of enabledProviders) {
      const card = providerCard(provider, app.joinCounts !== false)
      card.onclick = () => chooseProvider(provider)
      cards.append(card)
      cardsById.set(provider.id, card)
    }

    const empty = element('div', '', 'provider-empty')
    empty.append(element('strong', t('providers.noMatches')), element('p', t('providers.noMatchesHint')))

    refreshProviders = () => {
      // A provider was chosen and the redirect is under way; leave the page as it is.
      if (root.hasAttribute('aria-busy')) return

      const hasCounts =
        app.joinCounts !== false && enabledProviders.some(provider => joinCounts?.providers.has(provider.id))
      if (hasCounts && !joinSortOption.parentNode) sort.select.prepend(joinSortOption)
      sort.select.value = sortBy === 'joins' && !hasCounts ? 'az' : sortBy

      // Re-appending cards reorders them; keep keyboard focus on the card that had it.
      const focused =
        document.activeElement instanceof HTMLButtonElement && cards.contains(document.activeElement)
          ? document.activeElement
          : null
      let visible = 0
      for (const provider of sortProviders(enabledProviders, sort.select.value as SortOrder, joinCounts)) {
        const card = cardsById.get(provider.id)!
        card.hidden = !matchesFilters(provider, filters)
        if (!card.hidden) visible++
        cards.append(card)
      }
      if (focused && !focused.hidden) focused.focus({ preventScroll: true })

      const activeFilters = filters.regions.size + Number(filters.invite !== 'all')
      resultCount.textContent = t('providers.results', { count: visible, total: enabledProviders.length })
      resultCount.hidden = !activeFilters
      clearFilters.hidden = !activeFilters
      toggle.textContent = activeFilters
        ? t('providers.filterSortActive', { count: activeFilters })
        : t('providers.filterSort')
      empty.hidden = visible > 0
      if (!enabledProviders.length) empty.replaceChildren(element('p', t('providers.empty')))
    }

    const back = element('button', t('actions.back'), 'secondary')
    back.onclick = intro
    root.append(summary, controls, cards, empty, back)
    showCounts()
    refreshProviders()
  }

  function restart() {
    history.replaceState(null, '', isDefaultApp() ? '/' : `/?app=${encodeURIComponent(app.id)}`)
    intro()
  }

  function showError(key: string, retry: () => void) {
    screen(t('errors.title'), element('p', t(key)))
    root.dataset.view = 'error'
    const retryButton = element('button', t('actions.retry'))
    retryButton.onclick = retry
    const startOver = element('button', t('actions.restart'), 'secondary')
    startOver.onclick = restart
    root.append(retryButton, startOver)
  }

  function complete(cleanupFailed: boolean) {
    const lead = isDefaultApp() ? t('complete.generic') : t('complete.app', { appName: app.appName })
    screen(t('complete.title'), element('p', lead))
    root.dataset.view = 'complete'
    unknownAppNotice()
    if (cleanupFailed) root.append(element('p', t('errors.cleanup')))
    if (isDefaultApp()) stopCarousel = renderAppCarousel(root)
    if (app.redirectUrl) startRedirect(app.redirectUrl)
  }

  /** Counts down, then navigates to the app's return URL. A fallback link allows returning sooner. */
  function startRedirect(redirectUrl: string) {
    let destination: string
    try {
      destination = httpsUrl(redirectUrl)
    } catch {
      root.append(element('p', t('errors.redirect')))
      return
    }
    const fallback = element('p', `${t('complete.redirectFallback')} `, 'redirect-fallback')
    const link = element('a', t('complete.redirectHere'))
    link.setAttribute('aria-label', t('complete.redirectLink', { appName: app.appName }))
    link.href = destination
    link.onclick = stopCountdown
    fallback.append(link, document.createTextNode('.'))

    let remaining = REDIRECT_SECONDS
    const status = element('p', t('complete.countdown', { appName: app.appName, count: remaining }))
    root.append(status, fallback)
    countdown = window.setInterval(() => {
      remaining -= 1
      if (remaining === 0) {
        stopCountdown()
        location.assign(destination)
      } else {
        status.textContent = t('complete.countdown', { appName: app.appName, count: remaining })
      }
    }, 1000)
  }

  /** Switches to the app recovered from the OAuth state (or the default app). */
  function useApp(appId: string | null) {
    selection = selectApp(appId)
    app = selection.app
    applyTheme(app)
  }

  async function finishCallback() {
    screen(t('oauth.finishing'))
    root.dataset.view = 'pending'
    root.setAttribute('aria-busy', 'true')
    try {
      const result = await oauth.finish()
      useApp(result.appId)
      complete(result.cleanupFailed)
    } catch (error) {
      useApp(error instanceof SignupError ? error.appId : null)
      showError(error instanceof SignupError ? error.key : 'errors.callback', restart)
    }
  }

  window.addEventListener('pagehide', stopCountdown)
  if (callback) await finishCallback()
  else intro()

  return () => {
    stopCountdown()
    stopCarousel?.()
    window.removeEventListener('pagehide', stopCountdown)
  }
}
