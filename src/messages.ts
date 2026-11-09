import type { Translate } from './types'

/** Replace any key, or pass your own translator. Provider descriptions stay plain text. */
export const english: Readonly<Record<string, string>> = Object.freeze({
  'signin.title': 'Sign in to {{appName}}',
  'signin.intro': 'Use your Bluesky or other Atmosphere account. You do not need a new account for each app.',
  'signin.label': 'Your handle',
  'signin.hint': 'For example, alice.bsky.social or your own domain. You will sign in securely with your account host.',
  'signin.submit': 'Sign in',
  'signin.create': 'Create an account',
  'signin.explainTitle': 'How sign-in works',
  'signin.explain':
    'Your account host opens its own sign-in page. Enter your password there and review the access this app requests. Your account stays with your host.',
  'intro.title': 'Your account on the Atmosphere',
  'intro.generic': 'The Atmosphere is a network of apps, including Bluesky, that can work with the same account.',
  'intro.app':
    '{{appName}} is part of the Atmosphere: a network of apps, including Bluesky, that can work with the same account.',
  'intro.networkTitle': 'Use the account you have',
  'intro.network':
    'If you use Bluesky or another Atmosphere app, you may already have an account. Sign in with its handle.',
  'intro.hostingTitle': 'Choose an account host',
  'intro.hosting': 'Your host stores your account and app data. You will create your account on its website.',
  'intro.reuseTitle': 'Try other apps',
  'intro.reuse': 'Use the same handle in compatible apps. Each app asks for the access it needs.',
  'intro.ownershipTitle': 'Keep your choice of host',
  'intro.ownership': 'AT Protocol supports moving your account to another host. Migration tools and app support vary.',
  'intro.create': 'Choose an account host',
  'intro.signin': 'I already have an account',
  'actions.back': 'Back',
  'actions.restart': 'Start over',
  'actions.retry': 'Try again',
  'actions.close': 'Close sign in',
  'providers.title': 'Choose an account host',
  'providers.intro':
    'Your host stores your account and data. Compare its terms, region, and signup requirements. You will continue on its website.',
  'providers.choose': 'Continue with {{name}}',
  'providers.inviteRequired': 'Invite code required',
  'providers.inviteUnknown': 'Signup requirements may vary',
  'providers.empty': 'This app has no account hosts available for signup.',
  'providers.filterSort': 'Filter & sort',
  'providers.filterSortActive': 'Filter & sort ({{count}})',
  'providers.sortBy': 'Sort by',
  'providers.sortAZ': 'Name: A–Z',
  'providers.sortZA': 'Name: Z–A',
  'providers.inviteFilter': 'Invite codes',
  'providers.inviteAny': 'All signup options',
  'providers.inviteNone': 'Not marked invite-only',
  'providers.regions': 'Regions',
  'providers.regionHint':
    'Select regions, or leave all unchecked to show every region. A listed region is not a data residency guarantee.',
  'providers.clearFilters': 'Clear filters',
  'providers.results': '{{count}} of {{total}} hosts',
  'providers.noMatches': 'No hosts match your filters',
  'providers.noMatchesHint': 'Try another region or clear your filters.',
  'providers.customLabel': 'Your account host address',
  'providers.customHint': 'For a host you run or one that is not listed. Use its HTTPS address.',
  'providers.customSubmit': 'Continue to this host',
  'oauth.opening': 'Opening your account host…',
  'oauth.finishing': 'Finishing sign in…',
  'complete.title': 'Your account is ready',
  'complete.hint': 'You can use this account in compatible Atmosphere apps.',
  'errors.title': 'We could not complete this step',
  'errors.identifier': 'Enter your full handle, such as alice.bsky.social, or an AT Protocol DID.',
  'errors.service': 'Enter an HTTPS host address without a username, password, query, or fragment.',
  'errors.provider': 'This account host is not available for signup in this app. Choose another host.',
  'errors.initialization': 'The sign-in client could not start. Check your connection and try again.',
  'errors.unsupportedProvider':
    'This host’s sign-in service is unavailable or unsupported. Try again or choose another host.',
  'errors.authorization': 'We could not open your account host. Check your connection and try again.',
  'errors.cancelled': 'Sign in was cancelled. You can try again when you are ready.',
  'errors.callback': 'We could not verify the sign-in result. Start again to reconnect.',
})

export function translate(messages: Readonly<Record<string, string>> = english): Translate {
  return (key, values = {}) =>
    (messages[key] ?? english[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''))
}
