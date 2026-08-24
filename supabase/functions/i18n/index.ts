import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// stale-while-revalidate：浏览器 60s → CDN 5min → 旧数据+刷新 5min → 10min+ 重新请求
function cacheHeaders() {
  return {
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=300',
    'CDN-Cache-Control': 'max-age=300',
    'Vercel-CDN-Cache-Control': 'max-age=300',
  }
}

function jsonResponse(data: unknown, status = 200, nocache = false) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      ...(nocache ? {} : cacheHeaders()),
      'Content-Type': 'application/json',
    },
  })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const { pathname, searchParams } = url
    const token = searchParams.get('token')
    const nocache = searchParams.has('nocache')

    if (!token) {
      return errorResponse('缺少 token 参数')
    }

    // 匹配路由：/translations?locale=xx, /translations/all, /locales
    if (pathname.includes('/translations/all')) {
      const { data, error } = await supabase.rpc('get_all_translations_by_token', { p_token: token })
      if (error) return errorResponse(error.message, 500)
      return jsonResponse(data || {}, 200, nocache)
    }

    if (pathname.includes('/translations')) {
      const locale = searchParams.get('locale')
      if (!locale) return errorResponse('缺少 locale 参数')

      const { data, error } = await supabase.rpc('get_translations_by_token', {
        p_token: token,
        p_locale: locale,
      })
      if (error) return errorResponse(error.message, 500)
      return jsonResponse(data || {}, 200, nocache)
    }

    // /locales 或根路径
    const { data, error } = await supabase.rpc('get_locales_by_token', { p_token: token })
    if (error) return errorResponse(error.message, 500)
    return jsonResponse(data || [], 200, nocache)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '服务器错误'
    return errorResponse(msg, 500)
  }
})
