/**
 * LangManager 翻译下载工具
 *
 * 用法：
 *   node scripts/download-locales.mjs --api-url https://xxx.supabase.co/functions/v1/i18n --token your-token --output ./src/locales
 *
 * 参数：
 *   --api-url    Edge Function API 地址
 *   --token      LangManager 项目公开令牌
 *   --output     输出目录（默认 ./locales）
 */

const args = process.argv.slice(2)

function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
}

const API_URL = getArg('api-url')
const TOKEN = getArg('token')
const OUTPUT = getArg('output') || './locales'

if (!API_URL || !TOKEN) {
  console.error('缺少必要参数！')
  console.error('用法: node scripts/download-locales.mjs --api-url <edge-function-url> --token <public-token> [--output ./locales]')
  process.exit(1)
}

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

async function apiGet(path) {
  const url = `${API_URL}${path}&token=${TOKEN}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error: ${res.status} ${body}`)
  }
  return res.json()
}

async function main() {
  console.log('正在获取语言列表...')
  const locales = await apiGet('/locales?')

  if (!locales || locales.length === 0) {
    console.log('该项目没有配置语言')
    return
  }

  console.log(`找到 ${locales.length} 种语言：${locales.map(l => l.code).join(', ')}`)

  if (!existsSync(OUTPUT)) {
    mkdirSync(OUTPUT, { recursive: true })
  }

  for (const locale of locales) {
    console.log(`正在下载 ${locale.name} (${locale.code})...`)
    const translations = await apiGet(`/translations?locale=${locale.code}&`)

    const filePath = join(OUTPUT, `${locale.code}.json`)
    const json = JSON.stringify(translations, null, 2)
    writeFileSync(filePath, json, 'utf-8')
    console.log(`  -> ${filePath} (${Object.keys(translations).length} 条翻译)`)
  }

  console.log('\n全部下载完成！')
}

main().catch(err => {
  console.error('下载失败:', err.message)
  process.exit(1)
})