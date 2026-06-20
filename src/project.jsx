import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

// Selected project for the sidebar switcher. 'ALL' = whole portfolio.
const Ctx = createContext(null)

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(() => localStorage.getItem('ies.project') || 'ALL')

  useEffect(() => {
    supabase.from('projects').select('id,code,name,status').order('code')
      .then(({ data }) => setProjects(data || []))
  }, [])

  const set = (id) => { setProjectId(id); localStorage.setItem('ies.project', id) }
  const current = projectId === 'ALL' ? null : projects.find((p) => p.id === projectId) || null

  return <Ctx.Provider value={{ projects, projectId, current, setProjectId: set }}>{children}</Ctx.Provider>
}

export const useProject = () => useContext(Ctx)
