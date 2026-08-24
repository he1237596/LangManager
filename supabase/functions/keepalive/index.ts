import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 最小执行间隔：500 秒内重复请求直接跳过，避免外部监控频率过高吃额度
const MIN_INTERVAL_MS = 500_000
let lastRunTs = 0

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const now = Date.now()
  if (now - lastRunTs < MIN_INTERVAL_MS) {
    return new Response(JSON.stringify({
      status: 'skipped',
      reason: 'rate limited',
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  lastRunTs = now

  try {
    const start = Date.now()
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .limit(1)
    const latency = Date.now() - start

    if (error) {
      return new Response(JSON.stringify({ status: 'error', error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      status: 'alive',
      db_latency_ms: latency,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ status: 'error', message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
