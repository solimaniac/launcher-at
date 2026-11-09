import type { AccountProvider, Translate } from './types'
import { translate } from './messages'
import { button, element, safeLogoUrl, uniqueId } from './elements'

export interface ProviderPickerState {
  sortBy: 'az' | 'za'
  regions: Set<string>
  invite: 'all' | 'none' | 'required'
}

export function createProviderPickerState(): ProviderPickerState {
  return { sortBy: 'az', regions: new Set(), invite: 'none' }
}

export interface ProviderPickerOptions {
  providers: readonly AccountProvider[]
  onSelect: (provider: AccountProvider) => void
  t?: Translate
  state?: ProviderPickerState
  idPrefix?: string
  logoUrl?: (provider: AccountProvider) => string | undefined
}

/** Standalone picker. All text uses textContent; all buttons have type=button. */
export function renderProviderPicker(doc: Document, options: ProviderPickerOptions) {
  const t = options.t ?? translate()
  const model = options.state ?? createProviderPickerState()
  const prefix = options.idPrefix ?? uniqueId()
  const providers = options.providers.filter(p => p.enabled)
  const root = element(doc, 'div', '', '', 'provider-picker')
  const controls = element(doc, 'div', '', 'provider-controls')
  controls.id = `${prefix}-controls`
  controls.hidden = true
  const toggle = button(
    doc,
    t('providers.filterSort'),
    () => {
      controls.hidden = !controls.hidden
      toggle.setAttribute('aria-expanded', String(!controls.hidden))
    },
    'provider-toggle',
  )
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-controls', controls.id)

  function dropdown(suffix: string, label: string, entries: [string, string][], value: string) {
    const field = element(doc, 'div', '', 'provider-field')
    const text = element(doc, 'label', label)
    const select = element(doc, 'select')
    select.id = `${prefix}-${suffix}`
    text.htmlFor = select.id
    for (const [id, name] of entries) {
      const option = element(doc, 'option', name)
      option.value = id
      select.append(option)
    }
    select.value = value
    field.append(text, select)
    return { field, select }
  }
  const invites = dropdown(
    'invites',
    t('providers.inviteFilter'),
    [
      ['all', t('providers.inviteAny')],
      ['none', t('providers.inviteNone')],
      ['required', t('providers.inviteRequired')],
    ],
    model.invite,
  )
  const sort = dropdown(
    'sort',
    t('providers.sortBy'),
    [
      ['az', t('providers.sortAZ')],
      ['za', t('providers.sortZA')],
    ],
    model.sortBy,
  )
  const regions = element(doc, 'fieldset', '', 'provider-regions')
  regions.append(element(doc, 'legend', t('providers.regions')))
  const regionChoices = element(doc, 'div', '', 'region-choices')
  for (const region of [...new Set(providers.map(p => p.region))].sort((a, b) => a.localeCompare(b))) {
    const label = element(doc, 'label', '', 'region-choice')
    const input = element(doc, 'input')
    input.type = 'checkbox'
    input.value = region
    input.checked = model.regions.has(region)
    input.onchange = () => {
      if (input.checked) model.regions.add(region)
      else model.regions.delete(region)
      refresh()
    }
    label.append(input, element(doc, 'span', region))
    regionChoices.append(label)
  }
  const regionHint = element(doc, 'p', t('providers.regionHint'))
  regionHint.id = `${prefix}-region-hint`
  regions.setAttribute('aria-describedby', regionHint.id)
  regions.append(regionChoices, regionHint)
  controls.append(invites.field, sort.field, regions)

  const summary = element(doc, 'div', '', 'provider-summary')
  const count = element(doc, 'p')
  count.setAttribute('role', 'status')
  count.setAttribute('aria-atomic', 'true')
  const clear = button(
    doc,
    t('providers.clearFilters'),
    () => {
      model.regions.clear()
      model.invite = 'all'
      invites.select.value = 'all'
      for (const input of regionChoices.querySelectorAll('input')) input.checked = false
      if (controls.hidden) toggle.focus()
      else invites.select.focus()
      refresh()
    },
    'secondary clear-filters',
  )
  summary.append(count, clear, toggle)

  const cards = element(doc, 'div', '', 'providers')
  const byId = new Map<AccountProvider, HTMLButtonElement>()
  providers.forEach((provider, index) => {
    const card = button(doc, '', () => options.onSelect(provider), 'provider')
    card.dataset.provider = provider.id
    const choose = t('providers.choose', { name: provider.name })
    card.setAttribute('aria-label', provider.requiresInvite ? `${choose}. ${t('providers.inviteRequired')}` : choose)
    const logoUrl = safeLogoUrl(options.logoUrl?.(provider))
    if (logoUrl) {
      const image = element(doc, 'img')
      image.src = logoUrl
      image.alt = ''
      image.referrerPolicy = 'no-referrer'
      card.append(image)
    }
    const region = element(doc, 'span', provider.region, 'region')
    region.id = `${prefix}-${index}-region`
    const description = element(doc, 'span', provider.description, 'provider-description')
    description.id = `${prefix}-${index}-description`
    card.setAttribute('aria-describedby', `${region.id} ${description.id}`)
    const details = element(doc, 'span', '', 'provider-details')
    details.append(element(doc, 'strong', provider.name), region, description)
    if (provider.requiresInvite) details.append(element(doc, 'span', t('providers.inviteRequired'), 'invite-required'))
    card.append(details)
    byId.set(provider, card)
    cards.append(card)
  })
  const empty = element(doc, 'div', '', 'provider-empty')
  empty.append(element(doc, 'strong', t('providers.noMatches')), element(doc, 'p', t('providers.noMatchesHint')))
  if (!providers.length) empty.replaceChildren(element(doc, 'p', t('providers.empty')))
  let busy = false
  function refresh() {
    if (busy) return
    const focused = doc.activeElement
    let visible = 0
    const sorted = [...providers].sort((a, b) => (model.sortBy === 'za' ? -1 : 1) * a.name.localeCompare(b.name))
    for (const provider of sorted) {
      const card = byId.get(provider)!
      card.hidden =
        (model.regions.size > 0 && !model.regions.has(provider.region)) ||
        (model.invite === 'required' && provider.requiresInvite !== true) ||
        (model.invite === 'none' && provider.requiresInvite === true)
      if (!card.hidden) visible++
      cards.append(card)
    }
    if (focused instanceof HTMLElement && cards.contains(focused) && !focused.hidden)
      focused.focus({ preventScroll: true })
    const activeFilters = model.regions.size + Number(model.invite !== 'all')
    count.textContent = t('providers.results', { count: visible, total: providers.length })
    count.hidden = !activeFilters
    clear.hidden = !activeFilters
    toggle.textContent = activeFilters
      ? t('providers.filterSortActive', { count: activeFilters })
      : t('providers.filterSort')
    empty.hidden = visible > 0
  }
  invites.select.onchange = () => {
    model.invite = invites.select.value as ProviderPickerState['invite']
    refresh()
  }
  sort.select.onchange = () => {
    model.sortBy = sort.select.value as ProviderPickerState['sortBy']
    refresh()
  }
  root.append(summary, controls, cards, empty)
  refresh()
  return {
    element: root,
    setBusy(value: boolean) {
      busy = value
      for (const control of root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
        'input, select, button',
      ))
        control.disabled = value
    },
  }
}
