/**
 * LangManager 翻译下载工具
 *
 * 自托管（推荐，走数据库 RPC，无需 Edge Function）：
 *   node scripts/download-locales.mjs --api-url https://your.domain/rest/v1/rpc/get_all_translations_by_token --token your-token --output ./src/locales
 *
 * 云端（旧 Edge Function 模式，兼容）：
 *   node scripts/download-locales.mjs --api-url https://xxx.supabase.co/functions/v1/i18n --token your-token --output ./src/locales
 *
 * 参数：
 *   --api-url   RPC 地址（自托管）或 Edge Function 地址（云端）
 *   --token     LangManager 项目公开令牌
 *   --output    输出目录（默认 ./locales）
 *   --anon-key  自托管模式必填：Supabase anon key（RPC 需要鉴权）
 */

const args = process.argv.slice(2)

function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
}

const API_URL = getArg('api-url')
const TOKEN = getArg('token')
const OUTPUT = getArg('output') || './locales'
const ANON_KEY = getArg('anon-key') || process.env.VITE_SUPABASE_ANON_KEY || ''

if (!API_URL || !TOKEN) {
  console.error('缺少必要参数！')
  console.error('用法: node scripts/download-locales.mjs --api-url <rpc-or-function-url> --token <public-token> [--anon-key <key>] [--output ./locales]')
  process.exit(1)
}

const USE_RPC = API_URL.includes('/rest/v1/rpc/')

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// ---------- RPC 模式（自托管） ----------
async function rpcDownload() {
  if (!ANON_KEY) {
    console.error('RPC 模式需要 anon key，请传 --anon-key 或设置 VITE_SUPABASE_ANON_KEY 环境变量')
    process.exit(1)
  }
  const url = `${API_URL}?token=${encodeURIComponent(TOKEN)}`
  const res = await fetch(url, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`RPC error: ${res.status} ${body}`)
  }
  const all = await res.json()
  // all 结构: { "zh-CN": { "key": "value" }, "en": {...} }
  if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true })
  const codes = Object.keys(all)
  console.log(`RPC 返回 ${codes.length} 种语言：${codes.join(', ')}`)
  for (const code of codes) {
    const filePath = join(OUTPUT, `${code}.json`)
    writeFileSync(filePath, JSON.stringify(all[code], null, 2), 'utf-8')
    console.log(`  -> ${filePath} (${Object.keys(all[code]).length} 条翻译)`)
  }
}

// ---------- Edge Function 模式（云端兼容） ----------
async function apiGet(path) {
  const url = `${API_URL}${path}&token=${TOKEN}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error: ${res.status} ${body}`)
  }
  return res.json()
}

async function functionDownload() {
  const project = await apiGet('/project?')
  if (project && project.name) {
    console.log(`项目：${project.name}`)
    if (project.description) console.log(`描述：${project.description}`)
    console.log('')
  } else {
    console.warn('⚠ 无法获取项目信息，token 可能无效')
  }

  console.log('正在获取语言列表...')
  const locales = await apiGet('/locales?')

  if (!locales || locales.length === 0) {
    console.log('该项目没有配置语言')
    return
  }

  console.log(`找到 ${locales.length} 种语言：${locales.map(l => l.code).join(', ')}`)

  if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true })

  for (const locale of locales) {
    console.log(`正在下载 ${locale.name} (${locale.code})...`)
    const translations = await apiGet(`/translations?locale=${locale.code}&`)
    const filePath = join(OUTPUT, `${locale.code}.json`)
    writeFileSync(filePath, JSON.stringify(translations, null, 2), 'utf-8')
    console.log(`  -> ${filePath} (${Object.keys(translations).length} 条翻译)`)
  }
}

async function main() {
  console.log(USE_RPC ? '使用 RPC 模式（自托管）' : '使用 Edge Function 模式（云端）')
  if (USE_RPC) await rpcDownload()
  else await functionDownload()
  console.log('\n全部下载完成！')
}

main().catch(err => {
  console.error('下载失败:', err.message)
  process.exit(1)
})
