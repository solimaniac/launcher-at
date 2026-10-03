import { expect, test } from 'vitest'
import { t } from './i18n'
test('interpolates the app name without treating it as markup', () => {
  expect(t('intro.app', { appName: '<Example>' })).toContain('<Example>')
  expect(t('intro.app', { appName: 'Other App' })).toContain('Other App')
})
