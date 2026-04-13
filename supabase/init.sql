-- ============================================
-- LangManager 多语言管理系统 - 数据库初始化脚本 v3
-- ============================================
-- ⚠️ 此脚本会删除所有旧表并重新创建，已有数据将丢失！
-- ⚠️ 建议在全新 Supabase 项目中执行
-- ============================================

-- 启用密码加密扩展（用于创建默认管理员）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 0. 清理所有旧数据
-- ============================================
-- 删除触发器（忽略不存在的表）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DO $$ BEGIN
  DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DROP TRIGGER IF EXISTS roles_updated_at ON public.roles;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DROP TRIGGER IF EXISTS tk_updated_at ON public.translation_keys;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN
  DROP TRIGGER IF EXISTS translations_updated_at ON public.translations;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 删除视图（忽略错误）
DO $$ BEGIN
  DROP VIEW IF EXISTS public.project_member_roles;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 删除函数
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.update_updated_at();
DROP FUNCTION IF EXISTS public.is_first_user();
DROP FUNCTION IF EXISTS public.is_project_member(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_project_admin(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_project_editor(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_project_translator(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_project_creator(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_super_admin(UUID);
DROP FUNCTION IF EXISTS public.has_system_permission(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_project_role(UUID, UUID);
DROP FUNCTION IF EXISTS public.create_user(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.reset_user_password(UUID, TEXT);

-- 删除表（按依赖关系倒序）
DROP TABLE IF EXISTS public.translations CASCADE;
DROP TABLE IF EXISTS public.translation_keys CASCADE;
DROP TABLE IF EXISTS public.locales CASCADE;
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;

-- ============================================
-- 1. 创建 roles 表（动态角色与权限）
-- ============================================
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 权限结构说明:
-- {
--   "manage_users": boolean,      -- 管理系统用户
--   "manage_roles": boolean,      -- 管理角色和权限
--   "project": {
--     "create": boolean,          -- 创建项目
--     "delete_any": boolean       -- 删除任意项目
--   },
--   "member": {
--     "invite": boolean,          -- 邀请成员
--     "remove": boolean,          -- 移除成员
--     "change_role": boolean      -- 修改成员角色
--   }
-- }

-- 插入默认系统角色
INSERT INTO public.roles (name, display_name, description, permissions, is_system) VALUES
  ('super_admin', '超级管理员', '拥有系统所有权限', '{
    "manage_users": true,
    "manage_roles": true,
    "project": {"create": true, "delete_any": true},
    "member": {"invite": true, "remove": true, "change_role": true}
  }'::jsonb, true),

  ('sys_admin', '系统管理员', '全局管理权限，可管理用户和项目', '{
    "manage_users": true,
    "manage_roles": false,
    "project": {"create": true, "delete_any": true},
    "member": {"invite": true, "remove": true, "change_role": true}
  }'::jsonb, true),

  ('operator', '运营人员', '可管理项目成员，但不能管理系统用户和角色', '{
    "manage_users": false,
    "manage_roles": false,
    "project": {"create": true, "delete_any": false},
    "member": {"invite": true, "remove": true, "change_role": true}
  }'::jsonb, true),

  ('user', '普通用户', '基础权限，可创建项目并查看项目内容', '{
    "manage_users": false,
    "manage_roles": false,
    "project": {"create": true, "delete_any": false},
    "member": {"invite": false, "remove": false, "change_role": false}
  }'::jsonb, true);

-- ============================================
-- 2. 创建 profiles 表
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  role_id UUID NOT NULL REFERENCES public.roles(id),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 3. 创建 projects 表
-- ============================================
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. 创建 project_members 表
-- ============================================
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'developer', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- ============================================
-- 5. 创建 locales 表
-- ============================================
CREATE TABLE public.locales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);

-- ============================================
-- 6. 创建 translation_keys 表
-- ============================================
CREATE TABLE public.translation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 7. 创建 translations 表
-- ============================================
CREATE TABLE public.translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES public.translation_keys(id) ON DELETE CASCADE,
  locale_id UUID NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  value TEXT NOT NULL DEFAULT '',
  updated_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(key_id, locale_id)
);

-- ============================================
-- 8. 创建视图：项目成员角色
-- ============================================
CREATE OR REPLACE VIEW public.project_member_roles AS
SELECT pm.project_id, pm.user_id, pm.role
FROM public.project_members pm;

-- ============================================
-- 9. SECURITY DEFINER 辅助函数（解决 RLS 递归问题）
-- ============================================

-- 检查用户是否为超级管理员
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id AND r.name = 'super_admin'
  );
$$;

-- 检查用户是否拥有系统级权限
CREATE OR REPLACE FUNCTION public.has_system_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id AND (r.permissions->>p_permission)::boolean = true
  );
$$;

-- 检查用户是否为项目成员（包含 super_admin）
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
  ) OR public.is_super_admin(p_user_id);
$$;

-- 检查用户是否为项目管理员（admin + super_admin）
CREATE OR REPLACE FUNCTION public.is_project_admin(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id AND role = 'admin'
  ) OR public.is_super_admin(p_user_id);
$$;

-- 检查用户是否可编辑 key（admin/developer + super_admin）
CREATE OR REPLACE FUNCTION public.is_project_editor(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id AND role IN ('admin', 'developer')
  ) OR public.is_super_admin(p_user_id);
$$;

-- 检查用户是否可编辑翻译值（admin/editor + super_admin）
CREATE OR REPLACE FUNCTION public.is_project_translator(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id AND role IN ('admin', 'editor')
  ) OR public.is_super_admin(p_user_id);
$$;

-- 检查用户是否为项目创建者
CREATE OR REPLACE FUNCTION public.is_project_creator(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND created_by = p_user_id
  );
$$;

-- 获取用户的项目角色
CREATE OR REPLACE FUNCTION public.get_project_role(p_project_id UUID, p_user_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT pm.role FROM public.project_members pm
  WHERE pm.project_id = p_project_id AND pm.user_id = p_user_id
  LIMIT 1;
$$;

-- ============================================
-- 10. 新用户注册触发器（必须在插入管理员之前创建！）
--     第一个用户自动成为 super_admin，后续为 user
--     SECURITY DEFINER 绕过 RLS
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role_id UUID;
  v_has_super_admin BOOLEAN;
BEGIN
  -- 如果 profile 已存在，跳过（防止与 create_user RPC 冲突）
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id WHERE r.name = 'super_admin'
  ) INTO v_has_super_admin;

  IF NOT v_has_super_admin THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'super_admin' LIMIT 1;
  ELSE
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'user' LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, display_name, email, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(v_role_id, (SELECT id FROM public.roles WHERE name = 'user' LIMIT 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 11. 创建默认超级管理员账号
--     邮箱: admin@example.com  密码: admin123
--     ⚠️ 生产环境请务必修改密码！
--     触发器会自动创建 profile 并分配 super_admin 角色
-- ============================================
DO $$
DECLARE
  v_instance_id UUID;
BEGIN
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000'::UUID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@example.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, invited_at
    ) VALUES (
      v_instance_id,
      gen_random_uuid(), 'authenticated', 'authenticated',
      'admin@example.com',
      crypt('admin123', gen_salt('bf')),
      now(), '{"display_name":"Admin"}'::jsonb,
      now(), now(), '', '', '', '', null
    );
    -- profile 由 handle_new_user 触发器自动创建
  END IF;
END $$;

-- ============================================
-- 12. 启用 RLS
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 13. RLS 策略
-- ============================================

-- --- roles ---
CREATE POLICY "roles_select_all" ON public.roles
  FOR SELECT USING (true);

CREATE POLICY "roles_super_admin_manage" ON public.roles
  FOR ALL USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- --- profiles ---
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_admin_role" ON public.profiles
  FOR UPDATE USING (
    public.has_system_permission(auth.uid(), 'manage_users') AND auth.uid() != id
  )
  WITH CHECK (
    public.has_system_permission(auth.uid(), 'manage_users') AND auth.uid() != id
    -- 非超级管理员不能将别人设为超级管理员
    AND (
      public.is_super_admin(auth.uid())
      OR role_id NOT IN (SELECT id FROM public.roles WHERE name = 'super_admin')
    )
  );

-- --- projects ---
CREATE POLICY "projects_select_member" ON public.projects
  FOR SELECT USING (
    public.is_project_member(projects.id, auth.uid())
    OR created_by = auth.uid()
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "projects_update_admin" ON public.projects
  FOR UPDATE USING (
    public.is_project_admin(projects.id, auth.uid())
  );

CREATE POLICY "projects_delete_admin" ON public.projects
  FOR DELETE USING (
    public.is_project_admin(projects.id, auth.uid())
  );

-- --- project_members ---
CREATE POLICY "pm_select_member" ON public.project_members
  FOR SELECT USING (
    public.is_project_member(project_members.project_id, auth.uid())
  );

CREATE POLICY "pm_insert_admin" ON public.project_members
  FOR INSERT WITH CHECK (
    public.is_project_admin(project_members.project_id, auth.uid())
    OR public.is_project_creator(project_members.project_id, auth.uid())
  );

CREATE POLICY "pm_update_admin" ON public.project_members
  FOR UPDATE USING (
    public.is_project_admin(project_members.project_id, auth.uid())
  );

CREATE POLICY "pm_delete_admin" ON public.project_members
  FOR DELETE USING (
    public.is_project_admin(project_members.project_id, auth.uid())
  );

-- --- locales ---
CREATE POLICY "locales_select_member" ON public.locales
  FOR SELECT USING (
    public.is_project_member(locales.project_id, auth.uid())
  );

CREATE POLICY "locales_insert_admin" ON public.locales
  FOR INSERT WITH CHECK (
    public.is_project_admin(locales.project_id, auth.uid())
  );

CREATE POLICY "locales_update_admin" ON public.locales
  FOR UPDATE USING (
    public.is_project_admin(locales.project_id, auth.uid())
  );

CREATE POLICY "locales_delete_admin" ON public.locales
  FOR DELETE USING (
    public.is_project_admin(locales.project_id, auth.uid())
  );

-- --- translation_keys ---
CREATE POLICY "tk_select_member" ON public.translation_keys
  FOR SELECT USING (
    public.is_project_member(translation_keys.project_id, auth.uid())
  );

CREATE POLICY "tk_insert_editor" ON public.translation_keys
  FOR INSERT WITH CHECK (
    public.is_project_editor(translation_keys.project_id, auth.uid())
  );

CREATE POLICY "tk_update_editor" ON public.translation_keys
  FOR UPDATE USING (
    public.is_project_editor(translation_keys.project_id, auth.uid())
  );

CREATE POLICY "tk_delete_admin" ON public.translation_keys
  FOR DELETE USING (
    public.is_project_admin(translation_keys.project_id, auth.uid())
  );

-- --- translations ---
CREATE POLICY "translations_select_member" ON public.translations
  FOR SELECT USING (
    public.is_project_member(
      (SELECT project_id FROM public.translation_keys WHERE id = translations.key_id),
      auth.uid()
    )
  );

CREATE POLICY "translations_insert_editor" ON public.translations
  FOR INSERT WITH CHECK (
    public.is_project_translator(
      (SELECT project_id FROM public.translation_keys WHERE id = translations.key_id),
      auth.uid()
    )
  );

CREATE POLICY "translations_update_editor" ON public.translations
  FOR UPDATE USING (
    public.is_project_translator(
      (SELECT project_id FROM public.translation_keys WHERE id = translations.key_id),
      auth.uid()
    )
  );

-- ============================================
-- 14. 自动更新 updated_at 触发器
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 防止用户修改自己的 role_id（super_admin 除外）
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role_id IS DISTINCT FROM OLD.role_id AND NEW.id = auth.uid() THEN
    IF NOT public.is_super_admin(auth.uid()) THEN
      NEW.role_id = OLD.role_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_guard ON public.profiles;
CREATE TRIGGER profiles_role_guard BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();

DROP TRIGGER IF EXISTS roles_updated_at ON public.roles;
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS tk_updated_at ON public.translation_keys;
CREATE TRIGGER tk_updated_at BEFORE UPDATE ON public.translation_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS translations_updated_at ON public.translations;
CREATE TRIGGER translations_updated_at BEFORE UPDATE ON public.translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 15. 管理员创建用户 RPC
--     超级管理员可直接创建用户（无需邮箱验证）
-- ============================================
CREATE OR REPLACE FUNCTION public.create_user(
  p_email TEXT,
  p_password TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_role_name TEXT DEFAULT 'user'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
  v_instance_id UUID;
BEGIN
  -- 验证调用者权限：必须是超级管理员
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', '权限不足，仅超级管理员可创建用户');
  END IF;

  -- 检查邮箱是否已存在
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RETURN jsonb_build_object('error', '该邮箱已被注册');
  END IF;

  -- 获取角色 ID
  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name LIMIT 1;
  IF v_role_id IS NULL THEN
    v_role_id := (SELECT id FROM public.roles WHERE name = 'user' LIMIT 1);
  END IF;

  -- 获取 Supabase instance_id
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000'::UUID;
  END IF;

  -- 插入 auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, invited_at
  ) VALUES (
    v_instance_id,
    gen_random_uuid(), 'authenticated', 'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    COALESCE(jsonb_build_object('display_name', p_display_name), '{}'::jsonb),
    now(), now(), '', '', '', '', null
  )
  RETURNING id INTO v_user_id;

  -- 手动创建 profile（指定角色），ON CONFLICT 防止与触发器冲突
  INSERT INTO public.profiles (id, display_name, email, role_id)
  VALUES (
    v_user_id,
    COALESCE(p_display_name, split_part(p_email, '@', 1)),
    p_email,
    v_role_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'email', p_email,
    'display_name', COALESCE(p_display_name, split_part(p_email, '@', 1))
  );
END;
$$;

-- ============================================
-- 16. 管理员重置用户密码 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.reset_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION '权限不足，仅超级管理员可重置密码';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$;

-- ============================================
-- 完成！
-- ============================================
