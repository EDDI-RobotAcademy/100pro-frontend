import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export type User = {
  id: number
  name: string
  email: string
  provider: 'email' | 'kakao'
}

type AuthState = {
  isAuthenticated: boolean
  provider: 'email' | 'kakao' | null
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<{ ok: boolean; reason?: string }>
  loginWithToken: (token: string, user: User, provider: 'email' | 'kakao') => void
  signup: (userData: { name: string; email: string; password: string }) => Promise<{ ok: boolean; reason?: string }>
  linkAccount: (tempToken: string, password: string) => Promise<{ ok: boolean; reason?: string }>
  logout: () => void
  deleteAccount: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      provider: null,
      user: null,
      token: null,

      login: async (email, password) => {
        try {
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          if (!res.ok) {
            const data = await res.json()
            return { ok: false, reason: data.detail ?? '이메일 또는 비밀번호가 일치하지 않습니다.' }
          }
          const data = await res.json()
          set({ isAuthenticated: true, provider: 'email', user: data.user, token: data.access_token })

          import('../5todolist/todoStore').then(({ useTodoStore }) => {
            useTodoStore.getState().setToken(data.access_token)
            useTodoStore.getState().migrateAndFetch()
          })

          return { ok: true }
        } catch {
          return { ok: false, reason: '서버에 연결할 수 없습니다.' }
        }
      },

      loginWithToken: (token, user, provider) => {
        set({ isAuthenticated: true, provider, user, token })
        import('../5todolist/todoStore').then(({ useTodoStore }) => {
          useTodoStore.getState().setToken(token)
          useTodoStore.getState().migrateAndFetch()
        })
      },

      signup: async (userData) => {
        try {
          const res = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
          })
          if (!res.ok) {
            const data = await res.json()
            return { ok: false, reason: data.detail ?? '회원가입에 실패했습니다.' }
          }
          return { ok: true }
        } catch {
          return { ok: false, reason: '서버에 연결할 수 없습니다.' }
        }
      },

      linkAccount: async (tempToken, password) => {
        try {
          const res = await fetch(`${API_BASE}/auth/link-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ temp_token: tempToken, password }),
          })
          if (!res.ok) {
            const data = await res.json()
            return { ok: false, reason: data.detail ?? '비밀번호 검증에 실패했습니다.' }
          }
          const data = await res.json()
          set({ isAuthenticated: true, provider: 'kakao', user: data.user, token: data.access_token })

          import('../5todolist/todoStore').then(({ useTodoStore }) => {
            useTodoStore.getState().setToken(data.access_token)
            useTodoStore.getState().migrateAndFetch()
          })

          return { ok: true }
        } catch {
          return { ok: false, reason: '서버에 연결할 수 없습니다.' }
        }
      },

      logout: () => {
        set({ isAuthenticated: false, provider: null, user: null, token: null })
        import('../5todolist/todoStore').then(({ useTodoStore }) => {
          useTodoStore.getState().clearStore()
        })
      },

      deleteAccount: () => {
        const { token } = get()
        // Clear local state immediately
        set({ isAuthenticated: false, provider: null, user: null, token: null })
        // Fire-and-forget: delete from backend
        if (token) {
          fetch(`${API_BASE}/auth/withdraw`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => { })
        }
        import('../5todolist/todoStore').then(({ useTodoStore }) => {
          useTodoStore.getState().clearStore()
        })
      },
    }),
    { name: 'five-auth-store' },
  ),
)
