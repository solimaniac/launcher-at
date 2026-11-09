import englishSource from '../../../copy/en.json'
import type { Translate } from './types'

/** Replace any key, or pass your own translator. Provider descriptions stay plain text. */
export const english: Readonly<Record<string, string>> = Object.freeze(englishSource)

export function translate(messages: Readonly<Record<string, string>> = english): Translate {
  return (key, values = {}) =>
    (messages[key] ?? english[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''))
}
