import { expect, test } from 'vitest'
import { selectLanguage, t } from './i18n'
test('interpolates the app name without treating it as markup', () => {
  expect(t('intro.app', { appName: '<Example>' })).toContain('<Example>')
  expect(t('intro.app', { appName: 'Other App' })).toContain('Other App')
})

test.each([
  { preferred: ['fr', 'en'], available: ['en', 'fr'], expected: 'fr' },
  { preferred: ['de', 'fr', 'en'], available: ['en', 'fr'], expected: 'fr' },
  { preferred: ['en', 'fr'], available: ['en', 'fr'], expected: 'en' },
  { preferred: ['fr-CA', 'en'], available: ['en', 'fr'], expected: 'fr' },
  { preferred: ['fr-CA'], available: ['en', 'fr', 'fr-CA'], expected: 'fr-CA' },
  { preferred: ['zh-Hant-TW'], available: ['en', 'zh', 'zh-Hant'], expected: 'zh-Hant' },
  { preferred: ['FR-ca'], available: ['en', 'fr-CA'], expected: 'fr-CA' },
  { preferred: ['de'], available: ['en', 'fr'], expected: 'en' },
  { preferred: [], available: ['en', 'fr'], expected: 'en' },
])('selects $expected for $preferred with $available available', ({ preferred, available, expected }) => {
  expect(selectLanguage(preferred, available)).toBe(expected)
})
