import type { AccountProvider, LoginState, Translate, View } from './types'
import type { LoginFlow } from './flow'
import { translate } from './messages'
import { button, element, uniqueId } from './elements'
import { createProviderPickerState, renderProviderPicker } from './picker'

export {
  renderProviderPicker,
  createProviderPickerState,
  type ProviderPickerOptions,
  type ProviderPickerState,
} from './picker'

export interface MountOptions<Result> {
  appName?: string
  t?: Translate
  headingLevel?: 1 | 2 | 3
  presentation?: 'inline' | 'fullscreen'
  idPrefix?: string
  logoUrl?: (provider: AccountProvider) => string | undefined
  /** Runs after replacing a screen, before heading focus. Add your own brand or notices here. */
  onScreen?: (root: HTMLElement, view: View) => void
  renderComplete?: (root: HTMLElement, result: Result) => void
}

/** Accessible light DOM. No CSS, fonts, document title, navigation or global theme changes. */
export function mountLogin<Result>(root: HTMLElement, flow: LoginFlow<Result>, options: MountOptions<Result> = {}) {
  const doc = root.ownerDocument
  const t = options.t ?? translate()
  const prefix = options.idPrefix ?? uniqueId()
  const appName = options.appName ?? 'this app'
  const pickerState = createProviderPickerState()
  const original = {
    launcher: root.getAttribute('data-launcher'),
    view: root.getAttribute('data-view'),
    presentation: root.getAttribute('data-presentation'),
  }
  root.dataset.launcher = ''
  root.dataset.presentation = options.presentation ?? 'inline'
  let last: LoginState<Result> | undefined
  let picker: ReturnType<typeof renderProviderPicker> | undefined
  let customService = ''
  let disposed = false
  const text = (tag: 'p' | 'h1' | 'h2' | 'h3', key: string) => element(doc, tag, t(key, { appName }))

  function render() {
    if (disposed) return
    const state = flow.getState()
    const replace = !last || last.view !== state.view || last.error !== state.error
    last = state
    if (replace) {
      picker = undefined
      const title =
        state.view === 'intro'
          ? 'intro.title'
          : state.view === 'signin'
            ? 'signin.title'
            : state.view === 'providers'
              ? 'providers.title'
              : state.view === 'error'
                ? 'errors.title'
                : state.view === 'pending'
                  ? 'oauth.finishing'
                  : 'complete.title'
      const heading = text(`h${options.headingLevel ?? 2}`, title)
      heading.id = `${prefix}-heading`
      heading.tabIndex = -1
      heading.dataset.part = 'heading'
      root.replaceChildren(heading)
      root.dataset.view = state.view

      if (state.view === 'intro') {
        root.append(text('p', options.appName ? 'intro.app' : 'intro.generic'))
        root.append(button(doc, t('intro.create'), () => flow.showProviders()))
        if (flow.mode === 'both') root.append(button(doc, t('intro.signin'), () => flow.showSignIn(), 'secondary'))
        const benefits = element(doc, 'ul', '', 'benefits')
        for (const key of ['network', 'hosting', 'reuse', 'ownership']) {
          const item = element(doc, 'li')
          item.append(element(doc, 'strong', t(`intro.${key}Title`)), element(doc, 'p', t(`intro.${key}`)))
          benefits.append(item)
        }
        root.append(benefits)
      } else if (state.view === 'signin') {
        root.append(text('p', 'signin.intro'))
        const form = element(doc, 'form', '', 'signin-form')
        const label = element(doc, 'label', t('signin.label'))
        const input = element(doc, 'input', '', '', 'identifier')
        input.id = `${prefix}-identifier`
        input.type = 'text'
        input.autocomplete = 'username'
        input.autocapitalize = 'none'
        input.setAttribute('autocorrect', 'off')
        input.spellcheck = false
        input.value = state.identifier
        label.htmlFor = input.id
        const hint = text('p', 'signin.hint')
        hint.id = `${prefix}-identifier-hint`
        input.setAttribute('aria-describedby', hint.id)
        const submit = element(doc, 'button', t('signin.submit'), '', 'submit')
        submit.type = 'submit'
        form.append(label, input, hint)
        if (state.error) {
          const error = text('p', state.error)
          error.id = `${prefix}-identifier-error`
          error.setAttribute('role', 'alert')
          input.setAttribute('aria-invalid', 'true')
          input.setAttribute('aria-describedby', `${hint.id} ${error.id}`)
          form.append(error)
        }
        form.append(submit)
        form.onsubmit = event => {
          event.preventDefault()
          void flow.signIn(input.value)
        }
        root.append(form)
        if (flow.mode === 'both') root.append(button(doc, t('signin.create'), () => flow.showSignup(), 'secondary'))
        const explanation = element(doc, 'details', '', '', 'sign-in-explanation')
        explanation.append(element(doc, 'summary', t('signin.explainTitle')), text('p', 'signin.explain'))
        root.append(explanation)
      } else if (state.view === 'providers') {
        root.append(text('p', 'providers.intro'))
        picker = renderProviderPicker(doc, {
          providers: flow.providers,
          state: pickerState,
          t,
          idPrefix: options.idPrefix ?? prefix,
          ...(options.logoUrl ? { logoUrl: options.logoUrl } : {}),
          onSelect: provider => {
            void flow.signUp(provider.id)
          },
        })
        root.append(picker.element)
        if (flow.allowCustomService) {
          const form = element(doc, 'form', '', 'custom-service-form')
          const label = element(doc, 'label', t('providers.customLabel'))
          const input = element(doc, 'input')
          input.id = `${prefix}-service`
          input.type = 'text'
          input.autocapitalize = 'none'
          input.autocomplete = 'off'
          input.spellcheck = false
          input.value = customService
          input.oninput = () => {
            customService = input.value
          }
          label.htmlFor = input.id
          const hint = text('p', 'providers.customHint')
          hint.id = `${prefix}-service-hint`
          input.setAttribute('aria-describedby', hint.id)
          form.append(label, input, hint)
          if (state.error) {
            const error = text('p', state.error)
            error.id = `${prefix}-service-error`
            error.setAttribute('role', 'alert')
            input.setAttribute('aria-invalid', 'true')
            input.setAttribute('aria-describedby', `${hint.id} ${error.id}`)
            form.append(error)
          }
          const submit = element(doc, 'button', t('providers.customSubmit'))
          submit.type = 'submit'
          form.append(submit)
          form.onsubmit = event => {
            event.preventDefault()
            customService = input.value
            void flow.signUpCustom(customService)
          }
          root.append(form)
        }
        root.append(button(doc, t('actions.back'), () => flow.back(), 'secondary'))
      } else if (state.view === 'error') {
        const message = text('p', state.error ?? 'errors.authorization')
        message.setAttribute('role', 'alert')
        root.append(
          message,
          button(doc, t('actions.retry'), () => flow.retry()),
        )
        root.append(
          button(
            doc,
            t('actions.restart'),
            () => {
              if (flow.mode === 'signup') flow.showSignup()
              else flow.showSignIn()
            },
            'secondary',
          ),
        )
      } else if (state.view === 'complete') {
        if (options.renderComplete && state.result !== undefined) options.renderComplete(root, state.result)
        else root.append(text('p', 'complete.hint'))
      }
      options.onScreen?.(root, state.view)
      if (state.error && state.view === 'signin') root.querySelector<HTMLInputElement>('input')?.focus()
      else if (state.error && state.view === 'providers') root.querySelector<HTMLInputElement>('form input')?.focus()
      else heading.focus({ preventScroll: true })
    }
    root.toggleAttribute('aria-busy', state.busy)
    if (state.busy) root.setAttribute('aria-busy', 'true')
    picker?.setBusy(state.busy)
    for (const node of root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      'button, input, select',
    ))
      node.disabled = state.busy
    let status = root.querySelector<HTMLElement>('[data-part="auth-status"]')
    if (state.busy) {
      if (!status) {
        status = element(
          doc,
          'p',
          t(state.view === 'pending' ? 'oauth.finishing' : 'oauth.opening'),
          'notice',
          'auth-status',
        )
        status.setAttribute('role', 'status')
        root.append(status)
      }
    } else status?.remove()
  }
  const unsubscribe = flow.subscribe(render)
  render()
  return () => {
    if (disposed) return
    disposed = true
    unsubscribe()
    root.removeAttribute('aria-busy')
    for (const [key, value] of Object.entries(original)) {
      if (value === null) root.removeAttribute(`data-${key}`)
      else root.setAttribute(`data-${key}`, value)
    }
    root.replaceChildren()
  }
}

/** Native modal dialog: focus containment, Escape, inert background, and opener focus restoration. */
export function openLoginDialog<Result>(
  flow: LoginFlow<Result>,
  options: MountOptions<Result> & {
    document?: Document
    onClose?: () => void
  } = {},
) {
  const doc = options.document ?? document
  const opener = doc.activeElement
  const dialog = element(doc, 'dialog', '', '', 'dialog')
  dialog.dataset.launcherDialog = ''
  const prefix = options.idPrefix ?? uniqueId()
  const root = element(doc, 'div')
  const close = button(doc, (options.t ?? translate())('actions.close'), () => dialog.close(), 'launcher-close')
  dialog.append(close, root)
  doc.body.append(dialog)
  const unmount = mountLogin(root, flow, { ...options, idPrefix: prefix, headingLevel: options.headingLevel ?? 2 })
  dialog.setAttribute('aria-labelledby', `${prefix}-heading`)
  let closed = false
  function cleanup() {
    if (closed) return
    closed = true
    unmount()
    dialog.remove()
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    options.onClose?.()
  }
  dialog.addEventListener('close', cleanup, { once: true })
  try {
    dialog.showModal()
    root.querySelector<HTMLElement>('h1, h2, h3')?.focus()
  } catch (error) {
    cleanup()
    throw error
  }
  return {
    dialog,
    close: () => {
      if (!closed) dialog.close()
    },
    destroy: cleanup,
  }
}
