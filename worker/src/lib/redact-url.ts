/**
 * Redacts secret values from a URL's query string before it gets logged.
 *
 * The SSE endpoints (`/chat/stream`, `/cashier/runtime-state/stream`) accept the
 * JWT via `?token=` because EventSource cannot send an Authorization header.
 * Logging the raw `req.originalUrl` would persist that JWT in stdout / Loki /
 * Alloy, where anyone with log access could replay it until it expires. We swap
 * the value of any known sensitive query param with `REDACTED`, preserving the
 * rest of the URL so logs stay useful for debugging.
 *
 * Matching is on the exact param name (anchored to `?`/`&` and `=`), so a
 * non-sensitive param whose value merely contains "token" is left untouched.
 */
const SENSITIVE_QUERY_KEYS = [
  'token',
  'access_token',
  'refresh_token',
  'jwt',
  'password',
  'secret',
  'api_key',
  'apikey',
  'key',
  'authorization',
  'auth',
];

const SENSITIVE_QUERY_RE = new RegExp(
  `([?&](?:${SENSITIVE_QUERY_KEYS.join('|')})=)[^&#]*`,
  'gi',
);

export function redactUrlSecrets(url: string): string {
  return url.replace(SENSITIVE_QUERY_RE, '$1REDACTED');
}
