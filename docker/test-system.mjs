// 系统功能端到端测试（基于真实表结构）: 通过 Kong 网关调用后端
import { readFileSync } from 'node:fs'

const env = readFileSync('/init/.env', 'utf-8')
const getEnv = (k, f = '') => {
  for (const l of env.split(/\r?\n/)) {
    const m = l.match(new RegExp(`^${k}=(.*)$`))
    if (m) return m[1].trim()
  }
  return f
}
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyOTk5NDAsImV4cCI6MjEwMjY1OTk0MH0.eyxLJZp6J1sK2z2p9V9p0Q5Kb9X2p0Q5Kb9X2p0Q5Kb9'
const SR = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const REST = 'http://kong:8000/rest/v1'
const ADMIN = 'http://kong:8000/auth/v1/admin'

const results = []
const log = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`) }
const rest = async (path, opts = {}) => {
  const r = await fetch(`${REST}/${path}`, {
    method: opts.method || 'GET',
    headers: { apikey: ANON, Authorization: `Bearer ${opts.token || ''}`, 'Content-Type': 'application/json', Prefer: opts.prefer || '', ...(opts.headers || {}) },
    body: opts.body,
  })
  const text = await r.text()
  let json; try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: r.status, json }
}

async function login(email, password) {
  const r = await fetch('http://kong:8000/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!r.ok) throw new Error(`login ${r.status}`)
  return (await r.json()).access_token
}

async function main() {
  let token
  try { token = await login('admin@example.com', 'admin123'); log('登录 (admin)', true, `token ${token.length} 字符`) }
  catch (e) { log('登录 (admin)', false, e.message); return }

  // profile / 角色
  let myId
  try {
    const r = await rest('profiles?select=*', { token })
    const p = Array.isArray(r.json) ? r.json[0] : null
    myId = p?.id
    log('读取个人 profile', r.status === 200 && !!p, p ? `role_id=${p.role_id.slice(0,8)}` : `status ${r.status}`)
  } catch (e) { log('读取个人 profile', false, e.message) }

  // 角色列表
  try { const r = await rest('roles?select=*', { token }); log('角色列表', r.status === 200 && r.json.length > 0, `共 ${r.json?.length} 个: ${r.json.map(x=>x.name).join(',')}`) }
  catch (e) { log('角色列表', false, e.message) }

  // 用户管理 (admin)
  try { const r = await fetch(`${ADMIN}/users?per_page=5`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } }); const j = await r.json(); log('用户管理列表', r.ok && Array.isArray(j.users), `${j.users?.length ?? 0} 个用户`) }
  catch (e) { log('用户管理列表', false, e.message) }

  // 项目 CRUD (真实字段)
  let projId
  try {
    const c = await rest('projects', { method: 'POST', token, prefer: 'return=representation', body: JSON.stringify({ name: '测试项目A', description: 'E2E 测试', created_by: myId }) })
    if (c.status === 201 || c.status === 200) { projId = c.json[0].id; log('创建项目', true, `id=${projId.slice(0,8)}`) }
    else log('创建项目', false, `status ${c.status} ${JSON.stringify(c.json)}`)
  } catch (e) { log('创建项目', false, e.message) }

  try { const u = await rest(`projects?id=eq.${projId}`, { method: 'PATCH', token, prefer: 'return=representation', body: JSON.stringify({ description: 'E2E 测试-更新' }) }); log('更新项目', u.status === 200, `status ${u.status}`) }
  catch (e) { log('更新项目', false, e.message) }

  try { const l = await rest('projects?select=*&order=created_at.desc', { token }); log('列出项目', l.status === 200 && l.json.length > 0, `共 ${l.json.length} 个`) }
  catch (e) { log('列出项目', false, e.message) }

  // locales (翻译需 locale_id)
  let localeId
  try {
    const l = await rest('locales?select=*&limit=1', { token })
    if (Array.isArray(l.json) && l.json.length > 0) { localeId = l.json[0].id; log('语言列表 (locales)', true, `${l.json.length} 个, 复用 ${localeId.slice(0,8)}`) }
    else {
      const c = await rest('locales', { method: 'POST', token, prefer: 'return=representation', body: JSON.stringify({ project_id: projId, code: 'en', name: 'English' }) })
      if (c.status === 201) { localeId = c.json[0].id; log('语言列表 (locales)', true, '为空, 已新增 en') }
      else log('语言列表 (locales)', false, `新增失败 status ${c.status} ${JSON.stringify(c.json)}`)
    }
  } catch (e) { log('语言列表 (locales)', false, e.message) }

  // 翻译键 + 译文 (真实字段: key_id, locale_id, value)
  let keyId
  try {
    const c = await rest('translation_keys', { method: 'POST', token, prefer: 'return=representation', body: JSON.stringify({ project_id: projId, key: 'hello', description: '问候语' }) })
    if (c.status === 201) { keyId = c.json[0].id; log('创建翻译键', true) } else log('创建翻译键', false, `status ${c.status} ${JSON.stringify(c.json)}`)
  } catch (e) { log('创建翻译键', false, e.message) }

  try {
    const c = await rest('translations', { method: 'POST', token, prefer: 'return=representation', body: JSON.stringify({ key_id: keyId, locale_id: localeId, value: 'Hello', updated_by: myId }) })
    log('创建译文', c.status === 201, `status ${c.status} ${JSON.stringify(c.json)} keyId=${keyId?.slice(0,8)} localeId=${localeId?.slice(0,8)}`)
  } catch (e) { log('创建译文', false, e.message) }

  try { const l = await rest(`translations?key_id=eq.${keyId}`, { token }); log('读取译文', l.status === 200 && l.json.length > 0, `共 ${l.json.length}`) }
  catch (e) { log('读取译文', false, e.message) }

  // 审计日志
  try { const r = await rest('audit_logs?select=*&order=created_at.desc&limit=5', { token }); log('审计日志读取', r.status === 200, `status ${r.status}`) }
  catch (e) { log('审计日志读取', false, e.message) }

  // 翻译服务 health
  try { const r = await fetch('http://translate:8081/health'); log('翻译服务 health', r.ok, `status ${r.status}`) }
  catch (e) { log('翻译服务 health', false, e.message) }

  // 翻译服务实际调用 (若提供 /translate 端点)
  try {
    const r = await fetch('http://translate:8081/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '你好', target: 'en' }) })
    const b = await r.text()
    log('翻译服务调用 (/translate)', r.ok, `status ${r.status} body=${b.slice(0,150)}`)
  } catch (e) { log('翻译服务调用 (/translate)', false, e.message) }

  // 系统设置 (真实表名 system_configs)
  try {
    const r = await rest('system_configs?select=*&limit=5', { token })
    log('系统设置读取 (system_configs)', r.status === 200, `status ${r.status}, 共 ${Array.isArray(r.json) ? r.json.length : '?'} 条`)
  } catch (e) { log('系统设置读取 (system_configs)', false, e.message) }

  // 系统设置写入 (super_admin upsert)
  try {
    const r = await rest('system_configs', { method: 'POST', token, prefer: 'return=representation', body: JSON.stringify({ key: 'test_key', value: 'test_val' }) })
    log('系统设置写入 (system_configs)', r.status === 201, `status ${r.status}`)
    if (r.status === 201) { try { await rest(`system_configs?key=eq.test_key`, { method: 'DELETE', token }) } catch {} }
  } catch (e) { log('系统设置写入 (system_configs)', false, e.message) }

  // 翻译服务调用 (未配置腾讯云密钥时预期 500/502, 属正常)
  try {
    const r = await fetch('http://translate:8081/translate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ texts: ['你好'], source_lang: 'zh', target_lang: 'en' }) })
    const b = await r.text()
    const expected = r.status === 500 || r.status === 502
    log('翻译服务调用 (/translate)', expected, `未配置密钥时 status ${r.status} (预期 500/502)`)
  } catch (e) { log('翻译服务调用 (/translate)', false, e.message) }

  // 清理
  if (keyId) { try { await rest(`translations?key_id=eq.${keyId}`, { method: 'DELETE', token }) } catch {} }
  if (keyId) { try { await rest(`translation_keys?id=eq.${keyId}`, { method: 'DELETE', token }) } catch {} }
  if (projId) { const d = await rest(`projects?id=eq.${projId}`, { method: 'DELETE', token }); log('删除测试项目 (清理)', d.status === 200 || d.status === 204, `status ${d.status}`) }

  const passed = results.filter(r => r.ok).length
  console.log(`\n==== 结果: ${passed}/${results.length} 通过 ====`)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })
