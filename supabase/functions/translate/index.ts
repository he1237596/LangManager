import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TMT_ENDPOINT = 'tmt.tencentcloudapi.com'
const TMT_SERVICE = 'tmt'
const TMT_VERSION = '2018-03-21'
const TMT_ACTION = 'TextTranslate'
const TMT_REGION = 'ap-guangzhou'

// locale code → 腾讯翻译语言代码
function toTencentLang(localeCode: string): string {
  const map: Record<string, string> = {
    'zh-CN': 'zh', 'zh': 'zh',
    'zh-TW': 'zh-TW', 'zh-HK': 'zh-TW',
    'en': 'en', 'en-US': 'en', 'en-GB': 'en',
    'ja': 'ja', 'ja-JP': 'ja',
    'ko': 'ko', 'ko-KR': 'ko',
    'fr': 'fr', 'es': 'es', 'de': 'de', 'it': 'it',
    'ru': 'ru', 'pt': 'pt', 'pt-BR': 'pt', 'pt-PT': 'pt',
    'ar': 'ar', 'id': 'id', 'th': 'th', 'vi': 'vi',
    'ms': 'ms', 'nl': 'nl', 'pl': 'pl', 'tr': 'tr',
    'sv': 'sv', 'da': 'da', 'fi': 'fi', 'cs': 'cs',
    'el': 'el', 'ro': 'ro', 'hu': 'hu', 'sk': 'sk',
    'uk': 'uk', 'bg': 'bg', 'hr': 'hr', 'sl': 'sl',
    'hi': 'hi',
  }
  return map[localeCode] || localeCode.split('-')[0].toLowerCase()
}

async function getConfig(): Promise<{ secretId: string; secretKey: string } | null> {
  const { data: idData } = await supabase
    .from('system_configs')
    .select('value')
    .eq('key', 'tencent_secret_id')
    .maybeSingle()
  const { data: keyData } = await supabase
    .from('system_configs')
    .select('value')
    .eq('key', 'tencent_secret_key')
    .maybeSingle()
  const secretId = idData?.value
  const secretKey = keyData?.value
  if (!secretId || !secretKey) return null
  return { secretId, secretKey }
}

// TC3-HMAC-SHA256 签名
async function signTC3(
  secretId: string,
  secretKey: string,
  payload: string,
  timestamp: number,
): Promise<string> {
  const date = new Date(timestamp * 1000).toISOString().split('T')[0] // YYYY-MM-DD (UTC)

  // 1. Build canonical request
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const contentType = 'application/json; charset=utf-8'
  const canonicalHeaders = `content-type:${contentType}\nhost:${TMT_ENDPOINT}\nx-tc-action:${TMT_ACTION.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedPayload = await sha256Hex(payload)
  const canonicalRequest = [
    httpRequestMethod, canonicalUri, canonicalQueryString,
    canonicalHeaders, signedHeaders, hashedPayload,
  ].join('\n')

  // 2. Build string to sign
  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${TMT_SERVICE}/tc3_request`
  const stringToSign = [algorithm, String(timestamp), credentialScope, await sha256Hex(canonicalRequest)].join('\n')

  // 3. Calculate signature
  const secretDate = await hmacSha256(toUint8Array(`TC3${secretKey}`), date)
  const secretService = await hmacSha256(secretDate, TMT_SERVICE)
  const secretSigning = await hmacSha256(secretService, 'tc3_request')
  const signature = await hmacSha256Hex(secretSigning, stringToSign)

  // 4. Build authorization
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return authorization
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const buf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  return new Uint8Array(buf)
}

async function hmacSha256Hex(key: Uint8Array, data: string): Promise<string> {
  const buf = await hmacSha256(key, data)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

function toUint8Array(key: string): Uint8Array {
  return new TextEncoder().encode(key)
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function callTencentTranslate(
  secretId: string,
  secretKey: string,
  sourceText: string,
  source: string,
  target: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000)
  const payload = JSON.stringify({
    SourceText: sourceText,
    Source: source,
    Target: target,
    ProjectId: 0,
  })

  const authorization = await signTC3(secretId, secretKey, payload, timestamp)

  const res = await fetch(`https://${TMT_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': TMT_ENDPOINT,
      'X-TC-Action': TMT_ACTION,
      'X-TC-Version': TMT_VERSION,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': TMT_REGION,
      'Authorization': authorization,
    },
    body: payload,
  })

  const data = await res.json()
  if (data.Response && data.Response.Error) {
    const code = data.Response.Error.Code
    const msg = data.Response.Error.Message
    if (code === 'AuthFailure.SignatureFailure') throw new Error('腾讯云 API 签名验证失败，请检查 SecretId/SecretKey')
    if (code === 'AuthFailure.UnauthorizedOperation') throw new Error('腾讯云 API 未授权，请确认 TMT 服务已开通')
    if (code === 'LimitExceeded') throw new Error('腾讯翻译 API 调用频率超限，请稍后再试')
    throw new Error(`腾讯翻译 API 错误: ${code} - ${msg}`)
  }

  return data.Response?.TargetText || ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // 手动验证用户身份
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: '未提供认证令牌' }, 401)
  }
  const token = authHeader.replace('Bearer ', '')
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
  if (authError || !user) {
    return jsonResponse({ error: '认证失败，请重新登录' }, 401)
  }

  try {
    const body = await req.json()
    const { texts, source_lang, target_lang } = body

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return jsonResponse({ error: '缺少 texts 参数（字符串数组）' })
    }
    if (!target_lang) {
      return jsonResponse({ error: '缺少 target_lang 参数' })
    }

    const config = await getConfig()
    if (!config) {
      return jsonResponse({ error: '未配置腾讯云翻译 SecretId/SecretKey，请在系统设置中配置' }, 400)
    }

    const source = source_lang ? toTencentLang(source_lang) : 'auto'
    const target = toTencentLang(target_lang)

    // 腾讯 TMT 不支持批量，逐条翻译
    const translations: string[] = []
    for (const text of texts) {
      const result = await callTencentTranslate(config.secretId, config.secretKey, text, source, target)
      translations.push(result)
    }

    return jsonResponse({ translations })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '服务器错误'
    return jsonResponse({ error: msg }, 500)
  }
})
