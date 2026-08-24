// LangManager 自托管翻译服务
// 等价替代云端 Supabase Edge Function `translate`：调用腾讯云机器翻译 TMT
// 接口协议与云端一致：POST {body: {texts, source_lang, target_lang}} -> {translations}
//
// 鉴权：复用 Supabase JWT（Authorization: Bearer <anon/用户token>），
// 此处只校验签名是否合法（用同一个 JWT_SECRET），不校验角色，放行所有登录用户。

import express from 'express'
import crypto from 'crypto'

const app = express()
app.use(express.json({ limit: '1mb' }))

// ---------- 腾讯云 TMT 配置 ----------
// 优先从数据库 system_configs 表读取（由前端“系统设置”页面配置），
// 环境变量仅作为兜底。这样用户无需改 .env，直接在页面配置即可生效。
const REGION = process.env.TENCENT_REGION || 'ap-guangzhou'
const ENDPOINT = 'tmt.tencentcloudapi.com'
const ENV_SECRET_ID = process.env.TENCENT_SECRET_ID
const ENV_SECRET_KEY = process.env.TENCENT_SECRET_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://kong:8000'
const CONFIG_CACHE_TTL = 60 * 1000 // 配置缓存 60s
let configCache = { id: null, key: null, ts: 0 }

async function fetchTencentConfig() {
  const now = Date.now()
  if (configCache.id && now - configCache.ts < CONFIG_CACHE_TTL) {
    return { id: configCache.id, key: configCache.key }
  }
  // 兜底：环境变量已配置则直接使用
  if (ENV_SECRET_ID && ENV_SECRET_KEY) {
    configCache = { id: ENV_SECRET_ID, key: ENV_SECRET_KEY, ts: now }
    return configCache
  }
  if (!SERVICE_ROLE_KEY) {
    return { id: null, key: null }
  }
  try {
    const get = async (k) => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/system_configs?select=value&key=eq.${k}`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
      )
      if (!r.ok) return null
      const arr = await r.json()
      return Array.isArray(arr) && arr.length ? arr[0].value : null
    }
    const id = await get('tencent_secret_id')
    const key = await get('tencent_secret_key')
    configCache = { id, key, ts: now }
    return configCache
  } catch {
    return { id: null, key: null }
  }
}

// ---------- JWT 校验（与 Supabase 同一密钥） ----------
function verifyJwt(token) {
  const JWT_SECRET = process.env.JWT_SECRET
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  // 恒定时间比较
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64').toString())
    if (claims.exp && claims.exp * 1000 < Date.now()) return null
    return claims
  } catch {
    return null
  }
}

// ---------- TC3 签名 + 调用腾讯云 TMT ----------
function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}
function hmac(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg, 'utf8').digest()
}
function hmacHex(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('hex')
}

// 归一化语种代码：前端使用 BCP-47（如 zh-CN），腾讯云 TMT 使用自有代码（zh=简体、zh-TW=繁体）
function normalizeLang(lang) {
  if (!lang) return lang
  const map = {
    'zh-CN': 'zh', 'zh-Hans': 'zh', 'zh-Hant': 'zh-TW',
    'zh-TW': 'zh-TW', 'zh-HK': 'zh-TW',
    'en-US': 'en', 'en-GB': 'en', 'en': 'en',
  }
  return map[lang] || lang.split('-')[0]
}

async function callTmt(texts, sourceLang, targetLang, secretId, secretKey) {
  sourceLang = normalizeLang(sourceLang)
  targetLang = normalizeLang(targetLang)
  const service = 'tmt'
  const action = 'TextTranslateBatch'
  const version = '2018-03-21'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const payloadObj = {
    Source: sourceLang,
    Target: targetLang,
    ProjectId: 0,
    SourceTextList: texts,
  }
  const payload = JSON.stringify(payloadObj)

  // 拼接规范请求串
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${ENDPOINT}\n`
  const signedHeaders = 'content-type;host'
  const hashedPayload = sha256hex(payload)
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n')

  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n')

  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = hmacHex(secretSigning, stringToSign)

  const authorization = [
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  const res = await fetch(`https://${ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Host: ENDPOINT,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': REGION,
      Authorization: authorization,
    },
    body: payload,
  })

  const data = await res.json()
  if (data.Response && data.Response.Error) {
    throw new Error(`TMT Error: ${data.Response.Error.Code} ${data.Response.Error.Message}`)
  }
  // Response.TargetTextList: string[]
  return data.Response.TargetTextList
}

// ---------- 路由 ----------
app.post('/translate', async (req, res) => {
  const { id: SECRET_ID, key: SECRET_KEY } = await fetchTencentConfig()
  if (!SECRET_ID || !SECRET_KEY) {
    return res.status(500).json({ error: '翻译服务未配置腾讯云密钥，请在“系统设置”页面配置 SecretId/SecretKey' })
  }
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const claims = verifyJwt(token)
  if (!claims) {
    return res.status(401).json({ error: '未登录或 token 无效' })
  }

  const { texts, source_lang, target_lang } = req.body || {}
  if (!Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({ error: 'texts 必须是非空数组' })
  }
  try {
    const translations = await callTmt(texts, source_lang, target_lang, SECRET_ID, SECRET_KEY)
    return res.json({ translations })
  } catch (err) {
    return res.status(502).json({ error: err.message })
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 8081
app.listen(PORT, () => console.log(`translate service listening on :${PORT}`))
