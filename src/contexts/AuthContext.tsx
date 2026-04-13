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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [systemRole, setSystemRole] = useState<SystemRole | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
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

  // 初始化：从 SDK 获取 session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      if (currentSession?.user) {
        fetchProfile(currentSession.user.id)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)
        if (newSession?.user) {
          fetchProfile(newSession.user.id)
        } else {
          setProfile(null)
          setSystemRole(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      })
      if (error) return { error: error.message }
      return { error: null }
    } catch (err) {
      console.error('[Auth] signUp exception:', err)
      return { error: '注册请求异常' }
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }
      return { error: null }
    } catch (err) {
      console.error('[Auth] signIn exception:', err)
      return { error: '登录请求异常' }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) return { error: error.message }
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
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return { error: error.message }
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
