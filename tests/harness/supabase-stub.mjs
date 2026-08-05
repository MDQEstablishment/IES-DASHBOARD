// The test double for src/lib/supabase.js.
//
// src/lib/supabase.js reads import.meta.env (a Vite construct) and opens a real
// client at module load, so importing savingSheet.js under plain node would
// throw before a single test ran. loader.mjs redirects that one specifier here.
//
// This is deliberately the THINNEST thing that satisfies the one call the engine
// makes — loadConstants()'s `supabase.from('tarshid_constants').select('key,value')`
// — and it records the arguments so T-K1 can assert the query itself, not just
// its result.
let result = { data: [], error: null }
export const calls = []

// The next select() resolves to this. `{ error }` exercises the fallback path.
export function __setResult(r) { result = r }
export function __reset() { result = { data: [], error: null }; calls.length = 0 }

export const supabase = {
  from(table) {
    return {
      select(cols) {
        calls.push({ table, cols })
        return Promise.resolve(result)
      },
    }
  },
}
