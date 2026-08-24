// 在数据库与 auth 就绪后，自动创建默认超级管理员账号。
// GoTrue v2.189 不支持 crypt()/bf 哈希密码，因此必须通过 Admin API 创建
// （密码由 GoTrue 自行用 scrypt 哈希），handle_new_user 触发器会自动生成
// profile 并分配 super_admin 角色。
//
// 账号信息优先读取 .env 的 INIT_ADMIN_EMAIL / INIT_ADMIN_PASSWORD，
// 未配置时使用默认值 admin@example.com / admin123。

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---- 解析 .env（与 generate-keys.mjs 同样的简单解析）----
const envPath = existsSync(join(process.cwd(), '.env'))
  ? join(process.cwd(), '.env')
  : join(__dirname, '..', '.env')
const env = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''
const getEnv = (key, fallback = '') => {
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^${key}=(.*)$`))
    if (m) return m[1].trim()
  }
  return fallback
}

const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const ADMIN_EMAIL = getEnv('INIT_ADMIN_EMAIL', 'admin@example.com')
const ADMIN_PASSWORD = getEnv('INIT_ADMIN_PASSWORD', 'admin123')
// init-admin 运行在 docker 网络内，经 kong 网关访问 auth 的 admin API。
// GoTrue 的 admin 接口挂载在 /auth/v1/admin 下（与 kong 的 /auth/v1/ 前缀一致），
// 直接访问 auth:9999/admin/v1/users 会 404，必须走 kong。
const AUTH_BASE = process.env.AUTH_BASE || 'http://kong:8000/auth/v1'
const ADMIN_API = `${AUTH_BASE}/admin`
const MAX_WAIT_MS = 120_000
const POLL_MS = 2000

if (!SERVICE_ROLE_KEY) {
  console.error('✗ 找不到 SUPABASE_SERVICE_ROLE_KEY，请先运行 generate-keys.mjs 生成')
  process.exit(1)
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

async function waitForAuth() {
  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${AUTH_BASE}/health`)
      if (res.ok) {
        console.log('✓ auth 服务已就绪')
        return true
      }
    } catch {
      // 忽略，继续等待
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  console.error(`✗ 等待 auth 服务超时（${MAX_WAIT_MS / 1000}s）`)
  process.exit(1)
}

async function userExists(email) {
  const res = await fetch(`${ADMIN_API}/users?email=${encodeURIComponent(email)}`, { headers })
  if (!res.ok) return false
  const data = await res.json()
  // GoTrue 返回 { users: [...] }
  return Array.isArray(data?.users) && data.users.length > 0
}

async function createAdmin(email, password) {
  const url = `${ADMIN_API}/users`
  console.error(`[debug] POST ${url}`)
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      role: 'authenticated',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[debug] status=${res.status} body=${text}`)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  console.log(`✓ 已创建管理员账号: ${email}`)
}

async function main() {
  await waitForAuth()

  if (await userExists(ADMIN_EMAIL)) {
    console.log(`• 管理员账号已存在，跳过创建: ${ADMIN_EMAIL}`)
    return
  }

  // 创建失败时重试几次（auth 可能刚就绪但 DB 连接尚不稳定）
  const retries = 5
  for (let i = 1; i <= retries; i++) {
    try {
      await createAdmin(ADMIN_EMAIL, ADMIN_PASSWORD)
      return
    } catch (err) {
      console.error(`✗ 创建失败（第 ${i}/${retries} 次）: ${err.message}`)
      if (i === retries) process.exit(1)
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }
}

main()
