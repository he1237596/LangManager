import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 支持 GET 和 POST
  let projectName: string | null = null

  if (req.method === 'GET') {
    const url = new URL(req.url)
    projectName = url.searchParams.get('project')
  } else if (req.method === 'POST') {
    try {
      const body = await req.json()
      projectName = body.project || null
    } catch { /* ignore */ }
  }

  if (!projectName) {
    return new Response(
      JSON.stringify({ error: '缺少参数 project，请传入项目名称', example: '?project=my-project' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // 查项目
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('id, name')
      .eq('name', projectName)
      .single()

    if (projectErr || !project) {
      return new Response(
        JSON.stringify({ error: `项目 "${projectName}" 不存在` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 查语言列表（locales 表通过 project_id 关联）
    const { data: sortedLocales, error: localeErr } = await supabase
      .from('locales')
      .select('id, code')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true })

    if (localeErr || !sortedLocales || sortedLocales.length === 0) {
      return new Response(
        JSON.stringify({ error: '该项目没有配置语言', debug: localeErr?.message, projectId: project.id, count: sortedLocales?.length ?? 0 }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 查所有 key
    const { data: keys } = await supabase
      .from('translation_keys')
      .select('id, key')
      .eq('project_id', project.id)

    if (!keys || keys.length === 0) {
      return new Response(
        JSON.stringify({ error: '该项目没有翻译 key' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const keyIds = keys.map(k => k.id)

    // 查所有翻译
    const { data: translations } = await supabase
      .from('translations')
      .select('key_id, locale_id, value')
      .in('key_id', keyIds)

    // 构建 CSV
    const lines: string[] = []
    // 表头：key, locale1, locale2, ...
    const headers = ['key', ...sortedLocales.map(l => l.code)]
    lines.push(headers.join(','))

    // 每行一个 key
    for (const k of keys) {
      const row: string[] = [escapeCsv(k.key)]
      for (const locale of sortedLocales) {
        const t = (translations || []).find(tr => tr.key_id === k.id && tr.locale_id === locale.id)
        row.push(escapeCsv(t?.value || ''))
      }
      lines.push(row.join(','))
    }

    const csvContent = '\uFEFF' + lines.join('\n') // BOM 确保中文正确显示

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${projectName}.csv"`,
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: '服务器错误', message: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}
