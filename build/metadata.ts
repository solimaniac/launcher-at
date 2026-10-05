import { buildAtprotoLoopbackClientMetadata, type OAuthClientMetadataInput } from '@atproto/oauth-types'
import en from '../locales/en.json' with { type: 'json' }

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/**
 * OAuth client metadata served at `/oauth-client-metadata.json`.
 * Loopback HTTP origins use the AT Protocol localhost development client; anything else must be public HTTPS.
 */
export function metadataFor(origin: string): OAuthClientMetadataInput {
  const url = new URL(origin)
  if (url.origin !== origin || url.username || url.password) {
    throw new Error('PUBLIC_ORIGIN must be an origin without a path')
  }
  if (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '[::1]')) {
    return buildAtprotoLoopbackClientMetadata({
      redirect_uris: [`${origin}/callback.html` as `http://127.0.0.1/${string}`],
      scope: 'atproto',
    })
  }
  if (url.protocol !== 'https:' || url.port || LOOPBACK_HOSTS.includes(url.hostname)) {
    throw new Error('PUBLIC_ORIGIN must use public HTTPS without a port')
  }
  return {
    client_id: `${origin}/oauth-client-metadata.json`,
    client_name: en.site.title,
    client_uri: `${origin}/`,
    redirect_uris: [`${origin}/callback.html` as `https://${string}`],
    scope: 'atproto',
    response_types: ['code'],
    grant_types: ['authorization_code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  }
}
