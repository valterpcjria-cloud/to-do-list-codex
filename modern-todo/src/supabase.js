import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null

export const SUPABASE_KV_TABLE = import.meta.env.VITE_CRM_KV_TABLE || 'crm_kv'

export const WORKSPACE_STORAGE_KEY = 'nexus-crm-workspace-v1'
export const DEFAULT_WORKSPACE = import.meta.env.VITE_CRM_WORKSPACE || 'default'

export function getWorkspace() {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE
  const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
  return stored || DEFAULT_WORKSPACE
}

export function setWorkspace(workspace) {
  if (typeof window === 'undefined') return
  const value = String(workspace ?? '').trim()
  if (!value) return
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, value)
}

export function clearWorkspace() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
}
