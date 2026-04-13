# 一分钱没花！我用 React + Supabase 搭了一个多语言翻译管理系统，全免费部署

## 前言

你有没有经历过这种场景：

产品经理在微信群里发了一个 Excel：「这是 v2.0 的多语言翻译，开发同学合并一下」。

你打开一看，里面有中文、英文、日文三个 sheet，几百条数据，翻译人员用中文描述当 Key，英文和日文列有一半是空的，还有几个合并单元格导致的错位……你花了两个小时整理好 JSON，提交上线，结果第二天产品经理说：「不好意思，翻译那边又改了几个词，你再看一下。」

再比如，团队里有几个海外翻译人员，他们不会用 Git，每次都是通过邮件传来传去，版本一多，谁都分不清哪个是最新的。

再比如，Crowdin、Phrase 这些平台功能很强，但价格也不便宜 —— Crowdin 最便宜的方案也要 $50/月，对个人开发者和小团队来说并不友好。

于是我决定自己做一个。

**核心诉求**：免费、好用、翻译人员也能用、导出格式兼容 i18n 库。

最终方案：**React + Supabase + Cloudflare Pages**，一分钱没花，部署完成。

![登录页](docs/login-page.png)

**GitHub**：https://github.com/he1237596/LangManager

---

## 为什么不用现成的？

先看对比：

| | Crowdin | Phrase | Lokalise | **LangManager** |
|---|---|---|---|---|
| 价格 | $50/月起 | 免费/付费 | $120/月起 | **完全免费** |
| 私有化部署 | 需要额外付费 | 需要额外付费 | 需要额外付费 | **一键部署** |
| 数据存储 | 第三方服务器 | 第三方服务器 | 第三方服务器 | **自己的 Supabase 实例** |
| 翻译人员上手难度 | 中等 | 中等 | 中等 | **极低（网页操作）** |
| 自定义 | 有限 | 有限 | 有限 | **代码完全开放** |

LangManager 的定位不是替代这些平台，而是提供一个 **轻量、免费、可私有化** 的替代方案，适合个人开发者和小团队。

---

## 技术选型

| 技术 | 用途 | 选择理由 |
|------|------|---------|
| React 18 + TypeScript | 前端框架 | 团队熟悉，生态成熟 |
| Ant Design 5 | UI 组件库 | 表格、表单、弹窗开箱即用 |
| Vite 6 | 构建工具 | 极快的 HMR |
| Supabase | 数据库 + 认证 + 权限 | **核心**：零后端成本 |
| @dnd-kit | 拖拽排序 | 轻量高性能 |
| Cloudflare Pages | 部署 | 全球 CDN，免费 |

### 为什么选 Supabase？

很多人对「前端直连数据库」有顾虑，觉得不安全。其实 Supabase 提供了 **RLS（Row Level Security）**，所有权限在数据库层面控制，前端绕不过去。

```typescript
// 前端查询 —— 看起来像直接查数据库
const { data } = await supabase
  .from('translation_keys')
  .select('*')
  .eq('project_id', projectId)

// 但实际上 Supabase 会自动加上 RLS 过滤
// 如果当前用户不是项目成员，返回空结果
```

对应的后端 RLS 策略：

```sql
CREATE POLICY "tk_select_member" ON public.translation_keys
  FOR SELECT USING (
    public.is_project_member(translation_keys.project_id, auth.uid())
  );
```

**安全性 = 数据库层面保证，不依赖前端代码**。

---

## 功能展示

![项目列表](docs/project-list.png)

### 1. 多语言对照编辑

这是核心页面。左侧是 Key 列，右侧是各语言列，一行搞定所有翻译：

![翻译编辑页面](docs/translation-edit.png)

功能细节：

- **点击单元格** 直接编辑翻译值，弹窗输入
- **行编辑模式**：一次修改描述 + 所有语言翻译，批量保存
- **空翻译高亮**：未填写的单元格用虚线框标记，一目了然
- **搜索 + 筛选**：按 Key 搜索、按翻译内容搜索、筛选未填 Key 的记录
- **序号列**：跨页连续编号，方便和翻译人员沟通

### 2. 语言拖拽排序

在项目设置中管理语言列表，支持拖拽排序：

![项目设置 - 语言管理](docs/project-settings.png)

排序结果会持久化到数据库，翻译编辑页面的列顺序自动同步。使用 `@dnd-kit` 实现，拖动时有浮动预览卡片 + 实时让位效果。

### 3. 翻译导出

两种导出方式：

- **单语言导出**：点击语言列头部的下拉菜单 → 导出 JSON
- **全部导出**：一键打包 ZIP，包含所有语言的 JSON 文件

导出格式兼容 `vue-i18n`、`react-i18next` 等 i18n 库：

```json
{
  "home.title": "首页",
  "home.subtitle": "欢迎使用 LangManager",
  "nav.dashboard": "控制台"
}
```

> Key 为空的记录导出时自动跳过，保证导出文件干净。

### 4. 双层权限体系

![系统设置 - 用户与角色管理](docs/system-settings.png)

这是我觉得设计得比较用心的地方。

**系统角色**（超级管理员分配，控制全局权限）：

| 角色 | 说明 |
|------|------|
| 超级管理员 | 拥有一切权限 |
| 系统管理员 | 可管理用户和项目 |
| 运营人员 | 可管理项目，不能管理用户 |
| 普通用户 | 基础权限，可创建项目 |

**项目角色**（项目管理员分配，控制项目内权限）：

| 权限 | 管理员 | 开发者 | 编辑 | 查看者 |
|------|:---:|:---:|:---:|:---:|
| 查看翻译 | ✅ | ✅ | ✅ | ✅ |
| 编辑翻译值 | ✅ | ✅ | ✅ | ❌ |
| 编辑 Key | ✅ | ✅ | ❌ | ❌ |
| 添加/删除 Key | ✅ | ❌ | ❌ | ❌ |
| 管理语言 | ✅ | ❌ | ❌ | ❌ |
| 管理成员 | ✅ | ❌ | ❌ | ❌ |

权限用 JSONB 存储在数据库里，灵活可扩展：

```sql
INSERT INTO public.roles (name, display_name, permissions) VALUES
  ('operator', '运营人员', '{
    "manage_users": false,
    "manage_roles": false,
    "project": {"create": true, "delete_any": false},
    "member": {"invite": true, "remove": true, "change_role": true}
  }'::jsonb);
```

前端通过递归取值判断权限：

```typescript
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
```

典型场景：开发负责添加 Key，翻译只管填翻译值，产品只能看效果。各司其职。

---

## 数据库设计

```
roles                 -- 系统角色（JSONB 动态权限）
profiles              -- 用户资料（关联 auth.users）
projects              -- 项目
project_members       -- 项目成员（项目 + 用户 + 项目角色）
locales               -- 项目的语言列表（含排序字段）
translation_keys      -- 翻译键
translations          -- 翻译值（key + locale）
```

所有表都启用了 RLS，每个操作都有对应的策略。比如翻译的编辑权限：

```sql
-- 只有项目翻译级别成员才能编辑翻译值
CREATE POLICY "translations_update_editor" ON public.translations
  FOR UPDATE USING (
    public.is_project_translator(
      (SELECT project_id FROM public.translation_keys WHERE id = translations.key_id),
      auth.uid()
    )
  );
```

权限判断函数也用 SQL 实现：

```sql
CREATE OR REPLACE FUNCTION public.is_project_translator(project_id UUID, user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members pm
    JOIN public.roles r ON pm.role = r.name
    WHERE pm.project_id = is_project_translator.project_id
      AND pm.user_id = is_project_translator.user_id
      AND pm.role IN ('admin', 'developer', 'editor')
  );
END;
$$;
```

---

## 几个有意思的技术细节

### 1. 部分唯一索引

翻译 Key 可以为空 —— 翻译人员先填翻译内容，开发后补 Key 名。但非空 Key 在同一项目内不能重复。

PostgreSQL 的 `UNIQUE` 约束会把空字符串也当作唯一值，所以用 **部分唯一索引** 解决：

```sql
CREATE UNIQUE INDEX translation_keys_project_id_key_unique
  ON public.translation_keys(project_id, key)
  WHERE key != '';
```

这样空字符串可以有多条，但非空 Key 保证唯一。

### 2. 拖拽排序的实现

语言列表的拖拽排序需要三个要素：拖拽容器、排序策略、浮动预览。

```tsx
// 拖拽传感器配置（避免误触）
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(KeyboardSensor),
)

// 拖拽结束时更新数据库
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const newLocales = arrayMove(locales, oldIndex, newIndex)
  setLocales(newLocales)
  // 批量更新排序值
  await Promise.all(
    newLocales.map((l, i) =>
      supabase.from('locales').update({ sort_order: i }).eq('id', l.id)
    )
  )
}
```

翻译编辑页面的 locales 查询按 `sort_order` 排序，保证列顺序一致。

### 3. Supabase 客户端单例

```typescript
const supabase = createClient(url, anonKey, {
  auth: {
    storageKey: `sb-${projectRef}-auth-token`,
    autoRefreshToken: true,
  },
})
```

整个应用共享一个 Supabase 实例，登录状态通过 `AuthContext` 注入到所有组件。

---

## 5 分钟部署

不需要服务器，不需要域名，不需要 Docker。

### Step 1：创建 Supabase 项目

前往 [supabase.com](https://supabase.com) 免费注册，创建一个项目。

### Step 2：初始化数据库

在 **SQL Editor** 中执行 `supabase/init.sql`，一条命令搞定所有表、函数、RLS 策略、默认角色和默认管理员账号。

### Step 3：克隆 & 启动

```bash
git clone https://github.com/he1237596/LangManager.git
cd LangManager
cp .env.example .env
# 编辑 .env 填入 Supabase URL 和 Anon Key
npm install
npm run dev
```

打开浏览器访问 `http://localhost:5173`，用默认管理员登录（`admin@example.com` / `admin123`）。

### Step 4：部署到 Cloudflare Pages（可选）

推送代码到 GitHub → Cloudflare Pages 连接仓库 → 设置环境变量 → 自动部署。

**全程免费**：Supabase 免费版（500MB 数据库）+ Cloudflare Pages 免费版（无限请求）。

---

## 项目结构

```
src/
├── api/supabase.ts            # Supabase 客户端（单例模式）
├── components/
│   ├── Layout/                # 主布局（侧边栏 + 顶栏）
│   └── ProtectedRoute.tsx     # 路由鉴权守卫
├── contexts/AuthContext.tsx    # 认证上下文（登录态 + 权限判断）
├── pages/
│   ├── LoginPage.tsx          # 登录
│   ├── RegisterPage.tsx       # 注册
│   ├── ForgotPasswordPage.tsx # 忘记密码
│   ├── ResetPasswordPage.tsx  # 重置密码
│   ├── ProjectListPage.tsx    # 项目列表
│   ├── ProjectDetailPage.tsx  # 翻译编辑（核心页面，600+ 行）
│   ├── ProjectSettingsPage.tsx # 项目设置（语言/成员）
│   └── SystemSettingsPage.tsx # 系统管理（用户/角色）
└── types/index.ts             # TypeScript 类型定义
supabase/
└── init.sql                   # 数据库初始化（500+ 行）
```

整个前端代码不到 2000 行，数据库脚本不到 600 行。**小而完整**。

---

## 适合谁用？

- 前端项目需要 i18n，但不想为翻译管理付费
- 翻译人员不懂技术，需要一个简单的在线工具
- 需要私有化部署，数据不想放第三方平台
- 想学习 Supabase RLS + React 的实战项目

---

## 可扩展性

因为代码完全开源，你可以按需扩展：

- **接入 AI 翻译**：翻译值旁边加一个「AI 翻译」按钮，调用 DeepL / OpenAI / 百度翻译 API，一键填充翻译值
- **接入专业翻译插件**：对接 Crowdin / Google Translation Hub 等第三方翻译服务
- **导入翻译文件**：解析 JSON/YAML/PO 等格式批量导入
- **Webhook 通知**：翻译完成后自动触发 CI/CD 重新构建
- **版本对比**：记录每次翻译修改，支持 diff 对比和回滚

核心架构是前端 + Supabase，扩展时只需在对应组件中增加功能即可，不需要改后端。

---

## 写在最后

这个项目从一个周末的 side project 演变成了一个功能完整的翻译管理系统。回顾整个开发过程，最大的感受是：**Supabase + Cloudflare Pages 这种 Serverless 组合，真的能让前端开发者独立完成全栈应用**。

不需要学 Node.js、不需要写 API、不需要管服务器运维、不需要买域名和证书。把精力集中在业务逻辑和用户体验上就够了。

如果你也在为多语言翻译管理头疼，或者对 Supabase 感兴趣想看看实战项目，欢迎 clone 下来玩一玩。

**GitHub**：https://github.com/he1237596/LangManager

---

> 觉得有帮助的话，欢迎 **Star** ⭐，也欢迎提 Issue 和 PR。如果有什么想法或建议，评论区见。
