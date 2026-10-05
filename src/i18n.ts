import i18next from 'i18next'
import en from '../locales/en.json'

export const i18n = i18next.createInstance()
await i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
})
export const t = i18n.t.bind(i18n)
