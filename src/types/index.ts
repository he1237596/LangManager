export type ProjectRole = 'admin' | 'developer' | 'editor' | 'viewer'

export interface SystemRole {
  id: string
  name: string
  display_name: string
  description: string | null
  permissions: RolePermissions
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface RolePermissions {
  manage_users: boolean
  manage_roles: boolean
  project: { create: boolean; delete_any: boolean }
  member: { invite: boolean; remove: boolean; change_role: boolean }
  locale: { create: boolean; edit: boolean; delete: boolean }
  key: { create: boolean; edit: boolean; delete: boolean }
  translation: { edit: boolean }
}

export interface Profile {
  id: string
  display_name: string | null
  email: string | null
  role_id: string
  avatar_url: string | null
  created_at: string
  updated_at: string
  // joined via select('*, system_role:roles(*)')
  system_role?: SystemRole
}

export interface Project {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
  member_role?: ProjectRole
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: ProjectRole
  created_at: string
  profile?: Profile
}

export interface Locale {
  id: string
  project_id: string
  code: string
  name: string
  is_default: boolean
  created_at: string
}

export interface TranslationKey {
  id: string
  project_id: string
  key: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Translation {
  id: string
  key_id: string
  locale_id: string
  value: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface TranslationRow {
  keyId: string
  key: string
  description: string | null
  created_at: string
  updated_at: string
  translations: Record<string, { id: string; value: string; localeId: string }>
}

// 项目级别角色
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  admin: '管理员',
  developer: '开发者',
  editor: '编辑者',
  viewer: '查看者',
}

export const PROJECT_ROLE_COLORS: Record<ProjectRole, string> = {
  admin: 'red',
  developer: 'purple',
  editor: 'blue',
  viewer: 'default',
}

// 默认权限模板
export const DEFAULT_PERMISSIONS: RolePermissions = {
  manage_users: false,
  manage_roles: false,
  project: { create: true, delete_any: false },
  member: { invite: false, remove: false, change_role: false },
  locale: { create: false, edit: false, delete: false },
  key: { create: false, edit: false, delete: false },
  translation: { edit: false },
}

// 权限显示名称映射
export const PERMISSION_LABELS: Record<string, Record<string, string>> = {
  manage_users: { _label: '管理系统用户' },
  manage_roles: { _label: '管理角色和权限' },
  project: { create: '创建项目', delete_any: '删除任意项目' },
  member: { invite: '邀请成员', remove: '移除成员', change_role: '修改成员角色' },
}
