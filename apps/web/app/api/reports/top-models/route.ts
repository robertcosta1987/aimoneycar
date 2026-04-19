/**
 * GET /api/reports/top-models
 *
 * Returns top 10 models by sales volume over the past 12 months.
 * Pre-aggregates by raw model string, then sends all (model → count) pairs to
 * Claude so it can merge variations ("GOL", "GOL 1.0", "VOLKSWAGEN GOL" → "Gol")
 * and sum their counts accurately.
 * Cached 36 h. Empty results are never cached.
 * Pass ?refresh=true to bypass cache.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCache, setCache } from '@/lib/ai/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'top-models-v10'
const CACHE_TTL_HOURS = 36

function clean(raw: string): string {
  return raw.replace(/\/\//g, '').replace(/\s+/g, ' ').trim()
}

function isRepasse(s: string): boolean {
  return /repasse/i.test(s)
}

export async function GET(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.log('[top-models] no user session')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const svc = createServiceClient()
    const { data: profile } = await svc
      .from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) {
      console.log('[top-models] no dealership_id for user', user.id)
      return NextResponse.json({ error: 'No dealership' }, { status: 400 })
    }

    // ── Cache check ──────────────────────────────────────────────────────────
    const refresh = new URL(req.url).searchParams.get('refresh') === 'true'
    if (!refresh) {
      const cached = await getCache<{ models: { model: string; count: number }[] }>(
        svc, profile.dealership_id, CACHE_KEY,
      )
      if (cached?.models?.length) return NextResponse.json(cached)
    }

    const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Try with sale_date filter; fall back to all sold vehicles if empty
    let { data: raw } = await svc
      .from('vehicles')
      .select('model, version, transmission')
      .eq('dealership_id', profile.dealership_id)
      .eq('status', 'sold')
      .not('model', 'is', null)
      .gte('sale_date', twelveMonthsAgo)
      .limit(2000)

    if (!raw || raw.length === 0) {
      const fallback = await svc
        .from('vehicles')
        .select('model, version, transmission')
        .eq('dealership_id', profile.dealership_id)
        .eq('status', 'sold')
        .not('model', 'is', null)
        .limit(2000)
      raw = fallback.data
    }

    // Clean names and filter repasse
    const sold = (raw ?? [])
      .map(v => ({
        model: clean(v.model ?? ''),
        version: clean(v.version ?? ''),
        transmission: (v.transmission ?? '').trim(),
      }))
      .filter(v => v.model && !isRepasse(v.model) && !isRepasse(v.version))

    console.log('[top-models] sold vehicles after filter:', sold.length)
    if (!sold.length) return NextResponse.json({ models: [] })

    // Pre-aggregate by exact raw model string — AI will merge variations
    const rawCounts: Record<string, number> = {}
    for (const v of sold) {
      rawCounts[v.model] = (rawCounts[v.model] ?? 0) + 1
    }

    // Also build version info per raw model (for AI context)
    const modelVersions: Record<string, string> = {}
    for (const v of sold) {
      if (!modelVersions[v.model] && (v.version || v.transmission)) {
        modelVersions[v.model] = [v.version, v.transmission].filter(Boolean).join(' | ')
      }
    }

    const lines = Object.entries(rawCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([model, count]) => {
        const extra = modelVersions[model] ? ` (${modelVersions[model]})` : ''
        return `"${model}"${extra}: ${count}`
      })
      .join('\n')

    console.log('[top-models] unique raw models:', Object.keys(rawCounts).length)

    // Fallback: top 10 by raw name, cleaned
    const fallbackModels = Object.entries(rawCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([model, count]) => ({ model, count }))

    // ── AI: merge variations, sum counts, return top 10 with clean names ─────
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

      const ai = new Anthropic({ apiKey })
      const message = await ai.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Você é especialista em veículos brasileiros.

Abaixo está uma lista de nomes de modelos de veículos do banco de dados com a quantidade de vendas de cada um.
Muitos são variações do mesmo modelo com nomes inconsistentes (ex: "GOL", "GOL 1.0 MPI", "VOLKSWAGEN GOL" são todos o mesmo carro).

Sua tarefa:
1. Agrupe todas as variações do mesmo modelo e SOME as quantidades
2. Para cada grupo, crie um nome de exibição curto: "Modelo Motor Câmbio" (ex: "Gol 1.0 MT", "Civic 1.8 AT", "HB20 1.0")
   - Motor: apenas cilindrada (1.0, 1.8, 2.0) se disponível na versão
   - Câmbio: AT (automático/CVT), MT (manual) — omita se desconhecido
3. Retorne os 10 grupos com MAIOR total de vendas, em ordem decrescente

Responda SOMENTE com JSON array. Formato:
[{"model":"Gol 1.0 MT","count":23},{"model":"Civic 1.8 AT","count":17}]

Dados:
${lines}`,
        }],
      })

      const text = (message.content[0] as { type: string; text: string }).text ?? ''
      console.log('[top-models] AI raw response:', text.slice(0, 500))

      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        const models = (JSON.parse(match[0]) as { model: string; count: number }[])
          .filter(m => m.model && m.count > 0)
          .slice(0, 10)

        if (models.length) {
          console.log('[top-models] AI result:', models)
          const payload = { models }
          await setCache(svc, profile.dealership_id, CACHE_KEY, payload, CACHE_TTL_HOURS)
          return NextResponse.json(payload)
        }
      }
      console.error('[top-models] AI returned no usable data, text was:', text)
    } catch (aiErr: any) {
      console.error('[top-models] AI failed:', aiErr?.message)
    }

    // ── Fallback ─────────────────────────────────────────────────────────────
    console.log('[top-models] using raw fallback:', fallbackModels.length, 'models')
    const payload = { models: fallbackModels }
    await setCache(svc, profile.dealership_id, CACHE_KEY, payload, CACHE_TTL_HOURS)
    return NextResponse.json(payload)
  } catch (err: any) {
    console.error('[top-models] fatal error:', err)
    return NextResponse.json({ error: err?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}
