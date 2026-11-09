export function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text = '',
  className = '',
  part = className,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  node.textContent = text
  if (className) node.className = className
  if (part) node.dataset.part = part
  return node
}

export function button(doc: Document, text: string, action: () => void, className = '') {
  const node = element(doc, 'button', text, className, 'button')
  node.type = 'button'
  node.onclick = action
  return node
}

let sequence = 0
export function uniqueId() {
  return `launcher-${++sequence}`
}

/** Logos are optional, app-resolved assets. Never turn a filename into an origin-relative URL implicitly. */
export function safeLogoUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !value.includes('..')) return value
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href
  } catch {
    /* Omit malformed assets; provider names still identify every choice. */
  }
  return undefined
}
