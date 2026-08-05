// Module-resolution hooks so `node --test` can import src/lib/* unchanged.
//
// TWO problems, both properties of the app rather than of the tests, and
// neither worth changing app code to dodge:
//
//  1. The app is bundled by Vite, so its relative imports are EXTENSIONLESS
//     ('./savingSheet'). Node's ESM resolver requires the extension. The hook
//     retries with '.js' rather than every module gaining an extension purely
//     to please the test runner.
//
//  2. src/lib/supabase.js reads `import.meta.env` and constructs a live client
//     at import time. Under node that is a TypeError before any test body runs.
//     The hook points that ONE specifier at tests/harness/supabase-stub.mjs.
//     Nothing else is stubbed: the engine under test is the real file, byte for
//     byte, which is the entire point of hashing it in the census.
const STUB = new URL('./supabase-stub.mjs', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || ''
  if (parent.includes('/src/lib/') && /^\.\/supabase(\.js)?$/.test(specifier)) {
    return { url: STUB, shortCircuit: true }
  }
  if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
    try {
      return await nextResolve(specifier, context)
    } catch {
      return nextResolve(`${specifier}.js`, context)
    }
  }
  return nextResolve(specifier, context)
}
