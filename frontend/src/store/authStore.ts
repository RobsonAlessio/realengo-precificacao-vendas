import { create } from 'zustand'
import { User } from '../types'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
}

const stored = localStorage.getItem('auth')
const initial = stored ? JSON.parse(stored) : { token: null, user: null }

export const useAuthStore = create<AuthState>((set) => ({
  token: initial.token,
  user: initial.user,
  setAuth: (token, user) => {
    localStorage.setItem('auth', JSON.stringify({ token, user }))
    set({ token, user })
  },
  logout: () => {
    localStorage.removeItem('auth')
    set({ token: null, user: null })
  },
}))
