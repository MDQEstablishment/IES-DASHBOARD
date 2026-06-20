import { createContext, useContext, useState, useCallback, useMemo } from 'react'

// Lets nested detail pages register human labels for URL ids (project code,
// building name, install item) so the Shell breadcrumb shows names, not raw ids,
// without the Shell having to fetch anything itself.
const Ctx = createContext(null)

export function BreadcrumbProvider({ children }) {
  const [labels, setLabels] = useState({})
  const setLabel = useCallback((key, val) => {
    if (!key || val == null) return
    setLabels((prev) => (prev[key] === val ? prev : { ...prev, [key]: val }))
  }, [])
  const value = useMemo(() => ({ labels, setLabel }), [labels, setLabel])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useBreadcrumb = () => useContext(Ctx) || { labels: {}, setLabel: () => {} }
