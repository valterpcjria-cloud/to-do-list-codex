import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { DEFAULT_WORKSPACE, SUPABASE_KV_TABLE, clearWorkspace, supabase, supabaseConfigured } from './supabase'

const LEADS_STORAGE_KEY = 'nexus-crm-leads-v1'
const DEALS_STORAGE_KEY = 'nexus-crm-deals-v1'
const CONTACTS_STORAGE_KEY = 'nexus-crm-contacts-v1'
const COMPANIES_STORAGE_KEY = 'nexus-crm-companies-v1'
const TASKS_STORAGE_KEY = 'nexus-crm-tasks-v1'
const AUTOMATIONS_STORAGE_KEY = 'nexus-crm-automations-v1'
const AI_AGENT_STORAGE_KEY = 'nexus-crm-ai-agent-v1'

const DEMO_PROVIDER_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_PROVIDER === 'true'

const WorkspaceContext = createContext(DEFAULT_WORKSPACE)

function useWorkspace() {
  return useContext(WorkspaceContext)
}

function useLocalStorageState(key, initialValue) {
  const workspace = useWorkspace()
  const storageKey = `${key}:${workspace}`
  const initialRef = useRef(initialValue)
  initialRef.current = initialValue
  const supabaseWarnedRef = useRef(false)
  const skipSupabaseSyncRef = useRef(true)

  const getDefaultValue = () => {
    const init = initialRef.current
    return typeof init === 'function' ? init() : init
  }

  const readLocal = () => {
    if (typeof window === 'undefined') return getDefaultValue()
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) return JSON.parse(raw)
      if (workspace === DEFAULT_WORKSPACE) {
        const legacy = window.localStorage.getItem(key)
        if (legacy) return JSON.parse(legacy)
      }
    } catch {
      // ignore parse errors
    }
    return getDefaultValue()
  }

  const [state, setState] = useState(readLocal)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    setState(readLocal())
    skipSupabaseSyncRef.current = true
  }, [storageKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // ignore quota errors
    }
  }, [storageKey, state])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return

    let cancelled = false

    const warnOnce = (error) => {
      if (supabaseWarnedRef.current) return
      supabaseWarnedRef.current = true
      console.warn('[supabase] sync desativado por erro:', error)
    }

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from(SUPABASE_KV_TABLE)
          .select('value')
          .eq('workspace', workspace)
          .eq('key', key)
          .maybeSingle()

        if (cancelled) return
        if (error) {
          warnOnce(error)
          return
        }

        if (data?.value !== undefined && data?.value !== null) {
          setState(data.value)
        }
      } catch (err) {
        warnOnce(err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [key, workspace])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    if (supabaseWarnedRef.current) return
    if (skipSupabaseSyncRef.current) {
      skipSupabaseSyncRef.current = false
      return
    }

    const timer = setTimeout(async () => {
      try {
        await supabase.from(SUPABASE_KV_TABLE).upsert(
          {
            workspace,
            key,
            value: stateRef.current,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace,key' },
        )
      } catch (err) {
        if (supabaseWarnedRef.current) return
        supabaseWarnedRef.current = true
        console.warn('[supabase] sync desativado por erro:', err)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [key, state, workspace])

  const reset = () => setState(typeof initialValue === 'function' ? initialValue() : initialValue)

  return [state, setState, reset]
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)

const formatCurrencyShort = (value) => {
  const safeValue = Number(value) || 0
  const thousands = Math.round(safeValue / 1000)
  return `R$ ${thousands}k`
}

const createId = (prefix) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

const initialsFromName = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

const initialsFromCompany = (company) =>
  company
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 2)
    .toUpperCase()

const toSearchable = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const originLabel = (value) =>
  ({
    referral: 'referral',
    instagram: 'instagram',
    linkedin: 'in linkedin',
    whatsapp: 'whatsapp',
    website: 'website',
  })[value] ?? value

const Icon = {
  Bolt: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M13 2 3 14h7l-1 8 12-14h-7l-1-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Grid: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Users: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M16 20v-1.2c0-1.4-2.7-2.8-4-2.8s-4 1.4-4 2.8V20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 13a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 12 13Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  ),
  Dollar: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2v20M16.5 6.5c0-2-2-3.5-4.5-3.5S7.5 4 7.5 6s2 3 4.5 3 4.5 1 4.5 3-2 4-4.5 4-4.5-1.5-4.5-3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  Trophy: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 4h8v4c0 2.2-1.8 4-4 4s-4-1.8-4-4V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M6 5H4v2c0 2.2 1.8 4 4 4M18 5h2v2c0 2.2-1.8 4-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10 12v2.2c0 .5-.3 1-.8 1.2L8 16v2h8v-2l-1.2-.6c-.5-.2-.8-.7-.8-1.2V12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Clipboard: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9 4h6l1 2h3v16H5V6h3l1-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 11h6M9 15h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Refresh: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M20 12a8 8 0 1 1-2.3-5.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 4v6h-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Plus: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Spark: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2l1.2 4.3L18 8l-4.8 1.7L12 14l-1.2-4.3L6 8l4.8-1.7L12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M19 13l.8 2.8L23 17l-3.2 1.2L19 21l-.8-2.8L15 17l3.2-1.2L19 13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Phone: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M7 3h3l1 5-2 1c1 3 3 5 6 6l1-2 5 1v3c0 1-1 2-2 2C10 19 5 14 5 5c0-1 1-2 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Mail: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 6h16v12H4V6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Chat: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M21 12c0 4-4 7-9 7-1 0-2-.1-2.9-.4L3 20l1.4-4C3.5 15 3 13.6 3 12c0-4 4-7 9-7s9 3 9 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Search: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M16.5 16.5 21 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  ChevronDown: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Columns: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 5h6v14H4V5Zm10 0h6v14h-6V5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  List: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9 6h12M9 12h12M9 18h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Building: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 21V5c0-1.1.9-2 2-2h7v18H4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13 8h5c1.1 0 2 .9 2 2v11h-7V8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 7h3M7 11h3M7 15h3M16 12h2M16 16h2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  Calendar: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M7 3v3M17 3v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 7h16v14H4V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 11h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Clock: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Funnel: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Star: (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2 14.9 8.9 22.3 9.5 16.7 14.3 18.4 21.5 12 18 5.6 21.5 7.3 14.3 1.7 9.5 9.1 8.9 12 2Z" />
    </svg>
  ),
  LinkedIn: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 8v.01" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path
        d="M12 18v-4c0-1.7 1-2.7 2.6-2.7 1.5 0 2.4 1 2.4 2.9V18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M12 11v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Instagram: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  ),
  MapPin: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 21s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 13.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  ),
  Globe: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M2 12h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M12 2c2.8 2.7 4.4 6.3 4.4 10S14.8 19.3 12 22c-2.8-2.7-4.4-6.3-4.4-10S9.2 4.7 12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  X: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  ExternalLink: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M14 4h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M20 14v6H4V4h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  WhatsApp: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 3a8.5 8.5 0 0 0-7.4 12.6L3.5 20.5l4.9-1.1A8.5 8.5 0 1 0 12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 9.3h1.6l.5 2-1.1.7c.7 1.4 1.8 2.5 3.2 3.2l.7-1.1 2 .5v1.6c0 .6-.4 1-1 1-4.1-.3-7.8-4-8.1-8.1 0-.6.4-1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Facebook: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M14 8h3V5h-3c-2 0-3.5 1.5-3.5 3.5V11H8v3h2.5v7h3v-7H16l1-3h-3.5V8.5c0-.3.2-.5.5-.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Bot: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M7 7h10a3 3 0 0 1 3 3v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-7a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="13" r="1" fill="currentColor" />
      <circle cx="15" cy="13" r="1" fill="currentColor" />
      <path d="M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Send: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 11.5 21 3l-7.4 18-2.9-7.2L3 11.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M21 3 10.7 13.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Download: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="m8 10 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v3h16v-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  FileText: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 3h7l4 4v14H8V3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M15 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 12h7M10 16h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  BarChart: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 19V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M7 16v-6M12 16V8M17 16v-9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  Target: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  ),
  TrendUp: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 16l6-6 4 4 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 8h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Pencil: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8L16.3 4.5a2 2 0 0 0-2.8 0L3 15v5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12.5 5.5 18.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Trash: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6 7h12l-1 14H7L6 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  LogOut: (props) => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14 7 19 12l-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 12H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Icon.Grid, color: '#2563eb' },
  { id: 'leads', label: 'Leads', icon: Icon.Users, color: '#3b82f6' },
  { id: 'pipeline', label: 'Pipeline', icon: Icon.Dollar, color: '#f97316' },
  { id: 'contacts', label: 'Contatos', icon: Icon.Users, color: '#10b981' },
  { id: 'companies', label: 'Empresas', icon: Icon.Clipboard, color: '#a855f7' },
  { id: 'tasks', label: 'Tarefas', icon: Icon.Clipboard, color: '#ec4899' },
  { id: 'marketing', label: 'Marketing', icon: Icon.Bolt, color: '#f59e0b' },
  { id: 'reports', label: 'Relatórios', icon: Icon.BarChart, color: '#0ea5e9' },
  { id: 'ai', label: 'Agente IA', icon: Icon.Spark, color: '#2563eb' },
]

const LEAD_STAGES = [
  { id: 'new', label: 'Novos', dot: '#2563eb', tint: 'blue' },
  { id: 'contacted', label: 'Contatados', dot: '#f59e0b', tint: 'amber' },
  { id: 'qualified', label: 'Qualificados', dot: '#8b5cf6', tint: 'purple' },
  { id: 'proposal', label: 'Proposta', dot: '#3b82f6', tint: 'indigo' },
  { id: 'negotiation', label: 'Negociação', dot: '#f97316', tint: 'orange' },
  { id: 'won', label: 'Ganhos', dot: '#16a34a', tint: 'green' },
]

const PIPELINE_STAGES = [
  { id: 'discovery', label: 'Descoberta', dot: '#2563eb', tint: 'blue' },
  { id: 'proposal', label: 'Proposta', dot: '#8b5cf6', tint: 'purple' },
  { id: 'negotiation', label: 'Negociação', dot: '#f97316', tint: 'orange' },
  { id: 'contract', label: 'Contrato', dot: '#06b6d4', tint: 'teal' },
]

/*
const demoData = {
  kpis: [
    {
      label: 'Total de leads',
      value: 7,
      trend: '+12%',
      trendHint: 'vs mês anterior',
      icon: Icon.Users,
      color: '#2563eb',
    },
    {
      label: 'Pipeline total',
      value: formatCurrency(465000),
      trend: '+8%',
      trendHint: 'vs mês anterior',
      icon: Icon.Dollar,
      color: '#16a34a',
    },
    {
      label: 'Negócios ganhos',
      value: formatCurrency(0),
      trend: '+0%',
      trendHint: 'vs mês anterior',
      icon: Icon.Trophy,
      color: '#a855f7',
    },
    {
      label: 'Tarefas pendentes',
      value: 4,
      trend: '+15%',
      trendHint: 'vs mês anterior',
      icon: Icon.Clipboard,
      color: '#f97316',
    },
  ],
  quickActions: [
    { id: 'new-lead', label: 'Novo Lead', icon: Icon.Users, color: '#2563eb' },
    { id: 'new-contact', label: 'Novo Contato', icon: Icon.Chat, color: '#10b981' },
    { id: 'new-company', label: 'Nova Empresa', icon: Icon.Clipboard, color: '#a855f7' },
    { id: 'new-deal', label: 'Novo Negócio', icon: Icon.Dollar, color: '#f97316' },
    { id: 'new-task', label: 'Nova Tarefa', icon: Icon.Clipboard, color: '#ec4899' },
    { id: 'ai', label: 'Agente IA', icon: Icon.Spark, color: '#0ea5e9' },
  ],
  leads: [
    {
      id: 'l-1',
      name: 'Valter Junior',
      status: 'Novo',
      score: 50,
      channels: ['referral'],
      lastTouch: 'in 2 hours',
    },
    {
      id: 'l-2',
      name: 'Eduardo Silva',
      status: 'Novo',
      channels: ['referral', 'instagram'],
      lastTouch: 'in 2 hours',
    },
    {
      id: 'l-3',
      name: 'Carlos Silva',
      status: 'Qualificado',
      channels: ['whatsapp'],
      value: 45000,
      score: 85,
      lastTouch: 'in 2 hours',
    },
  ],
  leadsKanban: [
    {
      id: 'k-1',
      name: 'Valter Junior',
      company: '',
      email: 'valter@exemplo.com',
      origin: 'referral',
      score: 50,
      stageId: 'new',
      value: 0,
      lastTouch: 'in 2 hours',
    },
    {
      id: 'k-2',
      name: 'Eduardo Silva',
      company: 'ESD Solução Digital',
      email: 'eduardo@exemplo.com',
      origin: 'referral',
      score: 40,
      stageId: 'new',
      value: 0,
      lastTouch: 'in 2 hours',
    },
    {
      id: 'k-3',
      name: 'Maria Santos',
      company: 'Innovate Solutions',
      email: 'maria@exemplo.com',
      origin: 'instagram',
      score: 60,
      stageId: 'contacted',
      value: 25000,
      lastTouch: '13 hours ago',
    },
    {
      id: 'k-4',
      name: 'Ana Oliveira',
      company: 'StartupX',
      email: 'ana@exemplo.com',
      origin: 'linkedin',
      score: 45,
      stageId: 'contacted',
      value: 15000,
      lastTouch: '13 hours ago',
    },
    {
      id: 'k-5',
      name: 'Carlos Silva',
      company: 'TechCorp Brasil',
      email: 'carlos@exemplo.com',
      origin: 'whatsapp',
      score: 85,
      stageId: 'qualified',
      value: 45000,
      lastTouch: '13 hours ago',
    },
    {
      id: 'k-6',
      name: 'Pedro Costa',
      company: 'Mega Imóveis',
      email: 'pedro@exemplo.com',
      origin: 'website',
      score: 90,
      stageId: 'proposal',
      value: 120000,
      lastTouch: '13 hours ago',
    },
    {
      id: 'k-7',
      name: 'Lucas Ferreira',
      company: 'Nexus Realty',
      email: 'lucas@exemplo.com',
      origin: 'whatsapp',
      score: 70,
      stageId: 'negotiation',
      value: 250000,
      lastTouch: '13 hours ago',
    },
  ],
  pipelineDeals: [
    {
      id: 'd-1',
      title: 'Starter Pack StartupX',
      company: 'StartupX',
      stageId: 'discovery',
      amount: 15000,
      probability: 25,
      closeDate: '28 Feb',
      initials: 'ST',
    },
    {
      id: 'd-2',
      title: 'E-commerce Innovate',
      company: 'Innovate Solutions',
      stageId: 'proposal',
      amount: 35000,
      probability: 50,
      closeDate: '28 Feb',
      initials: 'IN',
    },
    {
      id: 'd-3',
      title: 'Implantação CRM TechCo',
      company: 'TechCorp Brasil',
      stageId: 'proposal',
      amount: 45000,
      probability: 60,
      closeDate: '15 Feb',
      initials: 'TE',
    },
    {
      id: 'd-4',
      title: 'Automação MegaStore',
      company: 'MegaStore',
      stageId: 'negotiation',
      amount: 120000,
      probability: 75,
      closeDate: '30 Jan',
      initials: 'ME',
    },
    {
      id: 'd-5',
      title: 'Analytics BigData',
      company: 'BigData',
      stageId: 'contract',
      amount: 250000,
      probability: 90,
      closeDate: '20 Jan',
      initials: 'BI',
    },
  ],
  contacts: [
    {
      id: 'c-1',
      name: 'Carlos Silva',
      role: 'Diretor de Marketing',
      company: 'TechCorp Brasil',
      favorite: true,
      channels: ['phone', 'email', 'whatsapp', 'linkedin'],
    },
    {
      id: 'c-2',
      name: 'Maria Santos',
      role: 'CEO',
      company: 'Innovate Solutions',
      favorite: true,
      channels: ['phone', 'email', 'instagram'],
    },
    {
      id: 'c-3',
      name: 'Pedro Costa',
      role: 'Head de Tecnologia',
      company: 'MegaStore',
      favorite: true,
      channels: ['phone', 'email', 'linkedin'],
    },
  ],
  companies: [
    {
      id: 'co-1',
      name: 'TechCorp Brasil',
      status: 'active',
      segment: 'Tecnologia',
      employees: '51-200 funcionários',
      location: 'São Paulo, SP',
      revenue: 5000000,
      actions: ['website', 'phone', 'email'],
    },
    {
      id: 'co-2',
      name: 'Innovate Solutions',
      status: 'prospect',
      segment: 'Tecnologia',
      employees: '11-50 funcionários',
      location: 'Rio de Janeiro, RJ',
      revenue: null,
      actions: ['website'],
    },
    {
      id: 'co-3',
      name: 'MegaStore',
      status: 'active',
      segment: 'Varejo',
      employees: '201-500 funcionários',
      location: 'São Paulo, SP',
      revenue: 50000000,
      actions: ['website'],
    },
    {
      id: 'co-4',
      name: 'StartupX',
      status: 'prospect',
      segment: 'Tecnologia',
      employees: '1-10 funcionários',
      location: 'Belo Horizonte, MG',
      revenue: null,
      actions: [],
    },
    {
      id: 'co-5',
      name: 'BigData Tech',
      status: 'active',
      segment: 'Tecnologia',
      employees: '51-200 funcionários',
      location: 'São Paulo, SP',
      revenue: 15000000,
      actions: ['website'],
    },
  ],
  tasks: [
    {
      id: 't-1',
      title: 'Ligar para Carlos - TechCorp',
      note: 'Discutir detalhes da proposta',
      type: 'call',
      dueLabel: '16 Jan',
      overdue: true,
      priority: 'high',
      related: 'Carlos Silva',
      done: false,
    },
    {
      id: 't-2',
      title: 'Enviar proposta MegaStore',
      note: 'Proposta revisada com desconto',
      type: 'proposal',
      dueLabel: '15 Jan',
      overdue: true,
      priority: 'urgent',
      related: 'MegaStore',
      done: false,
    },
    {
      id: 't-3',
      title: 'Follow-up Maria Instagram',
      note: 'Verificar interesse após demo',
      type: 'follow_up',
      dueLabel: '17 Jan',
      overdue: true,
      priority: 'medium',
      related: 'Maria Santos',
      done: false,
    },
    {
      id: 't-4',
      title: 'Reunião Lucas BigData',
      note: 'Apresentação final do projeto',
      type: 'meeting',
      dueLabel: '18 Jan',
      overdue: true,
      priority: 'high',
      related: 'BigData Tech',
      done: false,
    },
    {
      id: 't-5',
      title: 'Email contrato assinado',
      note: 'Enviar contrato para assinatura digital',
      type: 'email',
      dueLabel: '',
      overdue: false,
      priority: 'medium',
      related: 'TechCorp Brasil',
      done: true,
    },
  ],
  funnel: [
    { label: 'Novos', count: 2, amount: 0, color: '#2563eb' },
    { label: 'Contatados', count: 2, amount: 40000, color: '#f59e0b' },
    { label: 'Qualificados', count: 1, amount: 45000, color: '#8b5cf6' },
    { label: 'Proposta', count: 1, amount: 120000, color: '#ec4899' },
    { label: 'Negociação', count: 1, amount: 250000, color: '#f97316' },
    { label: 'Ganhos', count: 0, amount: 0, color: '#16a34a' },
  ],
  activities: [
    {
      id: 'a-1',
      dot: '#16a34a',
      title: 'Conversa inicial com Carlos',
      meta: 'Relacionada a Carlos Silva',
      tag: 'WhatsApp',
      when: '13 hours ago',
    },
    {
      id: 'a-2',
      dot: '#ec4899',
      title: 'DM recebida de Maria',
      meta: 'Relacionada a Maria Santos',
      tag: 'Instagram',
      when: '13 hours ago',
    },
    {
      id: 'a-3',
      dot: '#0ea5e9',
      title: 'Ligação com Pedro',
      meta: 'Relacionada a Pedro Costa',
      tag: 'Ligação',
      when: '13 hours ago',
    },
    {
      id: 'a-4',
      dot: '#a855f7',
      title: 'Demo para StartupX',
      meta: 'Relacionada a Ana Oliveira',
      tag: 'Reunião',
      when: '13 hours ago',
    },
    {
      id: 'a-5',
      dot: '#2563eb',
      title: 'Lead qualificado via IA',
      meta: 'Relacionada a Lucas Ferreira',
      tag: 'Chat IA',
      when: '13 hours ago',
    },
  ],
}
*/

function useStoredLeads() {
  return useLocalStorageState(LEADS_STORAGE_KEY, () => [])
}

function useStoredDeals() {
  return useLocalStorageState(DEALS_STORAGE_KEY, () => [])
}

function useStoredContacts() {
  return useLocalStorageState(CONTACTS_STORAGE_KEY, () => [])
}

function useStoredCompanies() {
  return useLocalStorageState(COMPANIES_STORAGE_KEY, () => [])
}

function useStoredTasks() {
  return useLocalStorageState(TASKS_STORAGE_KEY, () => [])
}

function useStoredAutomations() {
  return useLocalStorageState(AUTOMATIONS_STORAGE_KEY, () => [])
}

function useStoredAiAgent() {
  return useLocalStorageState(AI_AGENT_STORAGE_KEY, () => ({
    connections: {
      whatsapp: { connected: false, account: '' },
      instagram: { connected: false, account: '' },
      facebook: { connected: false, account: '' },
    },
    sessions: {
      whatsapp: { leadId: null, draft: {} },
      instagram: { leadId: null, draft: {} },
      facebook: { leadId: null, draft: {} },
    },
    messages: [],
    settings: {
      autoCreateLead: true,
      autoCreateTask: true,
      autoCreateDeal: true,
      triggerMarketingAutomations: true,
    },
  }))
}

function Chip({ children, variant = 'neutral' }) {
  return <span className={`chip ${variant}`}>{children}</span>
}

function Sidebar({ activeId, onSelect, user, onSignOut }) {
  const userEmail = user?.email ?? ''
  const userMeta = user?.user_metadata ?? {}
  const userName = userMeta.full_name || userMeta.name || (userEmail ? userEmail.split('@')[0] : 'Conta')
  const avatarLabel = userName ? initialsFromName(String(userName)) : userEmail.slice(0, 2).toUpperCase()

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo" aria-hidden="true">
          <Icon.Bolt className="svg" />
        </div>
        <div className="brand-text">
          <div className="brand-title">CRM Pro</div>
          <div className="brand-sub">Ultra moderno</div>
        </div>
      </div>

      <nav className="nav" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeId
          const ItemIcon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={active ? 'nav-item active' : 'nav-item'}
              onClick={() => onSelect(item.id)}
            >
              <span className="nav-icon" style={{ backgroundColor: item.color }} aria-hidden="true">
                <ItemIcon className="svg" />
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-pill">
          <div className="avatar">{avatarLabel || '—'}</div>
          <div className="user-meta">
            <div className="user-name">{userName}</div>
            <div className="user-email">{userEmail}</div>
          </div>
          {typeof onSignOut === 'function' ? (
            <button type="button" className="user-signout" onClick={() => onSignOut()} aria-label="Sair">
              <Icon.LogOut className="svg sm" />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

function DashboardPage({ onNavigate }) {
  const [storedLeads] = useStoredLeads()
  const [storedDeals] = useStoredDeals()
  const [storedTasks] = useStoredTasks()

  const pipelineTotal = useMemo(
    () => (storedDeals ?? []).reduce((acc, deal) => acc + (Number(deal.amount) || 0), 0),
    [storedDeals],
  )

  const dealsWon = useMemo(
    () => (storedDeals ?? []).filter((deal) => deal.stageId === 'won' || deal.stageId === 'contract'),
    [storedDeals],
  )
  const closedRevenue = useMemo(
    () => dealsWon.reduce((acc, deal) => acc + (Number(deal.amount) || 0), 0),
    [dealsWon],
  )

  const pendingTasks = useMemo(() => (storedTasks ?? []).filter((task) => !task.done), [storedTasks])

  const kpis = useMemo(
    () => [
      {
        label: 'Total de leads',
        value: String((storedLeads ?? []).length),
        trend: '0%',
        trendHint: 'vs último período',
        icon: Icon.Users,
        color: '#2563eb',
      },
      {
        label: 'Pipeline total',
        value: formatCurrency(pipelineTotal),
        trend: '0%',
        trendHint: 'vs último período',
        icon: Icon.Dollar,
        color: '#16a34a',
      },
      {
        label: 'Negócios ganhos',
        value: formatCurrency(closedRevenue),
        trend: '0%',
        trendHint: 'vs último período',
        icon: Icon.Trophy,
        color: '#a855f7',
      },
      {
        label: 'Tarefas pendentes',
        value: String(pendingTasks.length),
        trend: '0%',
        trendHint: 'vs último período',
        icon: Icon.Clipboard,
        color: '#f97316',
      },
    ],
    [closedRevenue, pendingTasks.length, pipelineTotal, storedLeads],
  )

  const quickActions = useMemo(
    () => [
      { id: 'new-lead', label: 'Novo Lead', icon: Icon.Users, color: '#2563eb', nav: 'leads' },
      { id: 'new-contact', label: 'Novo Contato', icon: Icon.Chat, color: '#10b981', nav: 'contacts' },
      { id: 'new-company', label: 'Nova Empresa', icon: Icon.Clipboard, color: '#a855f7', nav: 'companies' },
      { id: 'new-deal', label: 'Novo Negócio', icon: Icon.Dollar, color: '#f97316', nav: 'pipeline' },
      { id: 'new-task', label: 'Nova Tarefa', icon: Icon.Clipboard, color: '#ec4899', nav: 'tasks' },
      { id: 'ai', label: 'Agente IA', icon: Icon.Spark, color: '#0ea5e9', nav: 'ai' },
    ],
    [],
  )

  const leads = useMemo(() => {
    const list = Array.isArray(storedLeads) ? storedLeads : []
    return list.slice(0, 6).map((lead) => {
      const stage = LEAD_STAGES.find((item) => item.id === lead.stageId)
      const status = stage?.label ?? 'Lead'
      const chipVariant =
        lead.stageId === 'qualified'
          ? 'purple'
          : lead.stageId === 'contacted' || lead.stageId === 'negotiation'
            ? 'amber'
            : 'blue'

      return {
        ...lead,
        initials: initialsFromName(lead.name || 'Lead'),
        status,
        chipVariant,
        channels: lead.origin ? [originLabel(lead.origin)] : [],
        value: Number(lead.value) || 0,
      }
    })
  }, [storedLeads])

  const funnel = useMemo(() => {
    const counts = Object.fromEntries(LEAD_STAGES.map((stage) => [stage.id, { count: 0, amount: 0 }]))
    ;(storedLeads ?? []).forEach((lead) => {
      const bucket = counts[lead.stageId]
      if (!bucket) return
      bucket.count += 1
      bucket.amount += Number(lead.value) || 0
    })

    return LEAD_STAGES.map((stage) => ({
      label: stage.label,
      color: stage.dot,
      count: counts[stage.id]?.count ?? 0,
      amount: counts[stage.id]?.amount ?? 0,
    }))
  }, [storedLeads])

  const activities = useMemo(() => {
    const list = Array.isArray(storedTasks) ? storedTasks : []
    const colors = { high: '#ef4444', urgent: '#ef4444', medium: '#f59e0b', low: '#2563eb' }
    return list.slice(0, 6).map((task) => ({
      id: task.id,
      title: task.title,
      tag: task.type || 'tarefa',
      meta: task.note || task.related || '',
      when: task.dueLabel || '',
      dot: colors[task.priority] ?? '#0ea5e9',
    }))
  }, [storedTasks])

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>Dashboard</h1>
          <p className="subtitle">Visão geral do seu CRM</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn ghost" onClick={() => onNavigate?.('dashboard')}>
            <Icon.Refresh className="svg" />
            Atualizar
          </button>
          <button type="button" className="btn primary" onClick={() => onNavigate?.('ai')}>
            <Icon.Spark className="svg" />
            Agente IA
          </button>
        </div>
      </header>

      <section className="kpi-grid" aria-label="Indicadores">
        {kpis.map((kpi) => {
          const KpiIcon = kpi.icon
          return (
            <article key={kpi.label} className="card kpi">
              <div className="kpi-top">
                <div className="kpi-label">{kpi.label}</div>
                <span className="kpi-icon" style={{ backgroundColor: kpi.color }} aria-hidden="true">
                  <KpiIcon className="svg" />
                </span>
              </div>
              <div className="kpi-value">{kpi.value}</div>
              <div className="kpi-trend">
                <span className="trend up">{kpi.trend}</span>
                <span className="trend-hint">{kpi.trendHint}</span>
              </div>
            </article>
          )
        })}
      </section>

      <section className="card quick" aria-label="Ações rápidas">
        <div className="card-head">
          <h2>Ações Rápidas</h2>
        </div>
        <div className="quick-grid">
          {quickActions.map((action) => {
            const ActionIcon = action.icon
            return (
              <button key={action.id} type="button" className="quick-item" onClick={() => onNavigate?.(action.nav)}>
                <span className="quick-icon" style={{ backgroundColor: action.color }} aria-hidden="true">
                  <ActionIcon className="svg" />
                </span>
                <span className="quick-label">{action.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="dashboard-bottom" aria-label="Visão detalhada">
        <div className="card leads">
          <div className="card-head between">
            <h2>Últimos Leads</h2>
            <button type="button" className="btn small" onClick={() => onNavigate?.('leads')}>
              + Novo
            </button>
          </div>

          <div className="lead-list" role="list">
            {leads.length === 0 ? (
              <div className="placeholder">
                <p>Nenhum lead ainda. Crie seu primeiro lead para começar.</p>
              </div>
            ) : (
              leads.map((lead) => (
              <article key={lead.id} className="lead" role="listitem">
                <div className="lead-left">
                  <div className="avatar lead-avatar">{lead.initials}</div>
                  <div className="lead-meta">
                    <div className="lead-row">
                      <div className="lead-name">{lead.name}</div>
                      <Chip variant={lead.chipVariant}>
                        {lead.status}
                      </Chip>
                      {typeof lead.score === 'number' && <Chip variant="amber">★ {lead.score}</Chip>}
                    </div>
                    <div className="lead-actions">
                      <button type="button" className="icon-btn" aria-label="Ligar">
                        <Icon.Phone className="svg" />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Enviar email">
                        <Icon.Mail className="svg" />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Abrir chat">
                        <Icon.Chat className="svg" />
                      </button>
                      {lead.channels?.map((channel) => (
                        <Chip key={channel} variant="tag">
                          {channel}
                        </Chip>
                      ))}
                    </div>
                    {typeof lead.value === 'number' && (
                      <div className="lead-value">{formatCurrency(lead.value)}</div>
                    )}
                  </div>
                </div>
                <div className="lead-when">{lead.lastTouch}</div>
              </article>
            )))}
          </div>
        </div>

        <div className="stack">
          <div className="card funnel">
            <div className="card-head">
              <h2>Funil de Vendas</h2>
            </div>
            <div className="funnel-list" role="list">
              {funnel.map((stage) => (
                <div key={stage.label} className="funnel-row" role="listitem">
                  <div className="funnel-left">
                    <span className="dot" style={{ backgroundColor: stage.color }} aria-hidden="true" />
                    <span className="funnel-label">{stage.label}</span>
                  </div>
                  <div className="funnel-right">
                    <span className="pill">{stage.count}</span>
                    <span className="funnel-amount">{formatCurrency(stage.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card activity">
            <div className="card-head">
              <h2>Atividades Recentes</h2>
            </div>
            <div className="activity-list" role="list">
              {activities.length === 0 ? (
                <div className="placeholder">
                  <p>Sem atividades recentes.</p>
                </div>
              ) : (
                activities.map((activity) => (
                <article key={activity.id} className="activity-row" role="listitem">
                  <div
                    className="activity-dot"
                    style={{ backgroundColor: activity.dot }}
                    aria-hidden="true"
                  />
                  <div className="activity-main">
                    <div className="activity-top">
                      <div className="activity-title">{activity.title}</div>
                      <Chip variant="tag">{activity.tag}</Chip>
                    </div>
                    <div className="activity-meta">{activity.meta}</div>
                  </div>
                  <div className="activity-when">{activity.when}</div>
                </article>
              )))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function LeadCard({ lead, onOpen, draggable = false, dragging = false, onDragStart, onDragEnd }) {
  const handleOpen = () => {
    if (typeof onOpen === 'function') onOpen(lead.id)
  }

  const handleKeyDown = (event) => {
    if (typeof onOpen !== 'function') return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpen()
    }
  }

  const className = [
    'lead-card',
    typeof onOpen === 'function' ? 'clickable' : '',
    draggable ? 'draggable' : '',
    dragging ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={className}
      onClick={typeof onOpen === 'function' ? handleOpen : undefined}
      onKeyDown={typeof onOpen === 'function' ? handleKeyDown : undefined}
      role={typeof onOpen === 'function' ? 'button' : undefined}
      tabIndex={typeof onOpen === 'function' ? 0 : undefined}
      draggable={draggable || undefined}
      onDragStart={
        draggable
          ? (event) => {
              onDragStart?.(event, lead.id)
            }
          : undefined
      }
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <div className="lead-card-top">
        <div className="avatar lead-card-avatar">{lead.initials}</div>
        <div className="lead-card-main">
          <div className="lead-card-name">{lead.name}</div>
          {lead.company ? <div className="lead-card-company">{lead.company}</div> : null}
        </div>
      </div>

      <div className="lead-card-tags">
        {lead.origin ? <Chip variant="tag">{originLabel(lead.origin)}</Chip> : null}
        {typeof lead.score === 'number' ? <Chip variant="amber">★ {lead.score}</Chip> : null}
      </div>

      {lead.value > 0 ? <div className="lead-card-value">{formatCurrency(lead.value)}</div> : null}

      <div className="lead-card-footer">
        <div className="lead-card-actions">
          <button type="button" className="mini-icon" aria-label="Ligar" onClick={(event) => event.stopPropagation()}>
            <Icon.Phone className="svg" />
          </button>
          <button
            type="button"
            className="mini-icon"
            aria-label="Enviar email"
            onClick={(event) => event.stopPropagation()}
          >
            <Icon.Mail className="svg" />
          </button>
          <button
            type="button"
            className="mini-icon whatsapp"
            aria-label="Enviar mensagem"
            onClick={(event) => event.stopPropagation()}
          >
            <Icon.Chat className="svg" />
          </button>
        </div>
        <div className="lead-card-when">{lead.lastTouch}</div>
      </div>
    </article>
  )
}

function LeadModal({ open, mode, lead, onClose, onSave, onDelete }) {
  const isEdit = mode === 'edit'

  const toFormState = (source) => ({
    name: source?.name ?? '',
    email: source?.email ?? '',
    company: source?.company ?? '',
    origin: source?.origin ?? 'whatsapp',
    stageId: source?.stageId ?? 'new',
    score: typeof source?.score === 'number' ? String(source.score) : '',
    value: typeof source?.value === 'number' ? String(source.value) : '',
    lastTouch: source?.lastTouch ?? 'agora',
  })

  const [form, setForm] = useState(() => toFormState(lead))

  useEffect(() => {
    if (!open) return
    setForm(toFormState(lead))
  }, [lead?.id, mode, open])

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, open])

  if (!open) return null

  const originChoices = ['referral', 'whatsapp', 'instagram', 'linkedin', 'website']
  const submitLabel = isEdit ? 'Salvar alterações' : 'Criar lead'
  const SubmitIcon = isEdit ? Icon.Pencil : Icon.Users

  const handleChange = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const handleSubmit = (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    const payload = {
      name,
      email: form.email.trim(),
      company: form.company.trim(),
      origin: form.origin,
      stageId: form.stageId,
      score: form.score.trim() === '' ? undefined : Number(form.score),
      value: form.value.trim() === '' ? 0 : Number(form.value),
      lastTouch: form.lastTouch.trim() || 'agora',
    }

    if (typeof onSave === 'function') onSave(payload)
  }

  const handleDelete = () => {
    if (!isEdit || !lead?.id) return
    if (!confirm('Excluir este lead?')) return
    if (typeof onDelete === 'function') onDelete(lead.id)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => onClose?.()}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <h2>{isEdit ? 'Editar Lead' : 'Novo Lead'}</h2>
            <p className="modal-subtitle">Cadastre e acompanhe leads em tempo real</p>
          </div>
          <button type="button" className="btn icon modal-close" aria-label="Fechar" onClick={() => onClose?.()}>
            <Icon.X className="svg" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="form-field">
                <span className="form-label">Nome</span>
                <input
                  className="form-control"
                  value={form.name}
                  onChange={handleChange('name')}
                  placeholder="Nome do lead"
                  required
                />
              </label>

              <label className="form-field">
                <span className="form-label">Email</span>
                <input
                  className="form-control"
                  type="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="email@exemplo.com"
                />
              </label>

              <label className="form-field">
                <span className="form-label">Empresa</span>
                <input
                  className="form-control"
                  value={form.company}
                  onChange={handleChange('company')}
                  placeholder="Empresa (opcional)"
                />
              </label>

              <label className="form-field">
                <span className="form-label">Origem</span>
                <select className="form-control" value={form.origin} onChange={handleChange('origin')}>
                  {originChoices.map((origin) => (
                    <option key={origin} value={origin}>
                      {originLabel(origin)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Status</span>
                <select className="form-control" value={form.stageId} onChange={handleChange('stageId')}>
                  {LEAD_STAGES.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Score</span>
                <input
                  className="form-control"
                  inputMode="numeric"
                  value={form.score}
                  onChange={handleChange('score')}
                  placeholder="0-100"
                />
              </label>

              <label className="form-field">
                <span className="form-label">Valor</span>
                <input
                  className="form-control"
                  inputMode="numeric"
                  value={form.value}
                  onChange={handleChange('value')}
                  placeholder="0"
                />
              </label>

              <label className="form-field">
                <span className="form-label">Último contato</span>
                <input
                  className="form-control"
                  value={form.lastTouch}
                  onChange={handleChange('lastTouch')}
                  placeholder="agora"
                />
              </label>
            </div>
          </div>

          <footer className="modal-actions">
            {isEdit ? (
              <button type="button" className="btn danger" onClick={handleDelete}>
                <Icon.Trash className="svg sm" />
                Excluir
              </button>
            ) : (
              <div />
            )}

            <div className="modal-actions-right">
              <button type="button" className="btn ghost" onClick={() => onClose?.()}>
                Cancelar
              </button>
              <button type="submit" className="btn primary" disabled={!form.name.trim()}>
                <SubmitIcon className="svg sm" />
                {submitLabel}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

function LeadsPage() {
  const [search, setSearch] = useState('')
  const [originFilter, setOriginFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [view, setView] = useState('board') // board | grid | list

  const [storedLeads, setStoredLeads] = useStoredLeads()
  const [leadModal, setLeadModal] = useState({ open: false, mode: 'create', id: null })
  const [dragOverStage, setDragOverStage] = useState(null)
  const [draggingLeadId, setDraggingLeadId] = useState(null)

  const editingLead = useMemo(() => {
    if (leadModal.mode !== 'edit' || !leadModal.id) return null
    return storedLeads.find((lead) => lead.id === leadModal.id) ?? null
  }, [leadModal.id, leadModal.mode, storedLeads])

  const openEditSafe = (id) => {
    if (draggingLeadId) return
    openEdit(id)
  }

  const openCreate = () => setLeadModal({ open: true, mode: 'create', id: null })
  const openEdit = (id) => setLeadModal({ open: true, mode: 'edit', id })
  const closeModal = () => setLeadModal((prev) => ({ ...prev, open: false }))

  const handleSaveLead = (payload) => {
    const score =
      typeof payload.score === 'number' && Number.isFinite(payload.score)
        ? Math.min(100, Math.max(0, Math.round(payload.score)))
        : undefined

    const value =
      typeof payload.value === 'number' && Number.isFinite(payload.value) ? Math.max(0, Math.round(payload.value)) : 0

    const normalized = {
      ...payload,
      origin: payload.origin || 'website',
      stageId: payload.stageId || 'new',
      score,
      value,
    }

    if (leadModal.mode === 'edit' && editingLead) {
      setStoredLeads((prev) => prev.map((lead) => (lead.id === editingLead.id ? { ...lead, ...normalized } : lead)))
      closeModal()
      return
    }

    const newLead = {
      id: createId('k'),
      ...normalized,
    }

    setStoredLeads((prev) => [newLead, ...prev])
    closeModal()
  }

  const handleDeleteLead = (leadId) => {
    setStoredLeads((prev) => prev.filter((lead) => lead.id !== leadId))
    closeModal()
  }

  const handleDragStart = (event, leadId) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', leadId)
    setDraggingLeadId(leadId)
  }

  const handleDrop = (event, stageId) => {
    event.preventDefault()
    const leadId = event.dataTransfer.getData('text/plain')
    if (!leadId) return

    setStoredLeads((prev) => prev.map((lead) => (lead.id === leadId ? { ...lead, stageId } : lead)))
    setDragOverStage(null)
    setDraggingLeadId(null)
  }

  const handleDragEnd = () => {
    setDragOverStage(null)
    setDraggingLeadId(null)
  }

  const leads = useMemo(
    () =>
      storedLeads.map((lead) => ({
        ...lead,
        initials: initialsFromName(lead.name),
      })),
    [storedLeads],
  )

  const originOptions = useMemo(() => {
    const set = new Set()
    leads.forEach((lead) => {
      if (lead.origin) set.add(lead.origin)
    })
    return Array.from(set)
  }, [leads])

  const filteredLeads = useMemo(() => {
    const query = toSearchable(search.trim())
    return leads.filter((lead) => {
      if (originFilter !== 'all' && lead.origin !== originFilter) return false
      if (statusFilter !== 'all' && lead.stageId !== statusFilter) return false

      if (query) {
        const haystack = toSearchable([lead.name, lead.email, lead.company].filter(Boolean).join(' '))
        if (!haystack.includes(query)) return false
      }

      return true
    })
  }, [leads, originFilter, search, statusFilter])

  const leadsByStage = useMemo(() => {
    const grouped = Object.fromEntries(LEAD_STAGES.map((stage) => [stage.id, []]))
    filteredLeads.forEach((lead) => {
      if (!grouped[lead.stageId]) grouped[lead.stageId] = []
      grouped[lead.stageId].push(lead)
    })
    return grouped
  }, [filteredLeads])

  return (
    <div className="page leads-page">
      <LeadModal
        open={leadModal.open}
        mode={leadModal.mode}
        lead={leadModal.mode === 'edit' ? editingLead : null}
        onClose={closeModal}
        onSave={handleSaveLead}
        onDelete={handleDeleteLead}
      />

      <header className="page-head">
        <div className="page-title">
          <h1>Leads</h1>
          <p className="subtitle">{filteredLeads.length} leads encontrados</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn icon" aria-label="Atualizar lista">
            <Icon.Refresh className="svg" />
          </button>
          <button type="button" className="btn primary" onClick={openCreate}>
            + Novo Lead
          </button>
        </div>
      </header>

      <section className="card filters-bar" aria-label="Filtros de leads">
        <div className="filters-row">
          <div className="search-field">
            <Icon.Search className="svg" />
            <input
              type="search"
              placeholder="Buscar por nome, email ou empresa..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="select-field">
            <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}>
              <option value="all">Todas origens</option>
              {originOptions.map((origin) => (
                <option key={origin} value={origin}>
                  {originLabel(origin)}
                </option>
              ))}
            </select>
            <Icon.ChevronDown className="svg select-icon" />
          </div>

          <div className="select-field">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos status</option>
              {LEAD_STAGES.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
            <Icon.ChevronDown className="svg select-icon" />
          </div>

          <div className="view-toggle" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              className={view === 'board' ? 'view-btn active' : 'view-btn'}
              aria-label="Visualização kanban"
              onClick={() => setView('board')}
            >
              <Icon.Columns className="svg" />
            </button>
            <button
              type="button"
              className={view === 'grid' ? 'view-btn active' : 'view-btn'}
              aria-label="Visualização em grade"
              onClick={() => setView('grid')}
            >
              <Icon.Grid className="svg" />
            </button>
            <button
              type="button"
              className={view === 'list' ? 'view-btn active' : 'view-btn'}
              aria-label="Visualização em lista"
              onClick={() => setView('list')}
            >
              <Icon.List className="svg" />
            </button>
          </div>
        </div>
      </section>

      {view === 'board' ? (
        <section className="kanban" aria-label="Kanban de leads">
          <div className="kanban-track">
            {LEAD_STAGES.map((stage) => {
              const stageLeads = leadsByStage[stage.id] ?? []
              const stageTotal = stageLeads.reduce((sum, lead) => sum + (lead.value || 0), 0)
              const dragOver = dragOverStage === stage.id
              return (
                <div
                  key={stage.id}
                  className={
                    dragOver
                      ? `kanban-column tint-${stage.tint} drag-over`
                      : `kanban-column tint-${stage.tint}`
                  }
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragOverStage(stage.id)
                  }}
                  onDragLeave={() => setDragOverStage(null)}
                  onDrop={(event) => handleDrop(event, stage.id)}
                >
                  <div className="kanban-head">
                    <div className="kanban-title">
                      <span className="dot" style={{ backgroundColor: stage.dot }} aria-hidden="true" />
                      <span>{stage.label}</span>
                    </div>
                    <span className="count-pill">{stageLeads.length}</span>
                  </div>
                    {stageTotal > 0 ? <div className="kanban-total">{formatCurrency(stageTotal)}</div> : null}
                  <div className="kanban-cards">
                    {stageLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        onOpen={openEditSafe}
                        draggable
                        dragging={draggingLeadId === lead.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {view === 'grid' ? (
        <section className="lead-grid" aria-label="Leads em grade">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onOpen={openEditSafe} />
          ))}
        </section>
      ) : null}

      {view === 'list' ? (
        <section className="lead-rows" aria-label="Leads em lista">
          {filteredLeads.map((lead) => {
            const stage = LEAD_STAGES.find((item) => item.id === lead.stageId)
            return (
              <article
                key={lead.id}
                className="lead-row-item clickable"
                onClick={() => openEditSafe(lead.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openEditSafe(lead.id)
                  }
                }}
              >
                <div className="lead-row-left">
                  <div className="avatar lead-row-avatar">{lead.initials}</div>
                  <div className="lead-row-main">
                    <div className="lead-row-name">{lead.name}</div>
                    {lead.company ? <div className="lead-row-company">{lead.company}</div> : null}
                  </div>
                </div>
                <div className="lead-row-meta">
                  {lead.origin ? <Chip variant="tag">{originLabel(lead.origin)}</Chip> : null}
                  {stage ? <Chip variant="blue">{stage.label}</Chip> : null}
                  {typeof lead.score === 'number' ? <Chip variant="amber">★ {lead.score}</Chip> : null}
                  {lead.value > 0 ? <span className="lead-row-value">{formatCurrency(lead.value)}</span> : null}
                </div>
                <div className="lead-row-when">{lead.lastTouch}</div>
              </article>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}

function DealCard({ deal, onOpen, dragging = false, onDragStart, onDragEnd }) {
  const handleOpen = () => {
    if (dragging) return
    if (typeof onOpen === 'function') onOpen(deal.id)
  }

  const handleKeyDown = (event) => {
    if (dragging) return
    if (typeof onOpen !== 'function') return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpen()
    }
  }

  return (
    <article
      className={dragging ? 'deal-card dragging' : 'deal-card'}
      draggable
      onDragStart={(event) => onDragStart(event, deal.id)}
      onDragEnd={onDragEnd}
      onClick={typeof onOpen === 'function' ? handleOpen : undefined}
      onKeyDown={typeof onOpen === 'function' ? handleKeyDown : undefined}
      role={typeof onOpen === 'function' ? 'button' : undefined}
      tabIndex={typeof onOpen === 'function' ? 0 : undefined}
    >
      <div className="deal-top">
        <div className="avatar deal-avatar">{deal.initials}</div>
        <div className="deal-main">
          <div className="deal-name">{deal.title}</div>
          <div className="deal-company">
            <Icon.Building className="svg sm" />
            <span>{deal.company}</span>
          </div>
        </div>
        <span className="prob-pill">{deal.probability}%</span>
      </div>

      <div className="deal-value">{formatCurrency(deal.amount)}</div>

      <div className="deal-date">
        <Icon.Calendar className="svg sm" />
        <span>{deal.closeDate}</span>
      </div>
    </article>
  )
}

function DealModal({ open, mode, deal, onClose, onSave, onDelete }) {
  const isEdit = mode === 'edit'

  const toFormState = (source) => ({
    title: source?.title ?? '',
    company: source?.company ?? '',
    stageId: source?.stageId ?? 'discovery',
    amount: typeof source?.amount === 'number' ? String(source.amount) : '',
    probability: typeof source?.probability === 'number' ? String(source.probability) : '',
    closeDate: source?.closeDate ?? '',
  })

  const [form, setForm] = useState(() => toFormState(deal))

  useEffect(() => {
    if (!open) return
    setForm(toFormState(deal))
  }, [deal?.id, mode, open])

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, open])

  if (!open) return null

  const submitLabel = isEdit ? 'Salvar alterações' : 'Criar negócio'

  const handleChange = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const handleSubmit = (event) => {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) return

    const amount = form.amount.trim() === '' ? 0 : Math.max(0, Math.round(Number(form.amount) || 0))
    const probability =
      form.probability.trim() === '' ? 0 : Math.min(100, Math.max(0, Math.round(Number(form.probability) || 0)))

    const company = form.company.trim()
    const initials = initialsFromCompany(company || title)

    const payload = {
      title,
      company,
      stageId: form.stageId || 'discovery',
      amount,
      probability,
      closeDate: form.closeDate.trim(),
      initials,
    }

    onSave?.(payload)
  }

  const handleDelete = () => {
    if (!isEdit || !deal?.id) return
    if (!confirm('Excluir este negócio?')) return
    onDelete?.(deal.id)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => onClose?.()}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <h2>{isEdit ? 'Editar Negócio' : 'Novo Negócio'}</h2>
            <p className="modal-subtitle">Organize seu pipeline e acompanhe previsões</p>
          </div>
          <button type="button" className="btn icon modal-close" aria-label="Fechar" onClick={() => onClose?.()}>
            <Icon.X className="svg" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="form-field span-2">
                <span className="form-label">Título</span>
                <input className="form-control" value={form.title} onChange={handleChange('title')} required />
              </label>

              <label className="form-field span-2">
                <span className="form-label">Empresa</span>
                <input className="form-control" value={form.company} onChange={handleChange('company')} />
              </label>

              <label className="form-field">
                <span className="form-label">Estágio</span>
                <select className="form-control" value={form.stageId} onChange={handleChange('stageId')}>
                  {PIPELINE_STAGES.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Probabilidade (%)</span>
                <input
                  className="form-control"
                  inputMode="numeric"
                  value={form.probability}
                  onChange={handleChange('probability')}
                  placeholder="0-100"
                />
              </label>

              <label className="form-field">
                <span className="form-label">Valor (R$)</span>
                <input
                  className="form-control"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={handleChange('amount')}
                  placeholder="0"
                />
              </label>

              <label className="form-field">
                <span className="form-label">Previsão de fechamento</span>
                <input
                  className="form-control"
                  value={form.closeDate}
                  onChange={handleChange('closeDate')}
                  placeholder="Ex: 28 Feb"
                />
              </label>
            </div>
          </div>

          <footer className="modal-actions">
            {isEdit ? (
              <button type="button" className="btn danger" onClick={handleDelete}>
                <Icon.Trash className="svg sm" />
                Excluir
              </button>
            ) : (
              <div />
            )}

            <div className="modal-actions-right">
              <button type="button" className="btn ghost" onClick={() => onClose?.()}>
                Cancelar
              </button>
              <button type="submit" className="btn orange" disabled={!form.title.trim()}>
                <Icon.Dollar className="svg sm" />
                {submitLabel}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

function PipelinePage() {
  const [deals, setDeals] = useStoredDeals()
  const [dragOverStage, setDragOverStage] = useState(null)
  const [draggingDealId, setDraggingDealId] = useState(null)
  const [dealModal, setDealModal] = useState({ open: false, mode: 'create', id: null })

  const editingDeal = useMemo(() => {
    if (dealModal.mode !== 'edit' || !dealModal.id) return null
    return deals.find((deal) => deal.id === dealModal.id) ?? null
  }, [dealModal.id, dealModal.mode, deals])

  const openCreate = () => setDealModal({ open: true, mode: 'create', id: null })
  const openEdit = (id) => setDealModal({ open: true, mode: 'edit', id })
  const openEditSafe = (id) => {
    if (draggingDealId) return
    openEdit(id)
  }
  const closeModal = () => setDealModal((prev) => ({ ...prev, open: false }))

  const stats = useMemo(() => {
    const total = deals.reduce((sum, deal) => sum + (deal.amount || 0), 0)
    const weighted = deals.reduce(
      (sum, deal) => sum + (deal.amount || 0) * ((deal.probability || 0) / 100),
      0,
    )
    return { total, weighted: Math.round(weighted), count: deals.length }
  }, [deals])

  const dealsByStage = useMemo(() => {
    const grouped = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.id, []]))
    deals.forEach((deal) => {
      if (!grouped[deal.stageId]) grouped[deal.stageId] = []
      grouped[deal.stageId].push(deal)
    })
    return grouped
  }, [deals])

  const handleDragStart = (event, dealId) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', dealId)
    setDraggingDealId(dealId)
  }

  const handleDrop = (event, stageId) => {
    event.preventDefault()
    const dealId = event.dataTransfer.getData('text/plain')
    if (!dealId) return

    setDeals((prev) =>
      prev.map((deal) => (deal.id === dealId ? { ...deal, stageId } : deal)),
    )
    setDragOverStage(null)
    setDraggingDealId(null)
  }

  const handleDragEnd = () => {
    setDragOverStage(null)
    setDraggingDealId(null)
  }

  const handleSaveDeal = (payload) => {
    if (dealModal.mode === 'edit' && editingDeal) {
      setDeals((prev) => prev.map((deal) => (deal.id === editingDeal.id ? { ...deal, ...payload } : deal)))
      closeModal()
      return
    }

    const newDeal = {
      id: createId('d'),
      ...payload,
    }

    setDeals((prev) => [newDeal, ...prev])
    closeModal()
  }

  const handleDeleteDeal = (dealId) => {
    setDeals((prev) => prev.filter((deal) => deal.id !== dealId))
    closeModal()
  }

  return (
    <div className="page pipeline-page">
      <DealModal
        open={dealModal.open}
        mode={dealModal.mode}
        deal={dealModal.mode === 'edit' ? editingDeal : null}
        onClose={closeModal}
        onSave={handleSaveDeal}
        onDelete={handleDeleteDeal}
      />

      <header className="page-head">
        <div className="page-title">
          <h1>Pipeline de Vendas</h1>
          <p className="subtitle">Arraste os negócios entre os estágios</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn ghost">
            <Icon.Refresh className="svg" />
            Atualizar
          </button>
          <button type="button" className="btn orange" onClick={openCreate}>
            + Novo Negócio
          </button>
        </div>
      </header>

      <section className="pipeline-kpi-grid" aria-label="Resumo do pipeline">
        <article className="metric-card">
          <span className="metric-icon orange" aria-hidden="true">
            <Icon.Dollar className="svg" />
          </span>
          <div className="metric-body">
            <div className="metric-label">Total do Pipeline</div>
            <div className="metric-value">{formatCurrency(stats.total)}</div>
          </div>
        </article>

        <article className="metric-card">
          <span className="metric-icon green" aria-hidden="true">
            <Icon.Dollar className="svg" />
          </span>
          <div className="metric-body">
            <div className="metric-label">Pipeline Ponderado</div>
            <div className="metric-value">{formatCurrency(stats.weighted)}</div>
          </div>
        </article>

        <article className="metric-card">
          <span className="metric-icon blue" aria-hidden="true">
            <Icon.Funnel className="svg" />
          </span>
          <div className="metric-body">
            <div className="metric-label">Total de Negócios</div>
            <div className="metric-value">{stats.count}</div>
          </div>
        </article>
      </section>

      <section className="pipeline-board" aria-label="Negócios por estágio">
        <div className="pipeline-track">
          {PIPELINE_STAGES.map((stage) => {
            const stageDeals = dealsByStage[stage.id] ?? []
            const stageTotal = stageDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0)
            const dragOver = dragOverStage === stage.id

            return (
              <div
                key={stage.id}
                className={
                  dragOver
                    ? `pipeline-column tint-${stage.tint} drag-over`
                    : `pipeline-column tint-${stage.tint}`
                }
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOverStage(stage.id)
                }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(event) => handleDrop(event, stage.id)}
              >
                <div className="pipeline-column-head">
                  <div className="pipeline-column-title">
                    <span className="dot" style={{ backgroundColor: stage.dot }} aria-hidden="true" />
                    <span>{stage.label}</span>
                  </div>
                  <span className="count-pill">{stageDeals.length}</span>
                </div>
                <div className="pipeline-column-total">{formatCurrency(stageTotal)}</div>

                <div className="pipeline-cards">
                  {stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onOpen={openEditSafe}
                      dragging={draggingDealId === deal.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function ContactCard({ contact, onOpen }) {
  const handleOpen = () => {
    if (typeof onOpen === 'function') onOpen(contact.id)
  }

  const handleKeyDown = (event) => {
    if (typeof onOpen !== 'function') return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpen()
    }
  }

  const stop = (event) => event.stopPropagation()

  return (
    <article
      className={typeof onOpen === 'function' ? 'contact-card clickable' : 'contact-card'}
      onClick={typeof onOpen === 'function' ? handleOpen : undefined}
      onKeyDown={typeof onOpen === 'function' ? handleKeyDown : undefined}
      role={typeof onOpen === 'function' ? 'button' : undefined}
      tabIndex={typeof onOpen === 'function' ? 0 : undefined}
    >
      <div className="contact-top">
        <div className="avatar contact-avatar">{contact.initials}</div>
        <div className="contact-main">
          <div className="contact-name-row">
            <div className="contact-name">{contact.name}</div>
            {contact.favorite ? <Icon.Star className="svg contact-star" aria-hidden="true" /> : null}
          </div>
          <div className="contact-role">{contact.role}</div>
          <div className="contact-company">
            <Icon.Building className="svg sm" />
            <span>{contact.company}</span>
          </div>
        </div>
      </div>

      <div className="contact-divider" aria-hidden="true" />

      <div className="contact-actions" aria-label="Ações">
        {contact.channels.includes('phone') ? (
          <button type="button" className="contact-action" aria-label="Ligar" onClick={stop}>
            <Icon.Phone className="svg" />
          </button>
        ) : null}
        {contact.channels.includes('email') ? (
          <button type="button" className="contact-action" aria-label="Enviar email" onClick={stop}>
            <Icon.Mail className="svg" />
          </button>
        ) : null}
        {contact.channels.includes('whatsapp') ? (
          <button type="button" className="contact-action whatsapp" aria-label="WhatsApp" onClick={stop}>
            <Icon.Chat className="svg" />
          </button>
        ) : null}
        {contact.channels.includes('instagram') ? (
          <button type="button" className="contact-action instagram" aria-label="Instagram" onClick={stop}>
            <Icon.Instagram className="svg" />
          </button>
        ) : null}
        {contact.channels.includes('linkedin') ? (
          <button type="button" className="contact-action linkedin" aria-label="LinkedIn" onClick={stop}>
            <Icon.LinkedIn className="svg" />
          </button>
        ) : null}
      </div>
    </article>
  )
}

function ContactModal({ open, mode, contact, onClose, onSave, onDelete }) {
  const isEdit = mode === 'edit'

  const toFormState = (source) => ({
    name: source?.name ?? '',
    role: source?.role ?? '',
    company: source?.company ?? '',
    favorite: Boolean(source?.favorite),
    channels: new Set(source?.channels ?? []),
  })

  const [form, setForm] = useState(() => toFormState(contact))

  useEffect(() => {
    if (!open) return
    setForm(toFormState(contact))
  }, [contact?.id, mode, open])

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, open])

  if (!open) return null

  const channelOptions = [
    { id: 'phone', label: 'Telefone' },
    { id: 'email', label: 'Email' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'linkedin', label: 'LinkedIn' },
  ]

  const handleChange = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const toggleChannel = (channelId) => {
    setForm((prev) => {
      const next = new Set(prev.channels)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      return { ...prev, channels: next }
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    const payload = {
      name,
      role: form.role.trim(),
      company: form.company.trim(),
      favorite: Boolean(form.favorite),
      channels: Array.from(form.channels),
    }

    onSave?.(payload)
  }

  const handleDelete = () => {
    if (!isEdit || !contact?.id) return
    if (!confirm('Excluir este contato?')) return
    onDelete?.(contact.id)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => onClose?.()}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <h2>{isEdit ? 'Editar Contato' : 'Novo Contato'}</h2>
            <p className="modal-subtitle">Centralize relacionamentos e histórico de contato</p>
          </div>
          <button type="button" className="btn icon modal-close" aria-label="Fechar" onClick={() => onClose?.()}>
            <Icon.X className="svg" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="form-field">
                <span className="form-label">Nome</span>
                <input className="form-control" value={form.name} onChange={handleChange('name')} required />
              </label>

              <label className="form-field">
                <span className="form-label">Cargo</span>
                <input className="form-control" value={form.role} onChange={handleChange('role')} />
              </label>

              <label className="form-field span-2">
                <span className="form-label">Empresa</span>
                <input className="form-control" value={form.company} onChange={handleChange('company')} />
              </label>

              <label className="form-field span-2">
                <span className="form-label">Canais</span>
                <div className="check-grid">
                  {channelOptions.map((option) => (
                    <label key={option.id} className="check-item">
                      <input
                        type="checkbox"
                        checked={form.channels.has(option.id)}
                        onChange={() => toggleChannel(option.id)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  <label className="check-item">
                    <input
                      type="checkbox"
                      checked={form.favorite}
                      onChange={(event) => setForm((prev) => ({ ...prev, favorite: event.target.checked }))}
                    />
                    <span>Favorito</span>
                  </label>
                </div>
              </label>
            </div>
          </div>

          <footer className="modal-actions">
            {isEdit ? (
              <button type="button" className="btn danger" onClick={handleDelete}>
                <Icon.Trash className="svg sm" />
                Excluir
              </button>
            ) : (
              <div />
            )}

            <div className="modal-actions-right">
              <button type="button" className="btn ghost" onClick={() => onClose?.()}>
                Cancelar
              </button>
              <button type="submit" className="btn green" disabled={!form.name.trim()}>
                <Icon.Users className="svg sm" />
                {isEdit ? 'Salvar alterações' : 'Criar contato'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

function ContactsPage() {
  const [search, setSearch] = useState('')
  const [storedContacts, setStoredContacts] = useStoredContacts()
  const [contactModal, setContactModal] = useState({ open: false, mode: 'create', id: null })

  const editingContact = useMemo(() => {
    if (contactModal.mode !== 'edit' || !contactModal.id) return null
    return storedContacts.find((contact) => contact.id === contactModal.id) ?? null
  }, [contactModal.id, contactModal.mode, storedContacts])

  const openCreate = () => setContactModal({ open: true, mode: 'create', id: null })
  const openEdit = (id) => setContactModal({ open: true, mode: 'edit', id })
  const closeModal = () => setContactModal((prev) => ({ ...prev, open: false }))

  const handleSaveContact = (payload) => {
    if (contactModal.mode === 'edit' && editingContact) {
      setStoredContacts((prev) =>
        prev.map((contact) => (contact.id === editingContact.id ? { ...contact, ...payload } : contact)),
      )
      closeModal()
      return
    }

    const newContact = {
      id: createId('c'),
      ...payload,
    }

    setStoredContacts((prev) => [newContact, ...prev])
    closeModal()
  }

  const handleDeleteContact = (contactId) => {
    setStoredContacts((prev) => prev.filter((contact) => contact.id !== contactId))
    closeModal()
  }

  const contacts = useMemo(
    () =>
      storedContacts.map((contact) => ({
        ...contact,
        initials: initialsFromName(contact.name),
      })),
    [storedContacts],
  )

  const filteredContacts = useMemo(() => {
    const query = toSearchable(search.trim())
    return contacts.filter((contact) => {
      if (!query) return true
      const haystack = toSearchable([contact.name, contact.role, contact.company].join(' '))
      return haystack.includes(query)
    })
  }, [contacts, search])

  return (
    <div className="page contacts-page">
      <ContactModal
        open={contactModal.open}
        mode={contactModal.mode}
        contact={contactModal.mode === 'edit' ? editingContact : null}
        onClose={closeModal}
        onSave={handleSaveContact}
        onDelete={handleDeleteContact}
      />

      <header className="page-head">
        <div className="page-title">
          <h1>Contatos</h1>
          <p className="subtitle">
            {filteredContacts.length} contato{filteredContacts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn icon" aria-label="Atualizar contatos">
            <Icon.Refresh className="svg" />
          </button>
          <button type="button" className="btn green" onClick={openCreate}>
            + Novo Contato
          </button>
        </div>
      </header>

      <div className="contacts-search">
        <div className="search-field contacts-search-field">
          <Icon.Search className="svg" />
          <input
            type="search"
            placeholder="Buscar contatos..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <section className="contacts-grid" aria-label="Lista de contatos">
        {filteredContacts.map((contact) => (
          <ContactCard key={contact.id} contact={contact} onOpen={openEdit} />
        ))}
      </section>
    </div>
  )
}

function CompanyCard({ company, onOpen }) {
  const statusLabel = company.status === 'active' ? 'Ativo' : 'Prospect'

  const handleOpen = () => {
    if (typeof onOpen === 'function') onOpen(company.id)
  }

  const handleKeyDown = (event) => {
    if (typeof onOpen !== 'function') return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpen()
    }
  }

  const stop = (event) => event.stopPropagation()

  return (
    <article
      className={typeof onOpen === 'function' ? 'company-card clickable' : 'company-card'}
      onClick={typeof onOpen === 'function' ? handleOpen : undefined}
      onKeyDown={typeof onOpen === 'function' ? handleKeyDown : undefined}
      role={typeof onOpen === 'function' ? 'button' : undefined}
      tabIndex={typeof onOpen === 'function' ? 0 : undefined}
    >
      <div className="company-top">
        <div className="company-avatar" aria-hidden="true">
          {company.initials}
        </div>
        <div className="company-main">
          <div className="company-name">{company.name}</div>
          <div className="company-badges">
            <span className={company.status === 'active' ? 'status-badge active' : 'status-badge prospect'}>
              {statusLabel}
            </span>
            <span className="company-segment">{company.segment}</span>
          </div>
        </div>
      </div>

      <div className="company-meta">
        <div className="company-meta-row">
          <Icon.Users className="svg sm" />
          <span>{company.employees}</span>
        </div>
        <div className="company-meta-row">
          <Icon.MapPin className="svg sm" />
          <span>{company.location}</span>
        </div>
        {company.revenue ? (
          <div className="company-meta-row revenue">
            <Icon.Dollar className="svg sm" />
            <span>{formatCurrency(company.revenue)}/ano</span>
          </div>
        ) : null}
      </div>

      <div className="company-divider" aria-hidden="true" />

      <div className="company-actions" aria-label="Ações">
        {company.actions.includes('website') ? (
          <button type="button" className="company-action" aria-label="Website" onClick={stop}>
            <Icon.Globe className="svg" />
          </button>
        ) : null}
        {company.actions.includes('phone') ? (
          <button type="button" className="company-action" aria-label="Ligar" onClick={stop}>
            <Icon.Phone className="svg" />
          </button>
        ) : null}
        {company.actions.includes('email') ? (
          <button type="button" className="company-action" aria-label="Enviar email" onClick={stop}>
            <Icon.Mail className="svg" />
          </button>
        ) : null}
      </div>
    </article>
  )
}

function CompanyModal({ open, mode, company, onClose, onSave, onDelete }) {
  const isEdit = mode === 'edit'

  const toFormState = (source) => ({
    name: source?.name ?? '',
    status: source?.status ?? 'active',
    segment: source?.segment ?? '',
    employees: source?.employees ?? '',
    location: source?.location ?? '',
    revenue: typeof source?.revenue === 'number' ? String(source.revenue) : '',
    actions: new Set(source?.actions ?? []),
  })

  const [form, setForm] = useState(() => toFormState(company))

  useEffect(() => {
    if (!open) return
    setForm(toFormState(company))
  }, [company?.id, mode, open])

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, open])

  if (!open) return null

  const actionOptions = [
    { id: 'website', label: 'Website' },
    { id: 'phone', label: 'Telefone' },
    { id: 'email', label: 'Email' },
  ]

  const handleChange = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const toggleAction = (actionId) => {
    setForm((prev) => {
      const next = new Set(prev.actions)
      if (next.has(actionId)) next.delete(actionId)
      else next.add(actionId)
      return { ...prev, actions: next }
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    const revenue = form.revenue.trim() === '' ? 0 : Math.max(0, Math.round(Number(form.revenue) || 0))

    const payload = {
      name,
      status: form.status === 'prospect' ? 'prospect' : 'active',
      segment: form.segment.trim(),
      employees: form.employees.trim(),
      location: form.location.trim(),
      revenue,
      actions: Array.from(form.actions),
    }

    onSave?.(payload)
  }

  const handleDelete = () => {
    if (!isEdit || !company?.id) return
    if (!confirm('Excluir esta empresa?')) return
    onDelete?.(company.id)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => onClose?.()}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <h2>{isEdit ? 'Editar Empresa' : 'Nova Empresa'}</h2>
            <p className="modal-subtitle">Gerencie contas e oportunidades por empresa</p>
          </div>
          <button type="button" className="btn icon modal-close" aria-label="Fechar" onClick={() => onClose?.()}>
            <Icon.X className="svg" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="form-field span-2">
                <span className="form-label">Nome</span>
                <input className="form-control" value={form.name} onChange={handleChange('name')} required />
              </label>

              <label className="form-field">
                <span className="form-label">Status</span>
                <select className="form-control" value={form.status} onChange={handleChange('status')}>
                  <option value="active">Ativo</option>
                  <option value="prospect">Prospect</option>
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Segmento</span>
                <input className="form-control" value={form.segment} onChange={handleChange('segment')} />
              </label>

              <label className="form-field">
                <span className="form-label">Funcionários</span>
                <input className="form-control" value={form.employees} onChange={handleChange('employees')} />
              </label>

              <label className="form-field">
                <span className="form-label">Localização</span>
                <input className="form-control" value={form.location} onChange={handleChange('location')} />
              </label>

              <label className="form-field span-2">
                <span className="form-label">Receita (R$ / ano)</span>
                <input
                  className="form-control"
                  inputMode="numeric"
                  value={form.revenue}
                  onChange={handleChange('revenue')}
                  placeholder="0"
                />
              </label>

              <label className="form-field span-2">
                <span className="form-label">Ações</span>
                <div className="check-grid">
                  {actionOptions.map((option) => (
                    <label key={option.id} className="check-item">
                      <input
                        type="checkbox"
                        checked={form.actions.has(option.id)}
                        onChange={() => toggleAction(option.id)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </label>
            </div>
          </div>

          <footer className="modal-actions">
            {isEdit ? (
              <button type="button" className="btn danger" onClick={handleDelete}>
                <Icon.Trash className="svg sm" />
                Excluir
              </button>
            ) : (
              <div />
            )}

            <div className="modal-actions-right">
              <button type="button" className="btn ghost" onClick={() => onClose?.()}>
                Cancelar
              </button>
              <button type="submit" className="btn purple" disabled={!form.name.trim()}>
                <Icon.Building className="svg sm" />
                {isEdit ? 'Salvar alterações' : 'Criar empresa'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

function CompaniesPage() {
  const [search, setSearch] = useState('')
  const [storedCompanies, setStoredCompanies] = useStoredCompanies()
  const [companyModal, setCompanyModal] = useState({ open: false, mode: 'create', id: null })

  const editingCompany = useMemo(() => {
    if (companyModal.mode !== 'edit' || !companyModal.id) return null
    return storedCompanies.find((company) => company.id === companyModal.id) ?? null
  }, [companyModal.id, companyModal.mode, storedCompanies])

  const openCreate = () => setCompanyModal({ open: true, mode: 'create', id: null })
  const openEdit = (id) => setCompanyModal({ open: true, mode: 'edit', id })
  const closeModal = () => setCompanyModal((prev) => ({ ...prev, open: false }))

  const handleSaveCompany = (payload) => {
    if (companyModal.mode === 'edit' && editingCompany) {
      setStoredCompanies((prev) =>
        prev.map((company) => (company.id === editingCompany.id ? { ...company, ...payload } : company)),
      )
      closeModal()
      return
    }

    const newCompany = {
      id: createId('co'),
      ...payload,
    }

    setStoredCompanies((prev) => [newCompany, ...prev])
    closeModal()
  }

  const handleDeleteCompany = (companyId) => {
    setStoredCompanies((prev) => prev.filter((company) => company.id !== companyId))
    closeModal()
  }

  const companies = useMemo(
    () =>
      storedCompanies.map((company) => ({
        ...company,
        initials: initialsFromCompany(company.name),
      })),
    [storedCompanies],
  )

  const filteredCompanies = useMemo(() => {
    const query = toSearchable(search.trim())
    return companies.filter((company) => {
      if (!query) return true
      const haystack = toSearchable([company.name, company.segment, company.location].join(' '))
      return haystack.includes(query)
    })
  }, [companies, search])

  return (
    <div className="page companies-page">
      <CompanyModal
        open={companyModal.open}
        mode={companyModal.mode}
        company={companyModal.mode === 'edit' ? editingCompany : null}
        onClose={closeModal}
        onSave={handleSaveCompany}
        onDelete={handleDeleteCompany}
      />

      <header className="page-head">
        <div className="page-title">
          <h1>Empresas</h1>
          <p className="subtitle">
            {filteredCompanies.length} empresa{filteredCompanies.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn icon" aria-label="Atualizar empresas">
            <Icon.Refresh className="svg" />
          </button>
          <button type="button" className="btn purple" onClick={openCreate}>
            + Nova Empresa
          </button>
        </div>
      </header>

      <div className="companies-search">
        <div className="search-field companies-search-field">
          <Icon.Search className="svg" />
          <input
            type="search"
            placeholder="Buscar empresas..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <section className="companies-grid" aria-label="Lista de empresas">
        {filteredCompanies.map((company) => (
          <CompanyCard key={company.id} company={company} onOpen={openEdit} />
        ))}
      </section>
    </div>
  )
}

function TaskModal({ open, mode, task, onClose, onSave, onDelete }) {
  const isEdit = mode === 'edit'

  const toFormState = (source) => ({
    title: source?.title ?? '',
    note: source?.note ?? '',
    type: source?.type ?? 'call',
    dueLabel: source?.dueLabel ?? '',
    overdue: Boolean(source?.overdue),
    priority: source?.priority ?? 'medium',
    related: source?.related ?? '',
    done: Boolean(source?.done),
  })

  const [form, setForm] = useState(() => toFormState(task))

  useEffect(() => {
    if (!open) return
    setForm(toFormState(task))
  }, [mode, open, task?.id])

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, open])

  if (!open) return null

  const typeOptions = [
    { id: 'call', label: 'call' },
    { id: 'proposal', label: 'proposal' },
    { id: 'follow_up', label: 'follow up' },
    { id: 'meeting', label: 'meeting' },
    { id: 'email', label: 'email' },
  ]

  const priorityOptions = [
    { id: 'urgent', label: 'Urgente' },
    { id: 'high', label: 'Alta' },
    { id: 'medium', label: 'Média' },
    { id: 'low', label: 'Baixa' },
  ]

  const handleChange = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const handleSubmit = (event) => {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) return

    const dueLabel = form.dueLabel.trim()
    const done = Boolean(form.done)
    const overdue = done ? false : Boolean(form.overdue && dueLabel)

    const payload = {
      title,
      note: form.note.trim(),
      type: form.type || 'call',
      dueLabel,
      overdue,
      priority: form.priority || 'medium',
      related: form.related.trim(),
      done,
    }

    onSave?.(payload)
  }

  const handleDelete = () => {
    if (!isEdit || !task?.id) return
    if (!confirm('Excluir esta tarefa?')) return
    onDelete?.(task.id)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => onClose?.()}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <h2>{isEdit ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
            <p className="modal-subtitle">Priorize, acompanhe prazos e faça follow-up</p>
          </div>
          <button type="button" className="btn icon modal-close" aria-label="Fechar" onClick={() => onClose?.()}>
            <Icon.X className="svg" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="form-field span-2">
                <span className="form-label">Título</span>
                <input className="form-control" value={form.title} onChange={handleChange('title')} required />
              </label>

              <label className="form-field span-2">
                <span className="form-label">Descrição</span>
                <input className="form-control" value={form.note} onChange={handleChange('note')} />
              </label>

              <label className="form-field">
                <span className="form-label">Tipo</span>
                <select className="form-control" value={form.type} onChange={handleChange('type')}>
                  {typeOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Prioridade</span>
                <select className="form-control" value={form.priority} onChange={handleChange('priority')}>
                  {priorityOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Vencimento</span>
                <input className="form-control" value={form.dueLabel} onChange={handleChange('dueLabel')} />
              </label>

              <label className="form-field">
                <span className="form-label">Relacionado a</span>
                <input className="form-control" value={form.related} onChange={handleChange('related')} />
              </label>

              <label className="form-field span-2">
                <span className="form-label">Status</span>
                <div className="check-grid">
                  <label className="check-item">
                    <input
                      type="checkbox"
                      checked={form.done}
                      onChange={(event) => setForm((prev) => ({ ...prev, done: event.target.checked }))}
                    />
                    <span>Concluída</span>
                  </label>
                  <label className="check-item">
                    <input
                      type="checkbox"
                      checked={form.overdue}
                      disabled={form.done || !form.dueLabel.trim()}
                      onChange={(event) => setForm((prev) => ({ ...prev, overdue: event.target.checked }))}
                    />
                    <span>Atrasada</span>
                  </label>
                </div>
              </label>
            </div>
          </div>

          <footer className="modal-actions">
            {isEdit ? (
              <button type="button" className="btn danger" onClick={handleDelete}>
                <Icon.Trash className="svg sm" />
                Excluir
              </button>
            ) : (
              <div />
            )}

            <div className="modal-actions-right">
              <button type="button" className="btn ghost" onClick={() => onClose?.()}>
                Cancelar
              </button>
              <button type="submit" className="btn pink" disabled={!form.title.trim()}>
                <Icon.Clipboard className="svg sm" />
                {isEdit ? 'Salvar alterações' : 'Criar tarefa'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

function TasksPage() {
  const [filter, setFilter] = useState('all') // all | pending | overdue | done
  const [tasks, setTasks] = useStoredTasks()
  const [taskModal, setTaskModal] = useState({ open: false, mode: 'create', id: null })

  const editingTask = useMemo(() => {
    if (taskModal.mode !== 'edit' || !taskModal.id) return null
    return tasks.find((task) => task.id === taskModal.id) ?? null
  }, [taskModal.id, taskModal.mode, tasks])

  const openCreate = () => setTaskModal({ open: true, mode: 'create', id: null })
  const openEdit = (id) => setTaskModal({ open: true, mode: 'edit', id })
  const closeModal = () => setTaskModal((prev) => ({ ...prev, open: false }))

  const handleSaveTask = (payload) => {
    if (taskModal.mode === 'edit' && editingTask) {
      setTasks((prev) => prev.map((task) => (task.id === editingTask.id ? { ...task, ...payload } : task)))
      closeModal()
      return
    }

    const newTask = {
      id: createId('t'),
      ...payload,
    }

    setTasks((prev) => [newTask, ...prev])
    closeModal()
  }

  const handleDeleteTask = (taskId) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId))
    closeModal()
  }

  const counts = useMemo(() => {
    const pending = tasks.filter((task) => !task.done).length
    const overdue = tasks.filter((task) => !task.done && task.overdue).length
    const done = tasks.filter((task) => task.done).length
    return { pending, overdue, done }
  }, [tasks])

  const filteredTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      if (filter === 'pending') return !task.done
      if (filter === 'overdue') return !task.done && task.overdue
      if (filter === 'done') return task.done
      return true
    })

    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
    return [...filtered].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      return (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99)
    })
  }, [filter, tasks])

  const toggleTask = (id) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, done: !task.done } : task)))
  }

  const taskTypeMeta = {
    call: { label: 'call', icon: Icon.Phone },
    proposal: { label: 'proposal', icon: Icon.Clipboard },
    follow_up: { label: 'follow up', icon: Icon.Clock },
    meeting: { label: 'meeting', icon: Icon.Users },
    email: { label: 'email', icon: Icon.Mail },
  }

  const priorityMeta = {
    urgent: { label: 'Urgente', className: 'urgent' },
    high: { label: 'Alta', className: 'high' },
    medium: { label: 'Média', className: 'medium' },
    low: { label: 'Baixa', className: 'low' },
  }

  return (
    <div className="page tasks-page">
      <TaskModal
        open={taskModal.open}
        mode={taskModal.mode}
        task={taskModal.mode === 'edit' ? editingTask : null}
        onClose={closeModal}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />

      <header className="page-head">
        <div className="page-title">
          <h1>Tarefas</h1>
          <p className="subtitle">
            <span>{counts.pending} pendentes</span>
            <span className="subtitle-sep">•</span>
            <span className="subtitle-danger">{counts.overdue} atrasadas</span>
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn icon" aria-label="Atualizar tarefas">
            <Icon.Refresh className="svg" />
          </button>
          <button type="button" className="btn pink" onClick={openCreate}>
            + Nova Tarefa
          </button>
        </div>
      </header>

      <div className="task-tabs" role="tablist" aria-label="Filtros de tarefas">
        {[
          { id: 'all', label: 'Todas', count: null },
          { id: 'pending', label: 'Pendentes', count: counts.pending },
          { id: 'overdue', label: 'Atrasadas', count: counts.overdue, tone: 'danger' },
          { id: 'done', label: 'Concluídas', count: null },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={filter === tab.id ? 'task-tab active' : 'task-tab'}
            onClick={() => setFilter(tab.id)}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? (
              <span className={tab.tone === 'danger' ? 'task-tab-count danger' : 'task-tab-count'}>
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <section className="tasks-board" aria-label="Lista de tarefas">
        {filteredTasks.map((task) => {
          const type = taskTypeMeta[task.type] ?? { label: task.type, icon: Icon.Clipboard }
          const priority = priorityMeta[task.priority] ?? priorityMeta.medium
          const TaskIcon = type.icon
          return (
            <article
              key={task.id}
              className={
                task.done
                  ? 'task-item done clickable'
                  : task.overdue
                    ? 'task-item overdue clickable'
                    : 'task-item clickable'
              }
              onClick={() => openEdit(task.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openEdit(task.id)
                }
              }}
            >
              <button
                type="button"
                className={task.done ? 'task-check done' : 'task-check'}
                aria-label={task.done ? 'Marcar como pendente' : 'Marcar como concluída'}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleTask(task.id)
                }}
              >
                {task.done ? '✓' : ''}
              </button>

              <div className="task-content">
                <div className="task-title-row">
                  <div className="task-title">{task.title}</div>
                  <span className={`priority-chip ${priority.className}`}>{priority.label}</span>
                </div>
                <div className="task-note">{task.note}</div>

                <div className="task-meta" aria-label="Detalhes">
                  <span className="task-meta-item">
                    <TaskIcon className="svg sm" />
                    <span>{type.label}</span>
                  </span>
                  {!task.done && task.dueLabel ? (
                    <span
                      className={
                        task.overdue ? 'task-meta-item due overdue' : 'task-meta-item due'
                      }
                    >
                      <Icon.Calendar className="svg sm" />
                      <span>
                        {task.dueLabel}
                        {task.overdue ? ' (atrasada)' : ''}
                      </span>
                    </span>
                  ) : null}
                  <span className="task-meta-item link">{'\u2192'} {task.related}</span>
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function AutomationCard({ automation, onOpen }) {
  const handleOpen = () => {
    if (typeof onOpen === 'function') onOpen(automation.id)
  }

  const handleKeyDown = (event) => {
    if (typeof onOpen !== 'function') return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpen()
    }
  }

  const channels = Array.isArray(automation.channels) ? automation.channels : []
  const stepsCount = Array.isArray(automation.steps) ? automation.steps.length : 0

  const triggerLabels = {
    new_lead: 'Novo lead',
    no_reply: 'Sem resposta',
    stage_change: 'Mudança de etapa',
    birthday: 'Aniversário',
  }

  const triggerLabel = triggerLabels[automation.trigger] ?? automation.trigger

  const channelMeta = {
    whatsapp: { label: 'WhatsApp', icon: Icon.Chat },
    email: { label: 'Email', icon: Icon.Mail },
    instagram: { label: 'Instagram', icon: Icon.Instagram },
  }

  return (
    <article
      className={typeof onOpen === 'function' ? 'automation-card clickable' : 'automation-card'}
      onClick={typeof onOpen === 'function' ? handleOpen : undefined}
      onKeyDown={typeof onOpen === 'function' ? handleKeyDown : undefined}
      role={typeof onOpen === 'function' ? 'button' : undefined}
      tabIndex={typeof onOpen === 'function' ? 0 : undefined}
    >
      <div className="automation-top">
        <span className="automation-icon" aria-hidden="true">
          <Icon.Bolt className="svg" />
        </span>
        <div className="automation-main">
          <div className="automation-title-row">
            <div className="automation-title">{automation.name}</div>
            <span className={automation.active ? 'status-badge active' : 'status-badge prospect'}>
              {automation.active ? 'Ativa' : 'Rascunho'}
            </span>
          </div>
          <div className="automation-sub">
            <span>{triggerLabel}</span>
            <span className="automation-sub-sep" aria-hidden="true">
              •
            </span>
            <span>
              {stepsCount} passo{stepsCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      {channels.length ? (
        <div className="automation-chips" aria-label="Canais">
          {channels.map((channel) => {
            const meta = channelMeta[channel] ?? { label: channel, icon: Icon.Chat }
            const ChannelIcon = meta.icon
            return (
              <Chip key={channel} variant="tag">
                <ChannelIcon className="svg sm" />
                <span>{meta.label}</span>
              </Chip>
            )
          })}
        </div>
      ) : null}
    </article>
  )
}

function AutomationModal({ open, mode, automation, onClose, onSave, onDelete }) {
  const isEdit = mode === 'edit'

  const toFormState = (source) => {
    const stepsSource = Array.isArray(source?.steps) ? source.steps : []
    const steps =
      stepsSource.length > 0
        ? stepsSource.map((step) => ({
            id: step.id ?? createId('mas'),
            channel: step.channel ?? 'whatsapp',
            waitMinutes: typeof step.waitMinutes === 'number' ? String(step.waitMinutes) : String(step.waitMinutes ?? 0),
            message: step.message ?? '',
          }))
        : [
            {
              id: createId('mas'),
              channel: 'whatsapp',
              waitMinutes: '0',
              message: '',
            },
          ]

    return {
      name: source?.name ?? '',
      trigger: source?.trigger ?? 'new_lead',
      active: Boolean(source?.active),
      steps,
    }
  }

  const [form, setForm] = useState(() => toFormState(automation))

  useEffect(() => {
    if (!open) return
    setForm(toFormState(automation))
  }, [automation?.id, mode, open])

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, open])

  if (!open) return null

  const triggerOptions = [
    { id: 'new_lead', label: 'Novo lead' },
    { id: 'no_reply', label: 'Sem resposta' },
    { id: 'stage_change', label: 'Mudança de etapa' },
    { id: 'birthday', label: 'Aniversário' },
  ]

  const channelOptions = [
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'email', label: 'Email' },
    { id: 'instagram', label: 'Instagram' },
  ]

  const updateField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const updateStep = (stepId, patch) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }))
  }

  const addStep = () => {
    setForm((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        { id: createId('mas'), channel: 'whatsapp', waitMinutes: '0', message: '' },
      ],
    }))
  }

  const removeStep = (stepId) => {
    setForm((prev) => {
      if (prev.steps.length <= 1) return prev
      return { ...prev, steps: prev.steps.filter((step) => step.id !== stepId) }
    })
  }

  const canSubmit = Boolean(form.name.trim()) && form.steps.some((step) => step.message.trim())

  const handleSubmit = (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    const steps = form.steps
      .map((step) => ({
        id: step.id,
        channel: step.channel || 'whatsapp',
        waitMinutes: Math.max(0, Math.round(Number(step.waitMinutes) || 0)),
        message: step.message.trim(),
      }))
      .filter((step) => step.message)

    if (!steps.length) return

    const channels = Array.from(new Set(steps.map((step) => step.channel)))

    const payload = {
      name,
      trigger: form.trigger || 'new_lead',
      active: Boolean(form.active),
      steps,
      channels,
    }

    onSave?.(payload)
  }

  const handleDelete = () => {
    if (!isEdit || !automation?.id) return
    if (!confirm('Excluir esta automação?')) return
    onDelete?.(automation.id)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => onClose?.()}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <h2>{isEdit ? 'Editar Automação' : 'Nova Automação'}</h2>
            <p className="modal-subtitle">Crie sequências automáticas de email e WhatsApp</p>
          </div>
          <button type="button" className="btn icon modal-close" aria-label="Fechar" onClick={() => onClose?.()}>
            <Icon.X className="svg" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="form-field span-2">
                <span className="form-label">Nome</span>
                <input className="form-control" value={form.name} onChange={updateField('name')} required />
              </label>

              <label className="form-field">
                <span className="form-label">Gatilho</span>
                <select className="form-control" value={form.trigger} onChange={updateField('trigger')}>
                  {triggerOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Status</span>
                <div className="check-grid">
                  <label className="check-item">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                    />
                    <span>Ativa</span>
                  </label>
                </div>
              </label>

              <div className="form-field span-2">
                <div className="automation-steps-head">
                  <span className="form-label">Sequência</span>
                  <button type="button" className="btn ghost" onClick={addStep}>
                    + Adicionar passo
                  </button>
                </div>

                <div className="automation-steps">
                  {form.steps.map((step, index) => (
                    <div key={step.id} className="automation-step">
                      <div className="automation-step-head">
                        <div className="automation-step-title">Passo {index + 1}</div>
                        <button
                          type="button"
                          className="btn icon"
                          aria-label="Remover passo"
                          onClick={() => removeStep(step.id)}
                          disabled={form.steps.length <= 1}
                        >
                          <Icon.Trash className="svg" />
                        </button>
                      </div>

                      <div className="automation-step-grid">
                        <label className="form-field">
                          <span className="form-label">Canal</span>
                          <select
                            className="form-control"
                            value={step.channel}
                            onChange={(event) => updateStep(step.id, { channel: event.target.value })}
                          >
                            {channelOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="form-field">
                          <span className="form-label">Aguardar (min)</span>
                          <input
                            className="form-control"
                            inputMode="numeric"
                            value={step.waitMinutes}
                            onChange={(event) => updateStep(step.id, { waitMinutes: event.target.value })}
                          />
                        </label>

                        <label className="form-field span-2">
                          <span className="form-label">Mensagem</span>
                          <textarea
                            className="form-control textarea"
                            rows={3}
                            value={step.message}
                            onChange={(event) => updateStep(step.id, { message: event.target.value })}
                            placeholder="Ex: Olá {nome}, vi seu interesse no imóvel..."
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <footer className="modal-actions">
            {isEdit ? (
              <button type="button" className="btn danger" onClick={handleDelete}>
                <Icon.Trash className="svg sm" />
                Excluir
              </button>
            ) : (
              <div />
            )}

            <div className="modal-actions-right">
              <button type="button" className="btn ghost" onClick={() => onClose?.()}>
                Cancelar
              </button>
              <button type="submit" className="btn purple" disabled={!canSubmit}>
                <Icon.Bolt className="svg sm" />
                {isEdit ? 'Salvar alterações' : 'Criar automação'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

function MarketingPage() {
  const [tab, setTab] = useState('automations') // automations | campaigns | posts | segments

  const [storedLeads] = useStoredLeads()
  const [automations, setAutomations] = useStoredAutomations()
  const leadCount = storedLeads.length
  const activeAutomationCount = useMemo(() => automations.filter((item) => item.active).length, [automations])

  const [automationModal, setAutomationModal] = useState({ open: false, mode: 'create', id: null })

  const editingAutomation = useMemo(() => {
    if (automationModal.mode !== 'edit' || !automationModal.id) return null
    return automations.find((item) => item.id === automationModal.id) ?? null
  }, [automationModal.id, automationModal.mode, automations])

  const openCreate = () => setAutomationModal({ open: true, mode: 'create', id: null })
  const openEdit = (id) => setAutomationModal({ open: true, mode: 'edit', id })
  const closeModal = () => setAutomationModal((prev) => ({ ...prev, open: false }))

  const handleSaveAutomation = (payload) => {
    if (automationModal.mode === 'edit' && editingAutomation) {
      setAutomations((prev) =>
        prev.map((item) =>
          item.id === editingAutomation.id ? { ...item, ...payload, updatedAt: Date.now() } : item,
        ),
      )
      closeModal()
      return
    }

    const now = Date.now()
    const newAutomation = {
      id: createId('ma'),
      ...payload,
      createdAt: now,
      updatedAt: now,
    }

    setAutomations((prev) => [newAutomation, ...prev])
    closeModal()
  }

  const handleDeleteAutomation = (automationId) => {
    setAutomations((prev) => prev.filter((item) => item.id !== automationId))
    closeModal()
  }

  const handleNew = () => {
    if (tab === 'automations') {
      openCreate()
      return
    }

    alert('Em breve.')
  }

  const kpis = [
    { label: 'Automações ativas', value: activeAutomationCount, icon: Icon.Bolt, tone: 'purple' },
    { label: 'Campanhas agendadas', value: 0, icon: Icon.Mail, tone: 'blue' },
    { label: 'Posts agendados', value: 0, icon: Icon.Instagram, tone: 'pink' },
    { label: 'Leads disponíveis', value: leadCount, icon: Icon.Users, tone: 'green' },
  ]

  const tabs = [
    { id: 'automations', label: 'Automações', icon: Icon.Bolt },
    { id: 'campaigns', label: 'Campanhas', icon: Icon.Mail },
    { id: 'posts', label: 'Posts', icon: Icon.Calendar },
    { id: 'segments', label: 'Segmentos', icon: Icon.Funnel },
  ]

  const emptyMeta = {
    automations: {
      title: 'Nenhuma automação criada',
      description: 'Crie sequências automáticas de email e WhatsApp',
      cta: 'Nova Automação',
      icon: Icon.Bolt,
    },
    campaigns: {
      title: 'Nenhuma campanha criada',
      description: 'Crie campanhas de email, WhatsApp e anúncios',
      cta: 'Nova Campanha',
      icon: Icon.Mail,
    },
    posts: {
      title: 'Nenhum post agendado',
      description: 'Agende posts para redes sociais',
      cta: 'Novo Post',
      icon: Icon.Instagram,
    },
    segments: {
      title: 'Nenhum segmento criado',
      description: 'Crie segmentos para nutrir e qualificar leads',
      cta: 'Novo Segmento',
      icon: Icon.Funnel,
    },
  }

  const activeEmpty = emptyMeta[tab] ?? emptyMeta.automations
  const EmptyIcon = activeEmpty.icon

  return (
    <div className="page marketing-page">
      <AutomationModal
        open={automationModal.open}
        mode={automationModal.mode}
        automation={automationModal.mode === 'edit' ? editingAutomation : null}
        onClose={closeModal}
        onSave={handleSaveAutomation}
        onDelete={handleDeleteAutomation}
      />
      <header className="page-head">
        <div className="page-title">
          <h1>Automação de Marketing</h1>
          <p className="subtitle">Sequências, campanhas e agendamentos</p>
        </div>
      </header>

      <section className="marketing-kpis" aria-label="Indicadores de marketing">
        {kpis.map((kpi) => {
          const KpiIcon = kpi.icon
          return (
            <article key={kpi.label} className="marketing-kpi-card">
              <span className={`marketing-kpi-icon ${kpi.tone}`} aria-hidden="true">
                <KpiIcon className="svg" />
              </span>
              <div className="marketing-kpi-body">
                <div className="marketing-kpi-value">{kpi.value}</div>
                <div className="marketing-kpi-label">{kpi.label}</div>
              </div>
            </article>
          )
        })}
      </section>

      <div className="marketing-toolbar">
        <div className="marketing-tabs" role="tablist" aria-label="Seções de marketing">
          {tabs.map((item) => {
            const TabIcon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'marketing-tab active' : 'marketing-tab'}
                onClick={() => setTab(item.id)}
              >
                <TabIcon className="svg sm" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        <button type="button" className="btn purple" onClick={handleNew}>
          + {activeEmpty.cta}
        </button>
      </div>

      {tab === 'automations' && automations.length ? (
        <section className="automation-grid" aria-label="Automações de marketing">
          {automations.map((automation) => (
            <AutomationCard key={automation.id} automation={automation} onOpen={openEdit} />
          ))}
        </section>
      ) : (
        <section className="marketing-empty" aria-label="Conteúdo de marketing">
          <div className="marketing-empty-inner">
            <span className="marketing-empty-icon" aria-hidden="true">
              <EmptyIcon className="svg" />
            </span>
            <h2>{activeEmpty.title}</h2>
            <p>{activeEmpty.description}</p>
          </div>
        </section>
      )}
    </div>
  )
}

function ReportsPage() {
  const [tab, setTab] = useState('funnel') // funnel | origins | activities | roi

  const [storedLeads] = useStoredLeads()
  const [storedDeals] = useStoredDeals()
  const leadCount = storedLeads.length

  const pipelineSummary = useMemo(() => {
    const deals = Array.isArray(storedDeals) ? storedDeals : []
    const total = deals.reduce((acc, deal) => acc + (Number(deal.amount) || 0), 0)
    const avg = deals.length ? Math.round(total / deals.length) : 0
    return { total, avg }
  }, [storedDeals])

  const closed = useMemo(() => {
    const deals = Array.isArray(storedDeals) ? storedDeals : []
    const won = deals.filter((deal) => deal.stageId === 'won' || deal.stageId === 'contract')
    const revenue = won.reduce((acc, deal) => acc + (Number(deal.amount) || 0), 0)
    return { deals: won.length, revenue }
  }, [storedDeals])
  const conversion = leadCount ? ((closed.deals / leadCount) * 100).toFixed(1) : '0.0'

  const kpis = useMemo(
    () => [
      {
        label: 'Total Leads',
        value: leadCount,
        meta: `+${leadCount} no período`,
        metaTone: 'up',
        icon: Icon.Users,
        tone: 'blue',
      },
      {
        label: 'Pipeline Total',
        value: formatCurrencyShort(pipelineSummary.total),
        meta: `Média: ${formatCurrency(pipelineSummary.avg)}`,
        icon: Icon.Dollar,
        tone: 'green',
      },
      {
        label: 'Taxa Conversão',
        value: `${conversion}%`,
        meta: `${closed.deals} de ${leadCount} leads`,
        icon: Icon.Target,
        tone: 'purple',
      },
      {
        label: 'Receita Fechada',
        value: formatCurrencyShort(closed.revenue),
        meta: `${closed.deals} negócios`,
        icon: Icon.TrendUp,
        tone: 'amber',
      },
    ],
    [closed.deals, closed.revenue, conversion, leadCount, pipelineSummary.avg, pipelineSummary.total],
  )

  const tabs = useMemo(
    () => [
      { id: 'funnel', label: 'Funil', icon: Icon.BarChart },
      { id: 'origins', label: 'Origens', icon: Icon.Globe },
      { id: 'activities', label: 'Atividades', icon: Icon.Clock },
      { id: 'roi', label: 'ROI', icon: Icon.TrendUp },
    ],
    [],
  )

  const funnelPalette = useMemo(
    () => ({
      new: '#3b82f6',
      contacted: '#8b5cf6',
      qualified: '#f59e0b',
      proposal: '#06b6d4',
      negotiation: '#ec4899',
      won: '#16a34a',
    }),
    [],
  )

  const funnelRows = useMemo(() => {
    const counts = Object.fromEntries(LEAD_STAGES.map((stage) => [stage.id, 0]))
    storedLeads.forEach((lead) => {
      if (counts[lead.stageId] === undefined) return
      counts[lead.stageId] += 1
    })

    return LEAD_STAGES.map((stage) => ({
      id: stage.id,
      label: stage.label,
      count: counts[stage.id] ?? 0,
      color: funnelPalette[stage.id] ?? stage.dot,
    }))
  }, [funnelPalette, storedLeads])

  const funnelScaleMax = Math.max(2, ...funnelRows.map((row) => row.count))
  const funnelTicks = useMemo(() => ['0', '0.5', '1', '1.5', '2'], [])

  const lineSeries = useMemo(
    () => [
      ...Array.from({ length: 10 }).map((_, index) => {
        const date = new Date()
        date.setDate(date.getDate() - (9 - index))
        const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        return { label, value: 0 }
      }),
    ],
    [],
  )

  const pipelineStages = useMemo(
    () => [
      ...PIPELINE_STAGES.map((stage) => ({ id: stage.id, label: stage.label })),
      { id: 'won', label: 'Ganho' },
      { id: 'lost', label: 'Perdido' },
    ],
    [],
  )

  const pipelineStageStats = useMemo(() => {
    const grouped = Object.fromEntries(pipelineStages.map((stage) => [stage.id, { deals: 0, value: 0 }]))
    ;(storedDeals ?? []).forEach((deal) => {
      const bucket = grouped[deal.stageId]
      if (!bucket) return
      bucket.deals += 1
      bucket.value += Number(deal.amount) || 0
    })

    return pipelineStages.map((stage) => ({
      ...stage,
      deals: grouped[stage.id]?.deals ?? 0,
      value: grouped[stage.id]?.value ?? 0,
    }))
  }, [pipelineStages, storedDeals])

  const dealMax = Math.max(2, ...pipelineStageStats.map((stage) => stage.deals))
  const valueStep = 65000
  const rawValueMax = Math.max(valueStep * 4, ...pipelineStageStats.map((stage) => stage.value))
  const valueMax = Math.ceil(rawValueMax / valueStep) * valueStep
  const dealTicks = useMemo(() => ['2', '1.5', '1', '0.5', '0'], [])
  const valueTicks = useMemo(
    () => [
      `R$${(valueStep * 4) / 1000}k`,
      `R$${(valueStep * 3) / 1000}k`,
      `R$${(valueStep * 2) / 1000}k`,
      `R$${valueStep / 1000}k`,
      'R$0k',
    ],
    [valueStep],
  )

  const renderLineSvg = () => {
    const viewWidth = 420
    const viewHeight = 250
    const pad = { left: 44, right: 16, top: 16, bottom: 42 }
    const maxY = Math.max(8, ...lineSeries.map((point) => point.value))

    const chartW = viewWidth - pad.left - pad.right
    const chartH = viewHeight - pad.top - pad.bottom
    const points = lineSeries
      .map((point, index) => {
        const x = pad.left + (chartW * index) / Math.max(1, lineSeries.length - 1)
        const y = pad.top + chartH * (1 - point.value / maxY)
        return `${x},${y}`
      })
      .join(' ')

    const yTicks = [0, 2, 4, 6, 8]
    return (
      <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} aria-hidden="true">
        {yTicks.map((tick) => {
          const y = pad.top + chartH * (1 - tick / maxY)
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={viewWidth - pad.right}
                y1={y}
                y2={y}
                stroke="rgba(148,163,184,0.45)"
                strokeDasharray="3 4"
              />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(100,116,139,0.9)">
                {tick}
              </text>
            </g>
          )
        })}

        {lineSeries.map((point, index) => {
          const x = pad.left + (chartW * index) / Math.max(1, lineSeries.length - 1)
          return (
            <g key={point.label}>
              <line
                x1={x}
                x2={x}
                y1={pad.top}
                y2={pad.top + chartH}
                stroke="rgba(148,163,184,0.35)"
                strokeDasharray="3 4"
              />
              <text
                x={x}
                y={viewHeight - 18}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(100,116,139,0.9)"
              >
                {point.label}
              </text>
            </g>
          )
        })}

        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <div className="page reports-page">
      <header className="page-head">
        <div className="page-title">
          <h1>Relatórios</h1>
          <p className="subtitle">Análise de desempenho e métricas</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn small ghost reports-range">
            <Icon.Calendar className="svg sm" />
            Últimos 30 dias
            <Icon.ChevronDown className="svg sm" />
          </button>
          <button type="button" className="btn small ghost">
            <Icon.Download className="svg sm" />
            CSV
          </button>
          <button type="button" className="btn small ghost">
            <Icon.FileText className="svg sm" />
            PDF
          </button>
        </div>
      </header>

      <section className="reports-kpis" aria-label="Indicadores do relatório">
        {kpis.map((kpi) => {
          const KpiIcon = kpi.icon
          return (
            <article key={kpi.label} className="reports-kpi-card">
              <div className="reports-kpi-main">
                <div className="reports-kpi-label">{kpi.label}</div>
                <div className="reports-kpi-value">{kpi.value}</div>
                <div className={kpi.metaTone === 'up' ? 'reports-kpi-meta up' : 'reports-kpi-meta'}>{kpi.meta}</div>
              </div>
              <span className={`reports-kpi-icon ${kpi.tone}`} aria-hidden="true">
                <KpiIcon className="svg" />
              </span>
            </article>
          )
        })}
      </section>

      <div className="reports-tabs" role="tablist" aria-label="Visões do relatório">
        {tabs.map((item) => {
          const TabIcon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? 'reports-tab active' : 'reports-tab'}
              onClick={() => setTab(item.id)}
            >
              <TabIcon className="svg sm" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {tab === 'funnel' ? (
        <>
          <section className="reports-charts" aria-label="Gráficos do relatório">
            <div className="card reports-chart">
              <div className="card-head">
                <h2>Funil de Vendas</h2>
              </div>
              <div className="reports-funnel-chart">
                <div className="reports-funnel-rows" role="list">
                  {funnelRows.map((row) => (
                    <div key={row.id} className="reports-funnel-row" role="listitem">
                      <div className="reports-funnel-label">{row.label}</div>
                      <div className="reports-funnel-track" aria-label={`${row.label}: ${row.count}`}>
                        <div
                          className="reports-funnel-bar"
                          style={{
                            width: `${Math.min(1, row.count / funnelScaleMax) * 100}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="reports-funnel-axis" aria-hidden="true">
                  <div />
                  <div className="reports-funnel-ticks">
                    {funnelTicks.map((tick) => (
                      <span key={tick}>{tick}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="card reports-chart">
              <div className="card-head">
                <h2>Leads ao Longo do Tempo</h2>
              </div>
              <div className="reports-line-chart">{renderLineSvg()}</div>
            </div>
          </section>

          <section className="card reports-chart reports-chart-wide" aria-label="Pipeline por estágio">
            <div className="card-head between">
              <h2>Pipeline por Estágio</h2>
              <button type="button" className="btn small ghost reports-export">
                <Icon.Download className="svg sm" />
                Exportar
              </button>
            </div>

            <div className="reports-pipeline-chart">
              <div className="reports-pipeline-axis left" aria-hidden="true">
                {dealTicks.map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>

              <div className="reports-pipeline-plot" role="list" aria-label="Estágios do pipeline">
                {pipelineStageStats.map((stage) => (
                  <div key={stage.id} className="reports-pipeline-group" role="listitem">
                    <div className="reports-pipeline-bars">
                      <div
                        className="reports-pipeline-bar deals"
                        style={{ height: `${(stage.deals / dealMax) * 100}%` }}
                        aria-label={`${stage.label}: ${stage.deals} negócios`}
                      />
                      <div
                        className="reports-pipeline-bar value"
                        style={{ height: `${(stage.value / valueMax) * 100}%` }}
                        aria-label={`${stage.label}: ${formatCurrency(stage.value)}`}
                      />
                    </div>
                    <div className="reports-pipeline-label">{stage.label}</div>
                  </div>
                ))}
              </div>

              <div className="reports-pipeline-axis right" aria-hidden="true">
                {valueTicks.map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>
            </div>

            <div className="reports-legend" aria-label="Legenda">
              <span className="reports-legend-item">
                <span className="reports-swatch deals" aria-hidden="true" /> Negócios
              </span>
              <span className="reports-legend-item">
                <span className="reports-swatch value" aria-hidden="true" /> Valor (R$)
              </span>
            </div>
          </section>
        </>
      ) : (
        <section className="card placeholder">
          <h2>Em breve</h2>
          <p>Envie a próxima imagem desta seção para eu replicar e adicionar os dados.</p>
        </section>
      )}
    </div>
  )
}

function AgentConnectModal({ open, channel, meta, connection, onClose, onSave, onDisconnect }) {
  const isConnected = Boolean(connection?.connected)
  const ToneIcon = meta?.icon ?? Icon.Spark
  const isWhatsapp = channel === 'whatsapp'
  const providerDefault = isWhatsapp ? (DEMO_PROVIDER_ENABLED ? 'demo' : 'evolution') : 'manual'
  const providerFromConnection = connection?.provider
  const providerValue =
    providerFromConnection && (providerFromConnection !== 'demo' || DEMO_PROVIDER_ENABLED)
      ? providerFromConnection
      : providerDefault

  const labelMap = {
    whatsapp: 'Número do WhatsApp Business',
    instagram: 'Usuário do Instagram',
    facebook: 'Página do Facebook',
  }

  const placeholderMap = {
    whatsapp: '(11) 9 9999-9999',
    instagram: '@suaimobiliaria',
    facebook: 'Sua Imobiliária',
  }

  const toneButtonMap = {
    green: 'green',
    pink: 'pink',
    blue: 'primary',
  }

  const defaultWebhookUrl = 'http://localhost:8787/api/evolution/webhook'

  const [evolution, setEvolution] = useState(() => ({
    busy: false,
    error: '',
    status: connection?.evolution?.state ?? '',
    qr: '',
  }))

  const [form, setForm] = useState(() => ({
    provider: providerValue,
    account: connection?.account ?? '',
    evolution: {
      baseUrl: connection?.evolution?.baseUrl ?? '',
      apiKey: connection?.evolution?.apiKey ?? '',
      instance: connection?.evolution?.instance ?? '',
      instanceToken: connection?.evolution?.instanceToken ?? '',
      webhookUrl: connection?.evolution?.webhookUrl ?? defaultWebhookUrl,
      webhookToken: connection?.evolution?.webhookToken ?? '',
      state: connection?.evolution?.state ?? '',
    },
  }))

  useEffect(() => {
    if (!open) return
    setEvolution({
      busy: false,
      error: '',
      status: connection?.evolution?.state ?? '',
      qr: '',
    })
    setForm({
      provider: providerValue,
      account: connection?.account ?? '',
      evolution: {
        baseUrl: connection?.evolution?.baseUrl ?? '',
        apiKey: connection?.evolution?.apiKey ?? '',
        instance: connection?.evolution?.instance ?? '',
        instanceToken: connection?.evolution?.instanceToken ?? '',
        webhookUrl: connection?.evolution?.webhookUrl ?? defaultWebhookUrl,
        webhookToken: connection?.evolution?.webhookToken ?? '',
        state: connection?.evolution?.state ?? '',
      },
    })
  }, [channel, connection, defaultWebhookUrl, open])

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, open])

  if (!open) return null

  const fieldLabel = labelMap[channel] ?? 'Conta'
  const placeholder = placeholderMap[channel] ?? ''
  const submitTone = toneButtonMap[meta?.tone] ?? 'primary'

  const provider = isWhatsapp ? (form.provider ?? providerDefault) : providerDefault
  const providerLabel = provider === 'evolution' ? 'Evolution API' : provider === 'demo' ? 'Teste' : 'Manual'
  const evolutionEnabled = isWhatsapp && provider === 'evolution'
  const canSubmit =
    provider === 'evolution'
      ? Boolean(form.evolution?.baseUrl?.trim() && form.evolution?.apiKey?.trim() && form.evolution?.instance?.trim())
      : Boolean(form.account.trim())

  const callEvolution = async (endpoint) => {
    const payload = {
      baseUrl: form.evolution?.baseUrl?.trim(),
      apiKey: form.evolution?.apiKey?.trim(),
      instance: form.evolution?.instance?.trim(),
      instanceToken: form.evolution?.instanceToken?.trim() || undefined,
      webhookUrl: form.evolution?.webhookUrl?.trim() || undefined,
      webhookToken: form.evolution?.webhookToken?.trim() || undefined,
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      const detail = data?.data ? `\n${JSON.stringify(data.data).slice(0, 800)}` : ''
      throw new Error(data?.error ? `${data.error}${detail}` : `Falha ao chamar ${endpoint}${detail}`)
    }

    return data
  }

  const handleEvolutionCreate = async () => {
    if (!evolutionEnabled || !canSubmit) return
    setEvolution((prev) => ({ ...prev, busy: true, error: '' }))
    try {
      await callEvolution('/api/evolution/instance/create')
      setEvolution((prev) => ({ ...prev, busy: false, error: '', status: prev.status || 'CRIADA' }))
    } catch (err) {
      setEvolution((prev) => ({ ...prev, busy: false, error: String(err?.message || err) }))
    }
  }

  const handleEvolutionStatus = async () => {
    if (!evolutionEnabled || !canSubmit) return
    setEvolution((prev) => ({ ...prev, busy: true, error: '' }))
    try {
      const data = await callEvolution('/api/evolution/instance/status')
      const state = String(data?.state ?? '').trim()
      setForm((prev) => ({ ...prev, evolution: { ...(prev.evolution ?? {}), state } }))
      setEvolution((prev) => ({ ...prev, busy: false, error: '', status: state || prev.status }))
    } catch (err) {
      setEvolution((prev) => ({ ...prev, busy: false, error: String(err?.message || err) }))
    }
  }

  const handleEvolutionQr = async () => {
    if (!evolutionEnabled || !canSubmit) return
    setEvolution((prev) => ({ ...prev, busy: true, error: '', qr: '' }))
    try {
      const data = await callEvolution('/api/evolution/instance/connect')
      const qr = typeof data?.qr === 'string' ? data.qr : ''
      setEvolution((prev) => ({ ...prev, busy: false, error: '', qr }))
    } catch (err) {
      setEvolution((prev) => ({ ...prev, busy: false, error: String(err?.message || err) }))
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (provider === 'evolution') {
      if (!canSubmit) return
      onSave?.({
        connected: true,
        provider: 'evolution',
        account: form.evolution?.instance?.trim() || '',
        connectedAt: Date.now(),
        evolution: {
          baseUrl: form.evolution?.baseUrl?.trim() || '',
          apiKey: form.evolution?.apiKey?.trim() || '',
          instance: form.evolution?.instance?.trim() || '',
          instanceToken: form.evolution?.instanceToken?.trim() || '',
          webhookUrl: form.evolution?.webhookUrl?.trim() || '',
          webhookToken: form.evolution?.webhookToken?.trim() || '',
          state: form.evolution?.state ?? '',
        },
      })
      return
    }

    const account = form.account.trim()
    if (!account) return
    onSave?.({ connected: true, provider, account, connectedAt: Date.now() })
  }

  const handleDisconnect = () => {
    if (!isConnected) return
    if (!confirm(`Desconectar ${meta?.label ?? 'canal'}?`)) return
    onDisconnect?.()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={() => onClose?.()}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <h2>{isConnected ? 'Configurar canal' : 'Conectar canal'}</h2>
            <p className="modal-subtitle">
              {meta?.label ?? 'Canal'} • {providerLabel} • {isConnected ? 'conectado' : 'não conectado'}
            </p>
          </div>
          <button type="button" className="btn icon modal-close" aria-label="Fechar" onClick={() => onClose?.()}>
            <Icon.X className="svg" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-field span-2" aria-hidden="true">
                <div className="agent-connect-head">
                  <span className={`agent-connect-logo ${meta?.tone ?? 'blue'}`}>
                    <ToneIcon className="svg sm" />
                  </span>
                  <div className="agent-connect-meta">
                    <div className="agent-connect-title">{meta?.title ?? meta?.label ?? 'Canal'}</div>
                    {meta?.description ? <div className="agent-connect-desc">{meta.description}</div> : null}
                  </div>
                </div>
              </div>

              {isWhatsapp ? (
                <label className="form-field span-2">
                  <span className="form-label">Provedor</span>
                  <select
                    className="form-control"
                    value={form.provider}
                    onChange={(event) => setForm((prev) => ({ ...prev, provider: event.target.value }))}
                  >
                    {DEMO_PROVIDER_ENABLED ? <option value="demo">Teste (local)</option> : null}
                    <option value="evolution">Evolution API</option>
                  </select>
                </label>
              ) : null}

              {!evolutionEnabled ? (
                <label className="form-field span-2">
                  <span className="form-label">{fieldLabel}</span>
                  <input
                    className="form-control"
                    value={form.account}
                    onChange={(event) => setForm((prev) => ({ ...prev, account: event.target.value }))}
                    placeholder={placeholder}
                    required
                  />
                </label>
              ) : (
                <>
                  <label className="form-field span-2">
                    <span className="form-label">URL da Evolution API</span>
                    <input
                      className="form-control"
                      value={form.evolution.baseUrl}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, evolution: { ...(prev.evolution ?? {}), baseUrl: event.target.value } }))
                      }
                      placeholder="https://sua-evolution.exemplo"
                      required
                    />
                  </label>

                  <label className="form-field span-2">
                    <span className="form-label">API Key</span>
                    <input
                      className="form-control"
                      type="password"
                      value={form.evolution.apiKey}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, evolution: { ...(prev.evolution ?? {}), apiKey: event.target.value } }))
                      }
                      placeholder="Cole sua API Key"
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span className="form-label">Instância</span>
                    <input
                      className="form-control"
                      value={form.evolution.instance}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, evolution: { ...(prev.evolution ?? {}), instance: event.target.value } }))
                      }
                      placeholder="nexus-crm"
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span className="form-label">Token da instância (opcional)</span>
                    <input
                      className="form-control"
                      type="password"
                      value={form.evolution.instanceToken}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, evolution: { ...(prev.evolution ?? {}), instanceToken: event.target.value } }))
                      }
                      placeholder="se a sua Evolution exigir"
                    />
                  </label>

                  <label className="form-field span-2">
                    <span className="form-label">Webhook URL do CRM (para receber mensagens)</span>
                    <input
                      className="form-control"
                      value={form.evolution.webhookUrl}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, evolution: { ...(prev.evolution ?? {}), webhookUrl: event.target.value } }))
                      }
                      placeholder={defaultWebhookUrl}
                    />
                    <span className="form-hint">
                      Configure essa URL na Evolution API para enviar eventos de mensagens para o CRM.
                    </span>
                  </label>

                  <label className="form-field span-2">
                    <span className="form-label">Webhook token (opcional)</span>
                    <input
                      className="form-control"
                      type="password"
                      value={form.evolution.webhookToken}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, evolution: { ...(prev.evolution ?? {}), webhookToken: event.target.value } }))
                      }
                      placeholder="será enviado como ?token=... ou x-webhook-token"
                    />
                  </label>

                  <div className="form-field span-2">
                    <div className="evolution-actions">
                      <button
                        type="button"
                        className="btn small"
                        disabled={!canSubmit || evolution.busy}
                        onClick={handleEvolutionCreate}
                      >
                        <Icon.Plus className="svg sm" />
                        Criar instância
                      </button>
                      <button type="button" className="btn small" disabled={!canSubmit || evolution.busy} onClick={handleEvolutionQr}>
                        <Icon.ExternalLink className="svg sm" />
                        Gerar QR
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        disabled={!canSubmit || evolution.busy}
                        onClick={handleEvolutionStatus}
                      >
                        <Icon.Refresh className="svg sm" />
                        Checar status
                      </button>
                    </div>

                    {evolution.status || form.evolution.state ? (
                      <div className="evolution-status">Status: {form.evolution.state || evolution.status}</div>
                    ) : null}

                    {evolution.error ? <div className="evolution-error">{evolution.error}</div> : null}

                    {evolution.qr ? (
                      <div className="evolution-qr" aria-label="QR Code da Evolution">
                        {evolution.qr.startsWith('data:image/') ? (
                          <img src={evolution.qr} alt="QR Code do WhatsApp" />
                        ) : (
                          <pre className="evolution-qr-text">{evolution.qr}</pre>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>

          <footer className="modal-actions">
            {isConnected ? (
              <button type="button" className="btn danger" onClick={handleDisconnect}>
                <Icon.Trash className="svg sm" />
                Desconectar
              </button>
            ) : (
              <div />
            )}

            <div className="modal-actions-right">
              <button type="button" className="btn ghost" onClick={() => onClose?.()}>
                Cancelar
              </button>
              <button type="submit" className={`btn ${submitTone}`} disabled={!canSubmit}>
                <Icon.ExternalLink className="svg sm" />
                {isConnected ? 'Salvar' : evolutionEnabled ? 'Salvar configuraÇõÇœo' : 'Conectar'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

function agentParsePtNumber(value) {
  return Number(String(value ?? '').replace(/\./g, '').replace(',', '.'))
}

function agentNormalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  const trimmed = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits

  if (trimmed.length === 11) {
    return `(${trimmed.slice(0, 2)}) ${trimmed.slice(2, 7)}-${trimmed.slice(7)}`
  }

  if (trimmed.length === 10) {
    return `(${trimmed.slice(0, 2)}) ${trimmed.slice(2, 6)}-${trimmed.slice(6)}`
  }

  return raw
}

function agentExtractMoney(text) {
  const source = String(text ?? '').toLowerCase()

  const prefixedMatch = source.match(/r\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]+)?|[0-9]+(?:,[0-9]+)?)/i)
  if (prefixedMatch) {
    const parsed = agentParsePtNumber(prefixedMatch[1])
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed)
  }

  const unitMatch = source.match(/([0-9]+(?:[.,][0-9]+)?)\s*(milh(?:a|ã)o|milh(?:o|õ)es|mil|k)\b/i)
  if (unitMatch) {
    const amount = agentParsePtNumber(unitMatch[1])
    if (!Number.isFinite(amount) || amount <= 0) return 0
    const unit = unitMatch[2]
    const multiplier = unit.startsWith('milh') ? 1000000 : 1000
    return Math.round(amount * multiplier)
  }

  return 0
}

function agentExtractSignals(text) {
  const source = String(text ?? '').trim()
  if (!source) return {}

  const signals = {}

  const emailMatch = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  if (emailMatch) signals.email = emailMatch[0].toLowerCase()

  const phoneMatch = source.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-\s]?\d{4}/)
  if (phoneMatch) signals.phone = agentNormalizePhone(phoneMatch[0])

  const nameMatch = source.match(
    /(?:meu nome é|me chamo|aqui é|sou o|sou a)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i,
  )
  if (nameMatch) signals.name = nameMatch[1].trim()

  const explicitNameMatch = source.match(/\bnome\s*[:\-]\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i)
  if (!signals.name && explicitNameMatch) signals.name = explicitNameMatch[1].trim()

  const companyMatch = source.match(
    /(?:empresa|imobiliária|corretora)\s*[:\-]\s*([A-Za-z0-9À-ÿ&.' -]{2,})/i,
  )
  if (companyMatch) signals.company = companyMatch[1].trim()

  const companyInlineMatch = source.match(/(?:trabalho (?:na|no)|sou da|sou do|da empresa)\s+([A-Za-z0-9À-ÿ&.' -]{2,})/i)
  if (!signals.company && companyInlineMatch) signals.company = companyInlineMatch[1].trim()

  const intentMeta = [
    { id: 'buy', regex: /(comprar|compra|adquirir|financiar)/i },
    { id: 'rent', regex: /(alugar|locar|locação)/i },
    { id: 'sell', regex: /(vender|venda|anunciar|avaliar)/i },
  ]
  const intent = intentMeta.find((item) => item.regex.test(source))?.id
  if (intent) signals.intent = intent

  const propertyMeta = [
    { label: 'Apartamento', regex: /(apartamento|apto|studio|kitnet)/i },
    { label: 'Casa', regex: /\bcasa\b/i },
    { label: 'Terreno', regex: /(terreno|lote)/i },
    { label: 'Sala comercial', regex: /(sala comercial|sala|comercial)/i },
  ]
  const property = propertyMeta.find((item) => item.regex.test(source))?.label
  if (property) signals.propertyType = property

  const bedroomsMatch = source.match(/(\d+)\s*(?:quarto|quartos|dorm|dormitórios|dormitorio)s?/i)
  if (bedroomsMatch) signals.bedrooms = Math.max(0, Math.min(12, Number(bedroomsMatch[1]) || 0))

  const bairroMatch = source.match(/\bbairro\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i)
  if (bairroMatch) signals.location = bairroMatch[1].trim()

  const locationMatch = source.match(/(?:em|na|no)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})(?:[,.!]|$)/i)
  if (!signals.location && locationMatch) signals.location = locationMatch[1].trim()

  const budget = agentExtractMoney(source)
  if (budget) signals.budget = budget

  return signals
}

function agentMergeDraft(prevDraft, signals) {
  const next = { ...(prevDraft ?? {}) }
  Object.entries(signals ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (typeof value === 'string' && value.trim() === '') return
    next[key] = value
  })
  return next
}

function agentComputeLeadScore(draft) {
  const base = 25
  const points = [
    draft?.name ? 10 : 0,
    draft?.email ? 15 : 0,
    draft?.phone ? 15 : 0,
    draft?.intent ? 5 : 0,
    draft?.propertyType ? 10 : 0,
    draft?.location ? 10 : 0,
    draft?.bedrooms ? 5 : 0,
    draft?.budget ? 15 : 0,
  ]

  return Math.min(100, points.reduce((acc, value) => acc + value, base))
}

function agentPickNextStageId(prevStageId, draft) {
  const rank = { new: 0, contacted: 1, qualified: 2, proposal: 3, negotiation: 4, won: 5 }
  const currentRank = rank[prevStageId] ?? 0

  let desired = 'contacted'
  if (draft?.intent && draft?.budget && (draft?.location || draft?.propertyType)) desired = 'qualified'

  const desiredRank = rank[desired] ?? 0
  return desiredRank > currentRank ? desired : prevStageId ?? desired
}

function agentBuildQuestions(draft) {
  const questions = []
  if (!draft?.name) questions.push('Qual seu nome?')
  if (!draft?.phone && !draft?.email) questions.push('Pode me passar um telefone ou e-mail para contato?')
  if (!draft?.intent) questions.push('Você busca comprar, alugar ou vender?')
  if (!draft?.propertyType) questions.push('Qual tipo de imóvel você procura?')
  if (!draft?.location) questions.push('Em qual cidade ou bairro?')
  if (!draft?.budget) questions.push('Qual faixa de valor (aprox.)?')
  return questions
}

function agentSummarizeDraft(draft) {
  const parts = []
  if (draft?.intent) {
    const label = { buy: 'Compra', rent: 'Locação', sell: 'Venda' }[draft.intent] ?? draft.intent
    parts.push(label)
  }
  if (draft?.propertyType) parts.push(draft.propertyType)
  if (draft?.location) parts.push(`em ${draft.location}`)
  if (draft?.bedrooms) parts.push(`${draft.bedrooms}q`)
  return parts.filter(Boolean).join(' • ')
}

function agentBuildReply({ channelLabel, connected, createdLead, createdDeal, createdTasks, draft, questions, triggeredAutomations }) {
  const lines = []

  if (createdLead) lines.push(`Perfeito! Já registrei seu lead no CRM via ${channelLabel}.`)
  else lines.push(`Certo! Vou te ajudar por aqui (${channelLabel}).`)

  const summary = agentSummarizeDraft(draft)
  if (summary) lines.push(`Anotei: ${summary}.`)

  if (createdDeal) lines.push('Também criei um negócio no Pipeline para acompanhar este atendimento.')
  if (createdTasks) lines.push('Criei uma tarefa de follow-up para o time comercial.')
  if (triggeredAutomations) lines.push('Iniciei automações de marketing para este lead.')
  if (!connected) lines.push('Obs: este canal ainda não está conectado. Ao conectar, as mensagens entram automaticamente no CRM.')

  if (questions.length) {
    lines.push(questions.slice(0, 2).join(' '))
  } else {
    lines.push('Com essas informações, já consigo buscar as melhores opções. Quer que eu te mostre 3 sugestões?')
  }

  return lines.join('\n')
}

function AiPage({ onClose }) {
  const [channel, setChannel] = useState('whatsapp') // whatsapp | instagram | facebook
  const [draft, setDraft] = useState('')
  const [agentState, setAgentState] = useStoredAiAgent()
  const [storedLeads, setStoredLeads] = useStoredLeads()
  const [storedDeals, setStoredDeals] = useStoredDeals()
  const [storedTasks, setStoredTasks] = useStoredTasks()
  const [storedContacts, setStoredContacts] = useStoredContacts()
  const [storedCompanies, setStoredCompanies] = useStoredCompanies()
  const [storedAutomations] = useStoredAutomations()

  const messages = agentState.messages ?? []
  const connections = agentState.connections ?? {}
  const sessions = agentState.sessions ?? {}
  const settings = agentState.settings ?? {}
  const connectionsRef = useRef(connections)
  const sessionsRef = useRef(sessions)
  const settingsRef = useRef(settings)
  const storedLeadsRef = useRef(storedLeads)
  const storedDealsRef = useRef(storedDeals)
  const storedTasksRef = useRef(storedTasks)
  const storedAutomationsRef = useRef(storedAutomations)
  const evolutionAfterRef = useRef(0)
  const evolutionPollingRef = useRef(false)

  const [connectModal, setConnectModal] = useState({ open: false, channel: null })

  useEffect(() => {
    connectionsRef.current = connections
  }, [connections])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    storedLeadsRef.current = storedLeads
  }, [storedLeads])

  useEffect(() => {
    storedDealsRef.current = storedDeals
  }, [storedDeals])

  useEffect(() => {
    storedTasksRef.current = storedTasks
  }, [storedTasks])

  useEffect(() => {
    storedAutomationsRef.current = storedAutomations
  }, [storedAutomations])

  const channels = useMemo(
    () => [
      {
        id: 'whatsapp',
        label: 'WhatsApp',
        title: 'WhatsApp Business',
        description: 'Capture leads via WhatsApp',
        tone: 'green',
        icon: Icon.WhatsApp,
      },
      {
        id: 'instagram',
        label: 'Instagram',
        title: 'Instagram Direct',
        description: 'Capture leads via Instagram',
        tone: 'pink',
        icon: Icon.Instagram,
      },
      {
        id: 'facebook',
        label: 'Facebook',
        title: 'Facebook Messenger',
        description: 'Capture leads via Facebook Messenger',
        tone: 'blue',
        icon: Icon.Facebook,
      },
    ],
    [],
  )

  const replyByChannel = useMemo(
    () => ({
      whatsapp: 'Perfeito! Vou continuar o atendimento pelo WhatsApp e registrar o lead no CRM.',
      instagram: 'Boa! Vou responder pelo Instagram Direct e iniciar a qualificação do lead.',
      facebook: 'Certo! Vou responder no Messenger e registrar o lead automaticamente.',
    }),
    [],
  )

  const activeChannel = channels.find((item) => item.id === channel) ?? channels[0]
  const ActiveIcon = activeChannel.icon
  const activeConnection = connections[channel] ?? { connected: false, account: '' }
  const isConnected = Boolean(activeConnection.connected)
  const activeSession = sessions[channel] ?? { leadId: null, draft: {} }

  const openConnectModal = () => setConnectModal({ open: true, channel })
  const closeConnectModal = () => setConnectModal((prev) => ({ ...prev, open: false }))

  const appendMessages = useCallback((nextMessages) => {
    if (!Array.isArray(nextMessages) || nextMessages.length === 0) return
    setAgentState((prev) => ({
      ...prev,
      messages: [...(prev.messages ?? []), ...nextMessages],
    }))
  }, [setAgentState])

  const setSession = useCallback((channelId, patch) => {
    setAgentState((prev) => ({
      ...prev,
      sessions: {
        ...(prev.sessions ?? {}),
        [channelId]: {
          ...(prev.sessions?.[channelId] ?? { leadId: null, draft: {} }),
          ...patch,
        },
      },
    }))
  }, [setAgentState])

  const setConnection = useCallback((channelId, patch) => {
    setAgentState((prev) => ({
      ...prev,
      connections: {
        ...(prev.connections ?? {}),
        [channelId]: {
          ...(prev.connections?.[channelId] ?? { connected: false, account: '' }),
          ...patch,
        },
      },
    }))
  }, [setAgentState])

  const appendEvent = useCallback(
    (channelId, text) => {
      const now = new Date()
      const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      appendMessages([{ id: createId('event'), role: 'event', channel: channelId, time, text }])
    },
    [appendMessages],
  )

  const sendWhatsAppEvolution = useCallback(
    async ({ number, text }) => {
      const whatsappConnection = connectionsRef.current?.whatsapp
      if (whatsappConnection?.provider !== 'evolution') return { ok: false, skipped: true }

      const evo = whatsappConnection?.evolution ?? {}
      if (!evo.baseUrl || !evo.apiKey || !evo.instance) return { ok: false, skipped: true }

      try {
        const res = await fetch('/api/evolution/message/sendText', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            baseUrl: evo.baseUrl,
            apiKey: evo.apiKey,
            instance: evo.instance,
            number,
            text,
          }),
        })

        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.ok) {
          const detail = data?.data ? `\n${JSON.stringify(data.data).slice(0, 600)}` : ''
          throw new Error(data?.error ? `${data.error}${detail}` : `Falha ao enviar${detail}`)
        }

        return { ok: true }
      } catch (err) {
        appendEvent('whatsapp', `[CRM] Falha ao enviar no WhatsApp: ${String(err?.message || err)}`)
        return { ok: false, error: String(err?.message || err) }
      }
    },
    [appendEvent],
  )

  const runAgentWorkflow = useCallback(
    async ({ channelId, text, author, peer, source, autoReply }) => {
      const trimmed = String(text ?? '').trim()
      if (!trimmed) return

      const now = new Date()
      const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const baseId = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

      const channelMeta = channels.find((item) => item.id === channelId) ?? channels[0]
      const channelConnection = connectionsRef.current?.[channelId] ?? { connected: false, account: '' }
      const channelSession = sessionsRef.current?.[channelId] ?? { leadId: null, draft: {} }
      const storedLeadList = storedLeadsRef.current ?? []
      const storedAutomationList = storedAutomationsRef.current ?? []
      const currentSettings = settingsRef.current ?? {}

      const connected = Boolean(channelConnection.connected)
      const normalizedAuthor = String(author ?? '').trim()

      const userMessage = {
        id: `${baseId}-u`,
        role: 'user',
        channel: channelId,
        time,
        text: trimmed,
        author: normalizedAuthor || undefined,
        peer: peer || undefined,
        source: source || undefined,
      }

      let agentMessage = {
        id: `${baseId}-a`,
        role: 'agent',
        channel: channelId,
        time,
        text: replyByChannel[channelId] ?? 'Perfeito! Já vou cuidar disso.',
      }

      const signals = agentExtractSignals(trimmed)
      const nextDraft = agentMergeDraft(channelSession.draft ?? {}, signals)
      const questions = agentBuildQuestions(nextDraft)

      const origin = channelId
      const nextScore = agentComputeLeadScore(nextDraft)
      const stageSeed = channelSession.leadId
        ? storedLeadList.find((lead) => lead.id === channelSession.leadId)?.stageId
        : 'new'
      const nextStageId = agentPickNextStageId(stageSeed, nextDraft)

      const fallbackName = normalizedAuthor && normalizedAuthor !== 'Você' ? normalizedAuthor : `Lead ${channelMeta.label}`
      const leadName = nextDraft.name?.trim() ? nextDraft.name.trim() : fallbackName

      let leadId = channelSession.leadId
      if (!leadId && nextDraft.email) {
        const existing = storedLeadList.find(
          (lead) => String(lead.email ?? '').toLowerCase() === String(nextDraft.email).toLowerCase(),
        )
        if (existing) leadId = existing.id
      }

      if (!leadId && nextDraft.phone) {
        const normalizedPhone = String(nextDraft.phone).replace(/\D/g, '')
        const existing = storedLeadList.find(
          (lead) => String(lead.phone ?? '').replace(/\D/g, '') && String(lead.phone ?? '').replace(/\D/g, '') === normalizedPhone,
        )
        if (existing) leadId = existing.id
      }

      const leadPayload = {
        name: leadName,
        company: nextDraft.company?.trim() ? nextDraft.company.trim() : '',
        email: nextDraft.email ?? '',
        phone: nextDraft.phone ?? '',
        origin,
        score: nextScore,
        stageId: nextStageId,
        value: nextDraft.budget ? Math.round(nextDraft.budget) : 0,
        lastTouch: 'agora',
      }

      const eventMessages = []
      let createdLead = false
      let createdDeal = false
      let createdTasks = false
      let triggeredAutomations = false
      let nextDealId = channelSession.dealId ?? null

      if (!leadId && currentSettings.autoCreateLead !== false) {
        leadId = createId('k')
        createdLead = true
        setStoredLeads((prev) => [{ id: leadId, ...leadPayload }, ...(prev ?? [])])
        eventMessages.push({
          id: `${baseId}-e1`,
          role: 'event',
          channel: channelId,
          time,
          text: `[CRM] Lead criado: ${leadPayload.name} · etapa: ${leadPayload.stageId}`,
        })
      } else if (leadId) {
        setStoredLeads((prev) => (prev ?? []).map((lead) => (lead.id === leadId ? { ...lead, ...leadPayload } : lead)))
        eventMessages.push({
          id: `${baseId}-e1`,
          role: 'event',
          channel: channelId,
          time,
          text: `[CRM] Lead atualizado: ${leadPayload.name} · score: ${leadPayload.score}`,
        })
      }

      if (createdLead && leadId && currentSettings.autoCreateTask !== false) {
        const followTask = {
          id: createId('t'),
          title: `Follow-up ${leadPayload.name}`,
          note: 'Agente IA registrou um novo lead. Responder e qualificar o atendimento.',
          type: 'follow_up',
          dueLabel: 'Hoje',
          overdue: false,
          priority: 'high',
          related: leadPayload.name,
          done: false,
        }

        setStoredTasks((prev) => [followTask, ...(prev ?? [])])
        createdTasks = true
        eventMessages.push({
          id: `${baseId}-e2`,
          role: 'event',
          channel: channelId,
          time,
          text: `[CRM] Tarefa criada: ${followTask.title}`,
        })
      }

      const eligibleForDeal =
        Boolean(leadId) &&
        currentSettings.autoCreateDeal !== false &&
        !nextDealId &&
        Boolean(nextDraft.intent) &&
        Number(nextDraft.budget) > 0

      if (eligibleForDeal) {
        const intentLabel = { buy: 'Compra', rent: 'Locação', sell: 'Venda' }[nextDraft.intent] ?? 'Negócio'
        const dealTitleParts = [
          intentLabel,
          nextDraft.propertyType,
          nextDraft.location ? `em ${nextDraft.location}` : '',
        ].filter(Boolean)
        const dealTitle = dealTitleParts.join(' ')

        const dealCompany = leadPayload.company || leadPayload.name
        const newDeal = {
          id: createId('d'),
          title: dealTitle || `Negócio ${leadPayload.name}`,
          company: dealCompany,
          stageId: 'discovery',
          amount: Math.round(Number(nextDraft.budget) || 0),
          probability: 25,
          closeDate: '30 dias',
          initials: initialsFromCompany(dealCompany || dealTitle || leadPayload.name),
        }

        setStoredDeals((prev) => [newDeal, ...(prev ?? [])])
        createdDeal = true
        nextDealId = newDeal.id
        eventMessages.push({
          id: `${baseId}-e3`,
          role: 'event',
          channel: channelId,
          time,
          text: `[CRM] Negócio criado no Pipeline: ${newDeal.title}`,
        })
      }

      const activeAutomations =
        currentSettings.triggerMarketingAutomations !== false
          ? (storedAutomationList ?? []).filter((automation) => automation.active && automation.trigger === 'new_lead')
          : []

      const automationsAlreadyTriggered = Boolean(channelSession.flags?.automationsTriggered)
      if (createdLead && leadId && activeAutomations.length && !automationsAlreadyTriggered) {
        const automationTasks = []
        activeAutomations.forEach((automation) => {
          const steps = Array.isArray(automation.steps) ? automation.steps : []
          steps.forEach((step, index) => {
            const minutes = Math.max(0, Math.round(Number(step.waitMinutes) || 0))
            automationTasks.push({
              id: createId('t'),
              title: `Automação: ${automation.name} · Passo ${index + 1}`,
              note: (step.message ?? '').trim() || 'Enviar mensagem automática',
              type: step.channel === 'email' ? 'email' : 'follow_up',
              dueLabel: minutes ? `${minutes} min` : 'Agora',
              overdue: false,
              priority: 'medium',
              related: leadPayload.name,
              done: false,
            })
          })
        })

        if (automationTasks.length) {
          setStoredTasks((prev) => [...automationTasks, ...(prev ?? [])])
          triggeredAutomations = true
          eventMessages.push({
            id: `${baseId}-e4`,
            role: 'event',
            channel: channelId,
            time,
            text: `[CRM] Automações iniciadas: ${activeAutomations.map((a) => a.name).join(', ')}`,
          })
        }
      }

      const agentText = agentBuildReply({
        channelLabel: channelMeta.label,
        connected,
        createdLead,
        createdDeal,
        createdTasks,
        triggeredAutomations,
        draft: nextDraft,
        questions,
      })

      agentMessage = { ...agentMessage, text: agentText }

      setSession(channelId, {
        leadId,
        draft: nextDraft,
        dealId: nextDealId,
        peer: peer ?? channelSession.peer ?? null,
        flags: {
          ...(channelSession.flags ?? {}),
          automationsTriggered: Boolean(channelSession.flags?.automationsTriggered) || triggeredAutomations,
        },
      })

      appendMessages([userMessage, agentMessage, ...eventMessages])

      if (autoReply && channelId === 'whatsapp' && peer) {
        await sendWhatsAppEvolution({ number: peer, text: agentText })
      }
    },
    [appendMessages, channels, replyByChannel, sendWhatsAppEvolution, setSession, setStoredDeals, setStoredLeads, setStoredTasks],
  )

  const handleSend = (event) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    void runAgentWorkflow({ channelId: channel, text: trimmed, author: 'Lead (teste)', source: 'test', autoReply: false })
    setDraft('')
    return

    /* legacy handleSend (deprecated)
    const now = new Date()
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const baseId = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

    const userMessage = { id: `${baseId}-u`, role: 'user', channel, time, text: trimmed }
    let agentMessage = {
      id: `${baseId}-a`,
      role: 'agent',
      channel,
      time,
      text: replyByChannel[channel] ?? 'Perfeito! Já vou cuidar disso.',
    }

    const signals = agentExtractSignals(trimmed)
    const nextDraft = agentMergeDraft(activeSession.draft ?? {}, signals)
    const questions = agentBuildQuestions(nextDraft)

    const origin = channel
    const nextScore = agentComputeLeadScore(nextDraft)
    const stageSeed = activeSession.leadId ? storedLeads.find((lead) => lead.id === activeSession.leadId)?.stageId : 'new'
    const nextStageId = agentPickNextStageId(stageSeed, nextDraft)

    const leadName = nextDraft.name?.trim() ? nextDraft.name.trim() : `Lead ${activeChannel.label}`

    let leadId = activeSession.leadId
    if (!leadId && nextDraft.email) {
      const existing = storedLeads.find(
        (lead) => String(lead.email ?? '').toLowerCase() === String(nextDraft.email).toLowerCase(),
      )
      if (existing) leadId = existing.id
    }

    const leadPayload = {
      name: leadName,
      company: nextDraft.company?.trim() ? nextDraft.company.trim() : '',
      email: nextDraft.email ?? '',
      origin,
      score: nextScore,
      stageId: nextStageId,
      value: nextDraft.budget ? Math.round(nextDraft.budget) : 0,
      lastTouch: 'agora',
    }

    const eventMessages = []
    let createdLead = false
    let createdDeal = false
    let createdTasks = false
    let triggeredAutomations = false
    let nextDealId = activeSession.dealId ?? null

    if (!leadId && settings.autoCreateLead !== false) {
      leadId = createId('k')
      createdLead = true
      setStoredLeads((prev) => [{ id: leadId, ...leadPayload }, ...(prev ?? [])])
      eventMessages.push({
        id: `${baseId}-e1`,
        role: 'event',
        channel,
        time,
        text: `[CRM] Lead criado: ${leadPayload.name} • etapa: ${leadPayload.stageId}`,
      })
    } else if (leadId) {
      setStoredLeads((prev) => (prev ?? []).map((lead) => (lead.id === leadId ? { ...lead, ...leadPayload } : lead)))
      eventMessages.push({
        id: `${baseId}-e1`,
        role: 'event',
        channel,
        time,
        text: `[CRM] Lead atualizado: ${leadPayload.name} • score: ${leadPayload.score}`,
      })
    }

    if (createdLead && leadId && settings.autoCreateTask !== false) {
      const followTask = {
        id: createId('t'),
        title: `Follow-up ${leadPayload.name}`,
        note: 'Agente IA registrou um novo lead. Responder e qualificar o atendimento.',
        type: 'follow_up',
        dueLabel: 'Hoje',
        overdue: false,
        priority: 'high',
        related: leadPayload.name,
        done: false,
      }

      setStoredTasks((prev) => [followTask, ...(prev ?? [])])
      createdTasks = true
      eventMessages.push({
        id: `${baseId}-e2`,
        role: 'event',
        channel,
        time,
        text: `[CRM] Tarefa criada: ${followTask.title}`,
      })
    }

    const eligibleForDeal =
      Boolean(leadId) &&
      settings.autoCreateDeal !== false &&
      !nextDealId &&
      Boolean(nextDraft.intent) &&
      Number(nextDraft.budget) > 0

    if (eligibleForDeal) {
      const intentLabel = { buy: 'Compra', rent: 'Locação', sell: 'Venda' }[nextDraft.intent] ?? 'Negócio'
      const dealTitleParts = [
        intentLabel,
        nextDraft.propertyType,
        nextDraft.location ? `em ${nextDraft.location}` : '',
      ].filter(Boolean)
      const dealTitle = dealTitleParts.join(' ')

      const dealCompany = leadPayload.company || leadPayload.name
      const newDeal = {
        id: createId('d'),
        title: dealTitle || `Negócio ${leadPayload.name}`,
        company: dealCompany,
        stageId: 'discovery',
        amount: Math.round(Number(nextDraft.budget) || 0),
        probability: 25,
        closeDate: '30 dias',
        initials: initialsFromCompany(dealCompany || dealTitle || leadPayload.name),
      }

      setStoredDeals((prev) => [newDeal, ...(prev ?? [])])
      createdDeal = true
      nextDealId = newDeal.id
      eventMessages.push({
        id: `${baseId}-e3`,
        role: 'event',
        channel,
        time,
        text: `[CRM] Negócio criado no Pipeline: ${newDeal.title}`,
      })
    }

    const activeAutomations =
      settings.triggerMarketingAutomations !== false
        ? (storedAutomations ?? []).filter((automation) => automation.active && automation.trigger === 'new_lead')
        : []

    const automationsAlreadyTriggered = Boolean(activeSession.flags?.automationsTriggered)
    if (createdLead && leadId && activeAutomations.length && !automationsAlreadyTriggered) {
      const automationTasks = []
      activeAutomations.forEach((automation) => {
        const steps = Array.isArray(automation.steps) ? automation.steps : []
        steps.forEach((step, index) => {
          const minutes = Math.max(0, Math.round(Number(step.waitMinutes) || 0))
          automationTasks.push({
            id: createId('t'),
            title: `Automação: ${automation.name} • Passo ${index + 1}`,
            note: (step.message ?? '').trim() || 'Enviar mensagem automática',
            type: step.channel === 'email' ? 'email' : 'follow_up',
            dueLabel: minutes ? `${minutes} min` : 'Agora',
            overdue: false,
            priority: 'medium',
            related: leadPayload.name,
            done: false,
          })
        })
      })

      if (automationTasks.length) {
        setStoredTasks((prev) => [...automationTasks, ...(prev ?? [])])
        triggeredAutomations = true
        eventMessages.push({
          id: `${baseId}-e4`,
          role: 'event',
          channel,
          time,
          text: `[CRM] Automações iniciadas: ${activeAutomations.map((a) => a.name).join(', ')}`,
        })
      }
    }

    const agentText = agentBuildReply({
      channelLabel: activeChannel.label,
      connected: isConnected,
      createdLead,
      createdDeal,
      createdTasks,
      triggeredAutomations,
      draft: nextDraft,
      questions,
    })

    agentMessage = { ...agentMessage, text: agentText }

    setSession(channel, {
      leadId,
      draft: nextDraft,
      dealId: nextDealId,
      flags: {
        ...(activeSession.flags ?? {}),
        automationsTriggered: Boolean(activeSession.flags?.automationsTriggered) || triggeredAutomations,
      },
    })

    appendMessages([userMessage, agentMessage, ...eventMessages])
    setDraft('')
    */
  }

  const whatsappEvolution = connections.whatsapp?.provider === 'evolution' ? connections.whatsapp.evolution : null

  useEffect(() => {
    if (!whatsappEvolution?.baseUrl || !whatsappEvolution?.apiKey || !whatsappEvolution?.instance) {
      evolutionAfterRef.current = 0
      evolutionPollingRef.current = false
      return
    }

    if (evolutionPollingRef.current) return
    evolutionPollingRef.current = true
    evolutionAfterRef.current = 0

    let cancelled = false
    let warned = false

    const poll = async () => {
      if (cancelled) return

      try {
        const res = await fetch(`/api/evolution/events?after=${evolutionAfterRef.current}`)
        const data = await res.json().catch(() => null)

        if (data?.ok) {
          const incoming = Array.isArray(data.events) ? data.events : []
          for (const item of incoming) {
            const seq = Number(item.seq) || 0
            if (seq > evolutionAfterRef.current) evolutionAfterRef.current = seq

            if (item.type === 'whatsapp_message' && item.text && item.sender) {
              const sender = String(item.sender)
              const author = String(item.author ?? '').trim() || agentNormalizePhone(sender) || `WhatsApp ${sender}`
              await runAgentWorkflow({
                channelId: 'whatsapp',
                text: item.text,
                author,
                peer: sender,
                source: 'evolution',
                autoReply: true,
              })
            }
          }

          if (typeof data.nextAfter === 'number' && data.nextAfter > evolutionAfterRef.current) {
            evolutionAfterRef.current = data.nextAfter
          }
        }
      } catch (err) {
        if (!warned) {
          warned = true
          appendEvent('whatsapp', `[CRM] Evolution polling indisponível: ${String(err?.message || err)}`)
        }
      }

      if (!cancelled) setTimeout(poll, 2000)
    }

    poll()

    return () => {
      cancelled = true
      evolutionPollingRef.current = false
    }
  }, [appendEvent, runAgentWorkflow, whatsappEvolution?.apiKey, whatsappEvolution?.baseUrl, whatsappEvolution?.instance])

  const close = () => {
    if (typeof onClose === 'function') onClose()
  }

  return (
    <div className="page agent-page">
      <AgentConnectModal
        open={connectModal.open}
        channel={connectModal.channel ?? channel}
        meta={channels.find((item) => item.id === (connectModal.channel ?? channel)) ?? activeChannel}
        connection={connections[connectModal.channel ?? channel] ?? { connected: false, account: '' }}
        onClose={closeConnectModal}
        onSave={(payload) => {
          const channelId = connectModal.channel ?? channel
          const now = new Date()
          const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          setConnection(channelId, payload)
          closeConnectModal()
          appendMessages([
            {
              id: createId('event'),
              role: 'event',
              channel: channelId,
              time,
              text: `[CRM] Canal conectado: ${channels.find((item) => item.id === channelId)?.label ?? channelId}`,
            },
          ])
        }}
        onDisconnect={() => {
          const channelId = connectModal.channel ?? channel
          const now = new Date()
          const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          setConnection(channelId, { connected: false, account: '', connectedAt: null })
          closeConnectModal()
          appendMessages([
            {
              id: createId('event'),
              role: 'event',
              channel: channelId,
              time,
              text: `[CRM] Canal desconectado: ${channels.find((item) => item.id === channelId)?.label ?? channelId}`,
            },
          ])
        }}
      />

      <div className="agent-shell" role="region" aria-label="Agente IA Multicanal">
        <header className="agent-header">
          <div className="agent-header-left">
            <span className="agent-header-icon" aria-hidden="true">
              <Icon.Spark className="svg" />
            </span>
            <div className="agent-header-text">
              <div className="agent-header-title">Agente IA Multicanal</div>
              <div className="agent-header-sub">WhatsApp · Instagram · Facebook Messenger</div>
            </div>
          </div>

          <button type="button" className="agent-close" onClick={close} aria-label="Fechar">
            <Icon.X className="svg" />
          </button>
        </header>

        <div className="agent-content">
          <div className="agent-channel-tabs" role="tablist" aria-label="Canais">
            {channels.map((item) => {
              const TabIcon = item.icon
              const active = item.id === channel
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? 'agent-channel-tab active' : 'agent-channel-tab'}
                  onClick={() => setChannel(item.id)}
                >
                  <TabIcon className="svg sm" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          <section className={`agent-connect-card ${activeChannel.tone}`} aria-label="Conexão do canal">
            <div className="agent-connect-head">
              <span className={`agent-connect-logo ${activeChannel.tone}`} aria-hidden="true">
                <ActiveIcon className="svg" />
              </span>
              <div className="agent-connect-meta">
                <div className="agent-connect-title">{activeChannel.title}</div>
                <div className="agent-connect-desc">{activeChannel.description}</div>
              </div>
              <span className={`agent-badge ${activeChannel.tone}`}>{isConnected ? 'Conectado' : 'Disponível'}</span>
            </div>

            <button type="button" className={`agent-connect-btn ${activeChannel.tone}`} onClick={openConnectModal}>
              <ActiveIcon className="svg sm" />
              <span>
                {isConnected ? 'Configurar' : 'Conectar'} {activeChannel.label}
              </span>
              <Icon.ExternalLink className="svg sm" />
            </button>
          </section>

          <section className="agent-status-grid" aria-label="Status dos canais">
            {channels.map((item) => {
              const isActive = item.id === channel
              const connected = Boolean(connections[item.id]?.connected)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`agent-status-card ${item.tone}${isActive ? ' active' : ''}`}
                  onClick={() => setChannel(item.id)}
                >
                  <div className="agent-status-title">{item.label}</div>
                  <div className="agent-status-sub">
                    {isActive ? (connected ? 'Ativo' : 'Modo teste') : connected ? 'Conectado' : 'Conectar'}
                  </div>
                </button>
              )
            })}
          </section>

          <section className="agent-panel" aria-label="Teste do agente">
            {messages.length === 0 ? (
              <div className="agent-empty">
                <span className="agent-empty-icon" aria-hidden="true">
                  <Icon.Bot className="svg" />
                </span>
                <h2>Agente Multicanal de Leads</h2>
                <p>
                  O agente responde automaticamente em WhatsApp, Instagram Direct e Facebook Messenger. Teste aqui ou
                  conecte suas contas acima.
                </p>
                <div className="agent-chips" aria-label="Canais disponíveis">
                  {channels.map((item) => {
                    const ChipIcon = item.icon
                    return (
                      <span key={item.id} className={`agent-chip ${item.tone}`}>
                        <ChipIcon className="svg sm" />
                        <span>{item.label}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="agent-messages" aria-label="Mensagens">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user'
                  const isEvent = msg.role === 'event'
                  const msgChannel = channels.find((item) => item.id === msg.channel) ?? activeChannel
                  const className = isEvent
                    ? 'agent-message event'
                    : isUser
                      ? 'agent-message user'
                      : 'agent-message agent'
                  const author = isEvent ? 'CRM' : msg.author ? msg.author : isUser ? 'Você' : 'Agente IA'
                  return (
                    <article key={msg.id} className={className}>
                      <div className="agent-message-meta">
                        <span className="agent-message-author">{author}</span>
                        <span className={`agent-message-chip ${msgChannel.tone}`}>{msgChannel.label}</span>
                        <span className="agent-message-time">{msg.time}</span>
                      </div>
                      <div className="agent-message-text">{msg.text}</div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <form className="agent-footer" onSubmit={handleSend}>
          <input
            className="agent-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Digite uma mensagem para testar o agente..."
          />
          <button type="submit" className="agent-send" disabled={!draft.trim()} aria-label="Enviar mensagem">
            <Icon.Send className="svg" />
          </button>
        </form>
      </div>
    </div>
  )
}

function PlaceholderPage({ title }) {
  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>{title}</h1>
          <p className="subtitle">Em desenvolvimento</p>
        </div>
      </header>
      <section className="card placeholder">
        <h2>Próximo passo</h2>
        <p>Envie a próxima imagem desta seção para eu replicar no layout e começar a integrar com dados.</p>
      </section>
    </div>
  )
}

function FullPageLoader({ title = 'Carregando' }) {
  return (
    <div className="auth-root">
      <div className="auth-shell single">
        <section className="auth-card">
          <div className="auth-card-head">
            <div className="brand">
              <div className="brand-logo" aria-hidden="true">
                <Icon.Bolt className="svg" />
              </div>
              <div className="brand-text">
                <div className="brand-title">CRM Pro</div>
                <div className="brand-sub">Preparando seu workspace</div>
              </div>
            </div>
          </div>
          <div className="auth-loading">
            <div className="auth-spinner" aria-hidden="true" />
            <div className="auth-loading-text">{title}</div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SupabaseSetupPage() {
  return (
    <div className="auth-root">
      <div className="auth-shell single">
        <section className="auth-card">
          <div className="auth-card-head">
            <div className="brand">
              <div className="brand-logo" aria-hidden="true">
                <Icon.Bolt className="svg" />
              </div>
              <div className="brand-text">
                <div className="brand-title">CRM Pro</div>
                <div className="brand-sub">Configuração necessária</div>
              </div>
            </div>
          </div>

          <div className="auth-alert error">
            Para habilitar o login e sincronização, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no arquivo
            `.env`.
          </div>

          <div className="auth-setup">
            <div className="auth-setup-title">Passos</div>
            <ol className="auth-setup-steps">
              <li>Rode o SQL em `modern-todo/supabase/schema.sql` no Supabase</li>
              <li>Copie `modern-todo/.env.example` para `modern-todo/.env`</li>
              <li>Preencha as variáveis do Supabase</li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  )
}

function AuthPage() {
  const [mode, setMode] = useState('sign-in') // sign-in | sign-up | magic
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const normalizedEmail = email.trim().toLowerCase()
  const passwordOk = mode === 'magic' ? true : password.trim().length >= 6
  const confirmOk = mode !== 'sign-up' ? true : confirm === password
  const canSubmit = Boolean(normalizedEmail) && passwordOk && confirmOk && !busy

  const submitLabel = mode === 'sign-up' ? 'Criar conta' : mode === 'magic' ? 'Enviar link mágico' : 'Entrar'

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!supabaseConfigured || !supabase) return
    if (!canSubmit) return

    setBusy(true)
    setError('')
    setInfo('')

    try {
      if (mode === 'magic') {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: { emailRedirectTo: window.location.origin },
        })
        if (otpError) throw otpError
        setInfo('Link enviado! Verifique seu e-mail para entrar.')
        return
      }

      if (mode === 'sign-up') {
        if (password !== confirm) {
          setError('As senhas não conferem.')
          return
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: name.trim() || undefined } },
        })
        if (signUpError) throw signUpError
        if (!data.session) {
          setInfo('Conta criada! Confirme seu e-mail para ativar o acesso.')
        }
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })
      if (signInError) throw signInError
    } catch (err) {
      setError(err?.message ? String(err.message) : 'Não foi possível autenticar.')
    } finally {
      setBusy(false)
    }
  }

  if (!supabaseConfigured || !supabase) return <SupabaseSetupPage />

  return (
    <div className="auth-root">
      <div className="auth-shell">
        <section className="auth-hero">
          <div className="auth-hero-top">
            <div className="brand">
              <div className="brand-logo" aria-hidden="true">
                <Icon.Bolt className="svg" />
              </div>
              <div className="brand-text">
                <div className="brand-title">Nexus CRM Pro</div>
                <div className="brand-sub">CRM imobiliário, feito para conversas</div>
              </div>
            </div>
          </div>

          <h1 className="auth-headline">Venda com contexto. Atenda com velocidade.</h1>
          <p className="auth-copy">
            Leads, pipeline, tarefas e automações em um só lugar — com integração multicanal via WhatsApp, Instagram e
            Facebook.
          </p>

          <div className="auth-features" aria-label="Destaques do CRM">
            <div className="auth-feature">
              <span className="auth-feature-icon" aria-hidden="true">
                <Icon.Dollar className="svg sm" />
              </span>
              Pipeline com drag & drop
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon" aria-hidden="true">
                <Icon.Users className="svg sm" />
              </span>
              Leads + contatos unificados
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon" aria-hidden="true">
                <Icon.Clipboard className="svg sm" />
              </span>
              Tarefas com prioridades
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon" aria-hidden="true">
                <Icon.Spark className="svg sm" />
              </span>
              Agente IA multicanal
            </div>
          </div>

          <div className="auth-hero-foot">
            <div className="auth-hero-note">
              Seus dados são isolados por workspace (usuário) no Supabase — pronto para produção.
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card-head">
            <h2>Acesse o CRM</h2>
            <p className="subtitle">Entre com sua conta para começar</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Método de acesso">
            <button
              type="button"
              className={mode === 'sign-in' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => setMode('sign-in')}
              role="tab"
              aria-selected={mode === 'sign-in'}
            >
              Entrar
            </button>
            <button
              type="button"
              className={mode === 'sign-up' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => setMode('sign-up')}
              role="tab"
              aria-selected={mode === 'sign-up'}
            >
              Criar conta
            </button>
            <button
              type="button"
              className={mode === 'magic' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => setMode('magic')}
              role="tab"
              aria-selected={mode === 'magic'}
            >
              Link mágico
            </button>
          </div>

          {error ? <div className="auth-alert error">{error}</div> : null}
          {info ? <div className="auth-alert info">{info}</div> : null}

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'sign-up' ? (
              <label className="form-field">
                <span className="form-label">Nome (opcional)</span>
                <input
                  className="form-control"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como podemos te chamar?"
                  autoComplete="name"
                />
              </label>
            ) : null}

            <label className="form-field">
              <span className="form-label">E-mail</span>
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seuemail@dominio.com"
                autoComplete="email"
                required
              />
            </label>

            {mode !== 'magic' ? (
              <label className="form-field">
                <span className="form-label">Senha</span>
                <input
                  className="form-control"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  required
                />
              </label>
            ) : null}

            {mode === 'sign-up' ? (
              <label className="form-field">
                <span className="form-label">Confirmar senha</span>
                <input
                  className="form-control"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  required
                />
              </label>
            ) : null}

            <button type="submit" className="btn primary auth-submit" disabled={!canSubmit}>
              {busy ? 'Aguarde...' : submitLabel}
            </button>

            {mode === 'magic' ? (
              <p className="auth-hint">Enviamos um link de acesso para seu e-mail. Abra no mesmo navegador.</p>
            ) : (
              <p className="auth-hint">Ao entrar, seu workspace é criado automaticamente a partir do seu usuário.</p>
            )}
          </form>
        </section>
      </div>
    </div>
  )
}

function useSupabaseSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabaseConfigured && supabase))

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (cancelled) return
        if (error) throw error
        setSession(data.session)
      } catch (err) {
        console.warn('[supabase] falha ao obter sessão:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      cancelled = true
      listener?.subscription?.unsubscribe()
    }
  }, [])

  return { session, user: session?.user ?? null, loading }
}

function App() {
  const requireLogin = import.meta.env.VITE_REQUIRE_LOGIN !== 'false'
  const { session, user, loading } = useSupabaseSession()
  const [activeNav, setActiveNav] = useState('dashboard')
  const activeLabel = NAV_ITEMS.find((item) => item.id === activeNav)?.label ?? 'Dashboard'

  const workspace = user?.id ? String(user.id) : DEFAULT_WORKSPACE

  const handleSignOut = useCallback(async () => {
    if (!supabaseConfigured || !supabase) return
    try {
      await supabase.auth.signOut()
    } finally {
      clearWorkspace()
    }
  }, [])

  if (requireLogin) {
    if (!supabaseConfigured || !supabase) return <SupabaseSetupPage />
    if (loading) return <FullPageLoader title="Carregando sua sessão..." />
    if (!session) return <AuthPage />
  }

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="crm-root">
        <Sidebar activeId={activeNav} onSelect={setActiveNav} user={user} onSignOut={handleSignOut} />

        <main className="main" aria-label="Conteúdo">
          {activeNav === 'dashboard' ? <DashboardPage onNavigate={setActiveNav} /> : null}
          {activeNav === 'leads' ? <LeadsPage /> : null}
          {activeNav === 'pipeline' ? <PipelinePage /> : null}
          {activeNav === 'contacts' ? <ContactsPage /> : null}
          {activeNav === 'companies' ? <CompaniesPage /> : null}
          {activeNav === 'tasks' ? <TasksPage /> : null}
          {activeNav === 'marketing' ? <MarketingPage /> : null}
          {activeNav === 'reports' ? <ReportsPage /> : null}
          {activeNav === 'ai' ? <AiPage onClose={() => setActiveNav('dashboard')} /> : null}
          {activeNav !== 'dashboard' &&
          activeNav !== 'leads' &&
          activeNav !== 'pipeline' &&
          activeNav !== 'contacts' &&
          activeNav !== 'companies' &&
          activeNav !== 'tasks' &&
          activeNav !== 'marketing' &&
          activeNav !== 'reports' &&
          activeNav !== 'ai' ? (
            <PlaceholderPage title={activeLabel} />
          ) : null}
        </main>
      </div>
    </WorkspaceContext.Provider>
  )
}

export default App
