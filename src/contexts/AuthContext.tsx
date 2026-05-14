import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/api/supabase'
import type { Profile, SystemRole, RolePermissions } from '@/types'
import { Modal, Button } from 'antd'

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

// 空闲超时配置（大厂标准）
const IDLE_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000  // 2 天无操作
const WARNING_BEFORE_MS = 30 * 60 * 1000          // 过期前 30 分钟提醒
const CHECK_INTERVAL_MS = 60 * 1000                // 每 60 秒检查一次

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
  const lastActivityRef = useRef<number>(Date.now())
  const warningShownRef = useRef(false)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  // 记录用户活动，重置空闲计时器
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    warningShownRef.current = false
  }, [])

  // 空闲超时检测 & 过期提醒
  useEffect(() => {
    if (!user) return

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    const handleActivity = () => recordActivity()
    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }))

    const timer = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current
      const remaining = IDLE_TIMEOUT_MS - idleTime

      // 已超时 → 自动登出
      if (remaining <= 0) {
        window.removeEventListener('focus', handleActivity)
        Modal.warning({
          title: '会话已过期',
          content: '由于长时间未操作，您已被自动登出。请重新登录。',
          okText: '重新登录',
          onOk: () => {
            window.location.href = '/login'
          },
        })
        supabase.auth.signOut()
        clearInterval(timer)
        return
      }

      // 即将超时 & 未提醒 → 弹窗提醒
      if (remaining <= WARNING_BEFORE_MS && !warningShownRef.current) {
        warningShownRef.current = true
        const minutes = Math.ceil(remaining / 60000)
        let secondsLeft = Math.ceil(remaining / 1000)

        const modal = Modal.warning({
          title: '会话即将过期',
          content: `您已 ${Math.floor(idleTime / 60000)} 分钟未操作，${minutes} 分钟后将自动登出。`,
          okText: '继续操作',
          onOk: () => {
            recordActivity()
            clearInterval(countdownRef.current!)
          },
        })

        // 倒计时自动关闭（到达超时时间时关闭提醒，由上面的超时逻辑处理登出）
        countdownRef.current = setInterval(() => {
          secondsLeft = Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - (Date.now() - lastActivityRef.current)) / 1000))
          if (secondsLeft <= 0) {
            clearInterval(countdownRef.current!)
            modal.destroy()
          }
        }, 1000)
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      clearInterval(timer)
      clearInterval(countdownRef.current!)
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleActivity))
    }
  }, [user, recordActivity])

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*, system_role:roles(*)')
        .eq('id', userId)
        .single()
      if (data) {
        // 检查是否被禁用（覆盖：重新打开窗口 / 刷新页面 / token 自动续期）
        if (data.disabled_at) {
          supabase.auth.signOut()
          return null
        }
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

  // Realtime + 轮询兜底：监听 profile 变更（被禁用时即时踢出）
  const kickedRef = useRef(false)
  const doKick = useCallback((reason?: string | null) => {
    if (kickedRef.current) return
    kickedRef.current = true
    Modal.warning({
      title: '账号已被禁用',
      content: reason ? `原因：${reason}` : '您的账号已被管理员禁用，如有疑问请联系管理员。',
      okText: '重新登录',
      onOk: () => { window.location.href = '/login' },
    })
    supabase.auth.signOut()
  }, [])

  useEffect(() => {
    if (!user) { kickedRef.current = false; return }
    kickedRef.current = false
    // Realtime 实时推送（主）
    const channel = supabase
      .channel('profile-disable-check')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          const newDisabled = payload.new as { disabled_at?: string | null; disabled_reason?: string | null } | null
          if (newDisabled?.disabled_at) {
            supabase.removeChannel(channel)
            doKick(newDisabled.disabled_reason)
          }
        }
      )
      .subscribe()
    // 轮询兜底（WebSocket 断连时保底，60 秒一次）
    const timer = setInterval(async () => {
      if (kickedRef.current) return
      const { data } = await supabase
        .from('profiles')
        .select('disabled_at, disabled_reason')
        .eq('id', user.id)
        .single()
      if (data?.disabled_at) {
        clearInterval(timer)
        supabase.removeChannel(channel)
        doKick(data.disabled_reason)
      }
    }, 60_000)
    return () => { clearInterval(timer); supabase.removeChannel(channel) }
  }, [user, doKick])

  // 初始化：从 SDK 获取 session
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id)
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
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }
      // 登录成功后检查是否被禁用
      if (authData.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('disabled_at, disabled_reason')
          .eq('id', authData.user.id)
          .single()
        if (profileData?.disabled_at) {
          await supabase.auth.signOut()
          return { error: profileData.disabled_reason ? `账号已被禁用：${profileData.disabled_reason}` : '账号已被禁用，请联系管理员' }
        }
      }
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
