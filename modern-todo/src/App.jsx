import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

const STORAGE_KEY = 'modern-todo-tasks'

const priorityMeta = {
  high: { label: 'Alta', accent: '#ff7b7b' },
  medium: { label: 'Media', accent: '#f7c266' },
  low: { label: 'Baixa', accent: '#7ce0a7' },
}

const starterTasks = [
  {
    id: 't-1',
    title: 'Planejar a semana com o time',
    note: 'Selecionar 3 metas claras e priorizar backlog critico.',
    priority: 'high',
    tags: ['planejamento', 'time'],
    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    done: false,
    createdAt: Date.now(),
  },
  {
    id: 't-2',
    title: 'Refinar cards de entrega',
    note: 'Dividir tarefas em blocos entregaveis de 1 dia.',
    priority: 'medium',
    tags: ['produto'],
    dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    done: false,
    createdAt: Date.now() - 1000,
  },
  {
    id: 't-3',
    title: 'Feedback rapido com cliente',
    note: 'Confirmar prototipo e alinhar prioridades de UI.',
    priority: 'low',
    tags: ['cliente', 'feedback'],
    dueDate: '',
    done: true,
    createdAt: Date.now() - 2000,
  },
]

const loadTasks = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return starterTasks

  try {
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed : starterTasks
  } catch (error) {
    console.error('Falha ao carregar tasks', error)
    return starterTasks
  }
}

const mapFromRow = (row) => ({
  id: row.id,
  title: row.title || '',
  note: row.note || '',
  priority: row.priority || 'medium',
  tags: row.tags || [],
  dueDate: row.due_date || '',
  done: row.done ?? false,
  createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
})

const formatDue = (value) => {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

const isOverdue = (value, done) => {
  if (!value || done) return false
  return new Date(value) < new Date()
}

const randomId = () => crypto.randomUUID?.() ?? `id-${Math.random().toString(16).slice(2)}`

function App() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('idle') // idle | online | offline | error
  const [form, setForm] = useState({
    title: '',
    note: '',
    priority: 'medium',
    tags: '',
    dueDate: '',
  })
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    tag: 'all',
    search: '',
    sort: 'soonest',
  })
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const pushToast = (message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    const bootstrap = async () => {
      const local = loadTasks()
      setTasks(local)

      if (!supabase) {
        setSyncStatus('offline')
        setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error

        const mapped = data.map(mapFromRow)
        setTasks(mapped)
        setSyncStatus('online')
      } catch (error) {
        console.error('Erro ao buscar Supabase', error)
        setSyncStatus('offline')
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const tagOptions = useMemo(() => {
    const set = new Set()
    tasks.forEach((task) => task.tags.forEach((tag) => set.add(tag)))
    return Array.from(set)
  }, [tasks])

  const filteredTasks = useMemo(() => {
    const search = filters.search.trim().toLowerCase()

    const filtered = tasks.filter((task) => {
      if (filters.status === 'active' && task.done) return false
      if (filters.status === 'done' && !task.done) return false
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false
      if (filters.tag !== 'all' && !task.tags.includes(filters.tag)) return false

      if (search) {
        const haystack = `${task.title} ${task.note} ${task.tags.join(' ')}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }

      return true
    })

    if (filters.sort === 'priority') {
      const order = { high: 0, medium: 1, low: 2 }
      return filtered.sort((a, b) => order[a.priority] - order[b.priority])
    }

    if (filters.sort === 'recent') {
      return filtered.sort((a, b) => b.createdAt - a.createdAt)
    }

    return filtered.sort((a, b) => {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
      return aDue - bDue
    })
  }, [tasks, filters])

  const activeCount = tasks.filter((task) => !task.done).length
  const completedCount = tasks.filter((task) => task.done).length
  const dueSoon = tasks.filter(
    (task) =>
      task.dueDate &&
      !task.done &&
      new Date(task.dueDate).getTime() - new Date().getTime() < 72 * 60 * 60 * 1000 &&
      new Date(task.dueDate) > new Date(),
  ).length

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) return

    const tags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    const tempTask = {
      id: randomId(),
      title: form.title.trim(),
      note: form.note.trim(),
      priority: form.priority,
      tags,
      dueDate: form.dueDate,
      done: false,
      createdAt: Date.now(),
    }

    setTasks((prev) => [tempTask, ...prev])
    setForm((prev) => ({
      ...prev,
      title: '',
      note: '',
      tags: '',
    }))

    pushToast('Nova tarefa criada')

    if (!supabase) {
      setSyncStatus('offline')
      return
    }

    try {
      const { data, error } = await supabase
        .from('todos')
        .insert([
          {
            title: tempTask.title,
            note: tempTask.note,
            priority: tempTask.priority,
            tags: tempTask.tags,
            due_date: tempTask.dueDate || null,
            done: tempTask.done,
            created_at: new Date(tempTask.createdAt).toISOString(),
          },
        ])
        .select()
        .single()

      if (error) throw error

      const synced = mapFromRow(data)
      setTasks((prev) => prev.map((task) => (task.id === tempTask.id ? synced : task)))
      setSyncStatus('online')
      pushToast('Sincronizado com Supabase')
    } catch (error) {
      console.error('Falha ao salvar no Supabase', error)
      setSyncStatus('offline')
      pushToast('Salvo localmente. Falha ao sincronizar')
    }
  }

  const toggleTask = async (id) => {
    const current = tasks.find((task) => task.id === id)
    if (!current) return
    const nextDone = !current.done

    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, done: nextDone } : task)),
    )

    if (!supabase) {
      setSyncStatus('offline')
      return
    }

    try {
      const { error } = await supabase
        .from('todos')
        .update({ done: nextDone })
        .eq('id', id)

      if (error) throw error
      setSyncStatus('online')
    } catch (error) {
      console.error('Falha ao sincronizar toggle', error)
      setSyncStatus('offline')
      pushToast('Mudanca mantida localmente. Sem sync.')
    }
  }

  const removeTask = async (id) => {
    setTasks((prev) => prev.filter((task) => task.id !== id))

    if (!supabase) {
      setSyncStatus('offline')
      return
    }

    try {
      const { error } = await supabase.from('todos').delete().eq('id', id)
      if (error) throw error
      setSyncStatus('online')
    } catch (error) {
      console.error('Falha ao remover no Supabase', error)
      setSyncStatus('offline')
      pushToast('Remocao apenas local. Sem sync.')
    }
  }

  const clearCompleted = async () => {
    const completedIds = tasks.filter((task) => task.done).map((t) => t.id)
    setTasks((prev) => prev.filter((task) => !task.done))

    if (!supabase || completedIds.length === 0) {
      if (!supabase) setSyncStatus('offline')
      return
    }

    try {
      const { error } = await supabase.from('todos').delete().in('id', completedIds)
      if (error) throw error
      setSyncStatus('online')
    } catch (error) {
      console.error('Falha ao limpar no Supabase', error)
      setSyncStatus('offline')
      pushToast('Limpeza apenas local. Sem sync.')
    }
  }

  const syncLabel =
    syncStatus === 'online'
      ? 'Supabase online + local'
      : syncStatus === 'offline'
        ? 'Modo offline (local)'
        : 'Sync local'

  return (
    <div className="page">
      <div className="ambient" aria-hidden />
      {toast && (
        <div className="toast">
          <span className="dot" />
          <span>{toast.message}</span>
        </div>
      )}
      <div className="shell">
        <header className="hero">
          <div className="hero-top">
            <span className="pill neon">Orbit Tasks</span>
            <span className="pill ghost">{new Date().toLocaleDateString('pt-BR')}</span>
          </div>
          <h1>To-do moderno para priorizar o que importa</h1>
          <p className="lede">
            Capture ideias, priorize com clareza e mantenha o foco. Tudo salvo localmente e pronto
            para acao rapida. Supabase ativa quando online.
          </p>
          <div className="stats">
            <div className="stat-card">
              <span className="stat-label">Ativos</span>
              <span className="stat-value">{activeCount}</span>
              <span className="stat-sub">Em andamento agora</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Concluidos</span>
              <span className="stat-value">{completedCount}</span>
              <span className="stat-sub">Arquivados com sucesso</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Proximos 3 dias</span>
              <span className="stat-value">{dueSoon}</span>
              <span className="stat-sub">Data chegando</span>
            </div>
          </div>
        </header>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Adicionar</p>
              <h2>Nova tarefa</h2>
            </div>
            <span className="pill ghost">{syncLabel}</span>
          </div>
          <form className="task-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Titulo *</label>
              <input
                type="text"
                placeholder="Ex.: Fechar proposta com cliente"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Descricao</label>
              <textarea
                rows="3"
                placeholder="Contexto rapido, proximos passos ou links uteis"
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </div>
            <div className="inline">
              <div className="field">
                <label>Prioridade</label>
                <div className="segmented">
                  {Object.keys(priorityMeta).map((level) => (
                    <button
                      type="button"
                      key={level}
                      className={form.priority === level ? 'segment active' : 'segment'}
                      onClick={() => setForm((prev) => ({ ...prev, priority: level }))}
                    >
                      <span
                        className="dot"
                        style={{ background: priorityMeta[level].accent }}
                      />
                      {priorityMeta[level].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Data</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </div>
            </div>
            <div className="inline">
              <div className="field">
                <label>Tags (separe por virgula)</label>
                <input
                  type="text"
                  placeholder="ex.: design, entrega, cliente"
                  value={form.tags}
                  onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                />
              </div>
              <button type="submit" className="primary">
                Adicionar
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Visao</p>
              <h2>Filtrar e focar</h2>
            </div>
            <div className="actions">
              <button className="ghost" type="button" onClick={clearCompleted}>
                Limpar concluidos
              </button>
            </div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <span className="label">Status</span>
              {['all', 'active', 'done'].map((status) => (
                <button
                  key={status}
                  className={
                    filters.status === status ? 'chip filter active' : 'chip filter ghosty'
                  }
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, status }))}
                >
                  {status === 'all' && 'Todos'}
                  {status === 'active' && 'Em aberto'}
                  {status === 'done' && 'Concluidos'}
                </button>
              ))}
            </div>

            <div className="filter-group">
              <span className="label">Prioridade</span>
              {['all', 'high', 'medium', 'low'].map((priority) => (
                <button
                  key={priority}
                  className={
                    filters.priority === priority ? 'chip filter active' : 'chip filter ghosty'
                  }
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, priority }))}
                >
                  {priority === 'all' ? 'Todas' : priorityMeta[priority].label}
                </button>
              ))}
            </div>

            <div className="filter-group">
              <span className="label">Tags</span>
              <div className="tags-row">
                <button
                  className={filters.tag === 'all' ? 'chip filter active' : 'chip filter ghosty'}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, tag: 'all' }))}
                >
                  Todas
                </button>
                {tagOptions.map((tag) => (
                  <button
                    key={tag}
                    className={
                      filters.tag === tag ? 'chip filter active' : 'chip filter ghosty'
                    }
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, tag }))}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-grid">
              <div className="field">
                <label>Buscar</label>
                <input
                  type="search"
                  placeholder="Procure por titulo, descricao ou tag"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Ordenar por</label>
                <select
                  value={filters.sort}
                  onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value }))}
                >
                  <option value="soonest">Proximas datas</option>
                  <option value="priority">Prioridade</option>
                  <option value="recent">Mais recentes</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Tarefas</p>
              <h2>Lista inteligente</h2>
            </div>
            <span className="pill ghost">
              {filteredTasks.length} item{filteredTasks.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="task-list">
            {loading && (
              <div className="empty">
                <p>Carregando dados...</p>
              </div>
            )}

            {!loading && filteredTasks.length === 0 && (
              <div className="empty">
                <p>Nenhum item com os filtros atuais.</p>
                <p className="hint">Crie algo novo ou ajuste os filtros.</p>
              </div>
            )}

            {!loading &&
              filteredTasks.map((task) => {
                const overdue = isOverdue(task.dueDate, task.done)
                return (
                  <article key={task.id} className={task.done ? 'task done' : 'task'}>
                    <div className="task-main">
                      <button className="check" type="button" onClick={() => toggleTask(task.id)}>
                        {task.done ? '✓' : ''}
                      </button>
                      <div className="task-content">
                        <div className="task-title-row">
                          <span className="task-title">{task.title}</span>
                          <span className={`chip priority ${task.priority}`}>
                            {priorityMeta[task.priority].label}
                          </span>
                        </div>
                        {task.note && <p className="task-note">{task.note}</p>}
                        <div className="meta-row">
                          <span className={`chip due ${overdue ? 'overdue' : ''}`}>
                            {overdue ? 'Atrasada • ' : ''}
                            {formatDue(task.dueDate)}
                          </span>
                          {task.tags.map((tag) => (
                            <span key={tag} className="chip tag">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="task-actions">
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => toggleTask(task.id)}
                      >
                        {task.done ? 'Reabrir' : 'Concluir'}
                      </button>
                      <button className="danger small" type="button" onClick={() => removeTask(task.id)}>
                        Remover
                      </button>
                    </div>
                  </article>
                )
              })}
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
