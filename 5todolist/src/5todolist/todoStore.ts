import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export type TodoItem = {
  id: string
  title: string
  memo: string
  isDone: boolean
  archived: boolean
  createdAt: string
}

export type DeletedTodoItem = TodoItem & {
  deletedAt: string
}

type BackendTask = {
  id: number
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'task_miss'
  due_date: string
  is_archived: boolean
}

function backendToTodo(task: BackendTask): TodoItem {
  return {
    id: String(task.id),
    title: task.title,
    memo: task.description ?? '',
    isDone: task.status === 'completed',
    archived: task.is_archived,
    createdAt: task.due_date,
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

const MAX_TODOS = 5

const todayLocalStart = () => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

const isPastLocalDate = (isoString: string) => {
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed < todayLocalStart()
}

const toLocalDateKey = (isoString: string) => {
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Module-level map: tracks pending backend DELETEs so undo can cancel them
const pendingBackendDeletes = new Map<string, ReturnType<typeof setTimeout>>()

type TodoState = {
  todos: TodoItem[]
  deletedTodos: DeletedTodoItem[]
  _token: string | null

  setToken: (token: string | null) => void
  addTodo: (title: string, memo?: string, createdAt?: string) => Promise<{ ok: boolean; reason?: string }>
  toggleDone: (id: string) => void
  removeTodo: (id: string) => void
  insertTodo: (todo: TodoItem, index?: number) => void
  updateTodo: (id: string, values: { title?: string; memo?: string }) => void
  archiveTodo: (id: string) => void
  restoreTodo: (id: string) => void
  fetchFromBackend: () => Promise<void>
  migrateAndFetch: () => Promise<void>
  clearStore: () => void
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: [],
      deletedTodos: [],
      _token: null,

      setToken: (token) => set({ _token: token }),

      addTodo: async (title, memo = '', createdAt?) => {
        const todayKey = toLocalDateKey(new Date().toISOString())
        const activeCount = get().todos.filter(
          (todo) => !todo.archived && toLocalDateKey(todo.createdAt) === todayKey,
        ).length
        if (activeCount >= MAX_TODOS) {
          return { ok: false, reason: '오늘 할 일은 최대 5개까지 가능합니다.' }
        }
        const cleanTitle = title.trim()
        if (!cleanTitle) {
          return { ok: false, reason: '할 일 제목을 입력해주세요.' }
        }
        const normalizedCreatedAt = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString()
        if (Number.isNaN(new Date(normalizedCreatedAt).getTime())) {
          return { ok: false, reason: '등록 날짜가 올바르지 않아요.' }
        }
        if (isPastLocalDate(normalizedCreatedAt)) {
          return { ok: false, reason: '과거 날짜의 할 일은 등록할 수 없어요.' }
        }

        const token = get()._token
        if (token) {
          try {
            const res = await fetch(`${API_BASE}/tasks`, {
              method: 'POST',
              headers: authHeaders(token),
              body: JSON.stringify({
                title: cleanTitle,
                description: memo.trim() || null,
                due_date: normalizedCreatedAt,
              }),
            })
            if (!res.ok) {
              const data = await res.json()
              return { ok: false, reason: data.detail ?? '할 일 등록에 실패했습니다.' }
            }
            const task: BackendTask = await res.json()
            set((state) => ({ todos: [backendToTodo(task), ...state.todos] }))
            return { ok: true }
          } catch {
            return { ok: false, reason: '서버에 연결할 수 없습니다.' }
          }
        }

        // Guest mode: local only
        const newTodo: TodoItem = {
          id: crypto.randomUUID(),
          title: cleanTitle,
          memo: memo.trim(),
          isDone: false,
          archived: false,
          createdAt: normalizedCreatedAt,
        }
        set((state) => ({ todos: [newTodo, ...state.todos] }))
        return { ok: true }
      },

      toggleDone: (id) => {
        const currentTodo = get().todos.find((t) => t.id === id)
        const newIsDone = !currentTodo?.isDone
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id ? { ...todo, isDone: newIsDone } : todo,
          ),
        }))
        const token = get()._token
        if (token && !Number.isNaN(Number(id))) {
          fetch(`${API_BASE}/tasks/${id}`, {
            method: 'PATCH',
            headers: authHeaders(token),
            body: JSON.stringify({ status: newIsDone ? 'completed' : 'pending' }),
          }).catch(() => {})
        }
      },

      removeTodo: (id) => {
        const target = get().todos.find((todo) => todo.id === id)
        set((state) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
          deletedTodos: target
            ? [{ ...target, deletedAt: new Date().toISOString() }, ...state.deletedTodos]
            : state.deletedTodos,
        }))
        const token = get()._token
        if (token && !Number.isNaN(Number(id))) {
          // Delay backend DELETE by 3.5s to allow undo within the 3s toast window
          const timeoutId = setTimeout(() => {
            pendingBackendDeletes.delete(id)
            fetch(`${API_BASE}/tasks/${id}`, {
              method: 'DELETE',
              headers: authHeaders(token),
            }).catch(() => {})
          }, 3500)
          pendingBackendDeletes.set(id, timeoutId)
        }
      },

      insertTodo: (todo, index = 0) => {
        // Cancel pending backend DELETE if the user is undoing the deletion
        if (pendingBackendDeletes.has(todo.id)) {
          clearTimeout(pendingBackendDeletes.get(todo.id)!)
          pendingBackendDeletes.delete(todo.id)
        }
        set((state) => {
          const nextTodos = [...state.todos]
          const safeIndex = Math.max(0, Math.min(index, nextTodos.length))
          nextTodos.splice(safeIndex, 0, todo)
          return {
            todos: nextTodos,
            deletedTodos: state.deletedTodos.filter((item) => item.id !== todo.id),
          }
        })
      },

      updateTodo: (id, values) => {
        set((state) => ({
          todos: state.todos.map((todo) => {
            if (todo.id !== id) return todo
            return {
              ...todo,
              title: values.title ?? todo.title,
              memo: values.memo ?? todo.memo,
            }
          }),
        }))
        const token = get()._token
        if (token && !Number.isNaN(Number(id))) {
          fetch(`${API_BASE}/tasks/${id}`, {
            method: 'PATCH',
            headers: authHeaders(token),
            body: JSON.stringify({
              title: values.title,
              description: values.memo,
            }),
          }).catch(() => {})
        }
      },

      archiveTodo: (id) => {
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id && !todo.isDone ? { ...todo, archived: true } : todo,
          ),
        }))
        const token = get()._token
        if (token && !Number.isNaN(Number(id))) {
          fetch(`${API_BASE}/tasks/${id}`, {
            method: 'PATCH',
            headers: authHeaders(token),
            body: JSON.stringify({ is_archived: true }),
          }).catch(() => {})
        }
      },

      restoreTodo: (id) => {
        const now = new Date().toISOString()
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id
              ? { ...todo, archived: false, isDone: false, createdAt: now }
              : todo,
          ),
        }))
        const token = get()._token
        if (token && !Number.isNaN(Number(id))) {
          fetch(`${API_BASE}/tasks/${id}`, {
            method: 'PATCH',
            headers: authHeaders(token),
            body: JSON.stringify({ is_archived: false }),
          }).catch(() => {})
        }
      },

      fetchFromBackend: async () => {
        const token = get()._token
        if (!token) return
        try {
          const [activeRes, archiveRes] = await Promise.all([
            fetch(`${API_BASE}/tasks`, { headers: authHeaders(token) }),
            fetch(`${API_BASE}/tasks/archive`, { headers: authHeaders(token) }),
          ])
          if (!activeRes.ok || !archiveRes.ok) return
          const activeTasks: BackendTask[] = await activeRes.json()
          const archivedTasks: BackendTask[] = await archiveRes.json()
          set({
            todos: [
              ...activeTasks.map(backendToTodo),
              ...archivedTasks.map(backendToTodo),
            ],
            deletedTodos: [],
          })
        } catch {
          // silently fail — local state is preserved
        }
      },

      migrateAndFetch: async () => {
        const token = get()._token
        if (!token) return

        // 1. Upload local guest todos (non-numeric IDs = not yet in backend)
        const guestTodos = get().todos.filter((t) => Number.isNaN(Number(t.id)))
        for (const todo of guestTodos) {
          try {
            await fetch(`${API_BASE}/tasks`, {
              method: 'POST',
              headers: authHeaders(token),
              body: JSON.stringify({
                title: todo.title,
                description: todo.memo || null,
                due_date: todo.createdAt,
              }),
            })
          } catch {
            // skip failed migrations and continue
          }
        }

        // 2. Replace local state with backend data
        await get().fetchFromBackend()
      },

      clearStore: () => {
        set({ todos: [], deletedTodos: [], _token: null })
      },
    }),
    {
      name: 'five-todo-store',
      version: 3,
      partialize: (state) => ({
        todos: state.todos,
        deletedTodos: state.deletedTodos,
        // _token is intentionally excluded — restored via MobileLayout on mount
      }),
    },
  ),
)
