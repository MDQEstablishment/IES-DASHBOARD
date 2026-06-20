import * as Sentry from '@sentry/react'

// Boots Sentry when a DSN is provided; otherwise no-ops with a clear console note.
// TODO: set VITE_SENTRY_DSN (free sentry.io project) to enable error tracking.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) {
    console.info('[IES] Sentry disabled — no VITE_SENTRY_DSN set (error tracking off).')
    return
  }
  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.2,
      integrations: [],
    })
    console.info('[IES] Sentry initialised.')
  } catch (e) {
    console.warn('[IES] Sentry init failed:', e)
  }
}
