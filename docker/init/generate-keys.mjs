// 根据 JWT_SECRET 生成 supabase anon key / service_role key
// 自托管版没有云端那样的自动分配 key，需要手动生成。
// 这两个 key 只是对 {"role":"anon"/"service_role", ...} 用 JWT_SECRET 签名的 JWT，
// 与云端格式完全一致，前端/函数可直接使用。

import { createHash, createHmac } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sign(claim, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    iss: 'supabase',
    ref: 'local',
    role: claim,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10, // 10年
  }
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const sig = createHmac('sha256', secret).update(data).digest()
  return `${data}.${base64url(sig)}`
}

// 读取 docker/.env，取 JWT_SECRET
import { existsSync } from 'node:fs'
const envPath = existsSync(join(process.cwd(), '.env')) ? join(process.cwd(), '.env') : join(__dirname, '..', '.env')
let env = readFileSync(envPath, 'utf-8')
let jwtSecret = ''
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^JWT_SECRET=(.*)$/)
  if (m) jwtSecret = m[1].trim()
}
if (!jwtSecret) {
  console.error('找不到 JWT_SECRET，请先在 docker/.env 配置')
  process.exit(1)
}

const anonKey = sign('anon', jwtSecret)
const serviceRoleKey = sign('service_role', jwtSecret)

// 回写进 docker/.env（仅当对应行不存在或为空时）
const replaceOrAppend = (key, val) => {
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(env)) {
    env = env.replace(re, `${key}=${val}`)
  } else {
    env += `\n${key}=${val}\n`
  }
}
replaceOrAppend('SUPABASE_ANON_KEY', anonKey)
replaceOrAppend('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey)
replaceOrAppend('VITE_SUPABASE_ANON_KEY', anonKey)

writeFileSync(envPath, env)
console.log('✓ 已生成 SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 并写入 docker/.env')
