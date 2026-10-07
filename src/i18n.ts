import i18next from 'i18next'
import type { Resource, ResourceLanguage } from 'i18next'

const modules = import.meta.glob<ResourceLanguage['translation']>('../locales/*.json', {
  eager: true,
  import: 'default',
})
const resources: Resource = Object.fromEntries(
  Object.entries(modules).map(([path, translation]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.json'.length),
    { translation },
  ]),
)

export function selectLanguage(preferred: readonly string[], available: readonly string[]): string {
  for (const language of preferred) {
    let candidate = language.toLowerCase()
    while (candidate) {
      const match = available.find(locale => locale.toLowerCase() === candidate)
      if (match) return match
      const separator = candidate.lastIndexOf('-')
      candidate = separator === -1 ? '' : candidate.slice(0, separator)
    }
  }
  return 'en'
}

const preferred =
  typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]

export const i18n = i18next.createInstance()
await i18n.init({
  lng: selectLanguage(preferred, Object.keys(resources)),
  fallbackLng: 'en',
  resources,
  interpolation: { escapeValue: false },
})
if (typeof document !== 'undefined') document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
export const t = i18n.t.bind(i18n)
