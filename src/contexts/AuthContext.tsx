import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/api/supabase'
import type { Profile, SystemRole, RolePermissions } from '@/types'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  systemRole: SystemRole | null
  session: Session | null
  loading: boolean
  isSuperAdmin: boolean
  hasPermission: (path: string) => boolean
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  changePassword: (newPassword: string) => Promise<{ error: string | null }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function getStorageKey(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
  const urlMatch = supabaseUrl.match(/\/\/([^.]+)\./)
  return urlMatch ? `sb-${urlMatch[1]}-auth-token` : 'sb-auth-token'
}

function getAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || ''
}

function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL || ''
}

// 深层取值
function getNestedValue(obj: unknown, path: string): boolean {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return false
    }
  }
  return current === true
}

// 从 localStorage 读取 session（同步，不会挂起）
function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(getStorageKey())
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeSession(session: Session | null) {
  const key = getStorageKey()
  if (session) {
    localStorage.setItem(key, JSON.stringify(session))
  } else {
    localStorage.removeItem(key)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [systemRole, setSystemRole] = useState<SystemRole | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const stored = readStoredSession()
      const token = stored?.access_token
      if (!token) return null

      const { data } = await supabase
        .from('profiles')
        .select('*, system_role:roles(*)')
        .eq('id', userId)
        .single()
      if (data) {
        setProfile(data)
        setSystemRole(data.system_role || null)
      } else {
        setProfile(null)
        setSystemRole(null)
      }
      return data
    } catch (err) {
      console.error('Failed to fetch profile:', err)
      setProfile(null)
      setSystemRole(null)
      return null
    }
  }, [])

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  // 初始化：同步读取 localStorage，避免 getSession() 挂起
  useEffect(() => {
    const stored = readStoredSession()
    if (stored?.user) {
      setSession(stored)
      setUser(stored.user)
      fetchProfile(stored.user.id)
    }
    // 无论是否有 session，都立即结束 loading
    setLoading(false)

    // 仍然监听 auth state change（仅在 Supabase 客户端正常工作时才触发）
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, newSession) => {
          // 仅在其他地方触发了 auth 变化时更新（如 setSession）
          if (event === 'SIGNED_OUT') {
            setSession(null)
            setUser(null)
            setProfile(null)
            setSystemRole(null)
          }
        }
      )
      return () => {
        try { subscription.unsubscribe() } catch {}
      }
    } catch {
      return undefined
    }
  }, [fetchProfile])

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      const res = await fetch(`${getSupabaseUrl()}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getAnonKey(),
        },
        body: JSON.stringify({
          email,
          password,
          data: { display_name: displayName },
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return { error: errData?.error_description || errData?.error || `HTTP ${res.status}` }
      }
      return { error: null }
    } catch (err) {
      console.error('[Auth] signUp exception:', err)
      return { error: '注册请求异常' }
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const res = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getAnonKey(),
        },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return { error: errData?.error_description || errData?.error || `HTTP ${res.status}` }
      }

      const data = await res.json()

      const newSession: Session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
        expires_at: data.expires_at,
        user: data.user,
      }
      writeSession(newSession)
      setSession(newSession)
      setUser(data.user)
      await fetchProfile(data.user.id)

      return { error: null }
    } catch (err) {
      console.error('[Auth] signIn exception:', err)
      return { error: '登录请求异常' }
    }
  }

  const signOut = async () => {
    writeSession(null)
    setSession(null)
    setUser(null)
    setProfile(null)
    setSystemRole(null)
  }

  const resetPassword = async (email: string) => {
    try {
      const res = await fetch(`${getSupabaseUrl()}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getAnonKey(),
        },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return { error: errData?.error_description || errData?.error || `HTTP ${res.status}` }
      }
      return { error: null }
    } catch (err) {
      console.error('[Auth] resetPassword exception:', err)
      return { error: '重置密码请求异常' }
    }
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return
    const { role_id, system_role, ...rest } = updates as Partial<Profile> & { system_role?: SystemRole }
    const { error } = await supabase
      .from('profiles')
      .update(rest)
      .eq('id', user.id)
    if (role_id) {
      await supabase.from('profiles').update({ role_id }).eq('id', user.id)
    }
    if (!error) {
      setProfile((prev) => prev ? { ...prev, ...rest } : null)
      if (role_id) await fetchProfile(user.id)
    }
  }

  const changePassword = async (newPassword: string) => {
    try {
      const res = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getAnonKey(),
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ password: newPassword }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return { error: errData?.error_description || errData?.error || `HTTP ${res.status}` }
      }
      return { error: null }
    } catch (err) {
      console.error('[Auth] changePassword exception:', err)
      return { error: '修改密码请求异常' }
    }
  }

  const isSuperAdmin = systemRole?.name === 'super_admin'

  const hasPermission = (path: string): boolean => {
    if (isSuperAdmin) return true
    if (!systemRole?.permissions) return false
    return getNestedValue(systemRole.permissions as RolePermissions, path)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        systemRole,
        session,
        loading,
        isSuperAdmin,
        hasPermission,
        signUp,
        signIn,
        signOut,
        resetPassword,
        updateProfile,
        changePassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
