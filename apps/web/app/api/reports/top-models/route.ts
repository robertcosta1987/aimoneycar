/**
 * GET /api/reports/top-models
 *
 * Returns top 10 sold models from the past 6 months.
 * AI normalizes model names when available; falls back to direct aggregation
 * so the tile always shows data when sold vehicles exist.
 * Cached for 36 hours. Empty results are never cached.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCache, setCache } from '@/lib/ai/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'top-models-v7'
const CACHE_TTL_HOURS = 36

export async function GET() {
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
    const cached = await getCache<{ models: { model: string; count: number }[] }>(
      svc, profile.dealership_id, CACHE_KEY,
    )
    if (cached?.models?.length) return NextResponse.json(cached)

    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Try with sale_date filter; fall back to all sold vehicles if empty
    let { data: sold } = await svc
      .from('vehicles')
      .select('model')
      .eq('dealership_id', profile.dealership_id)
      .eq('status', 'sold')
      .not('model', 'is', null)
      .gte('sale_date', sixMonthsAgo)
      .limit(2000)

    if (!sold || sold.length === 0) {
      const fallback = await svc
        .from('vehicles')
        .select('model')
        .eq('dealership_id', profile.dealership_id)
        .eq('status', 'sold')
        .not('model', 'is', null)
        .limit(2000)
      sold = fallback.data
    }

    console.log('[top-models] sold vehicles found:', sold?.length ?? 0)
    if (!sold || sold.length === 0) return NextResponse.json({ models: [] })

    // Pre-aggregate by raw model — this is the guaranteed fallback result
    const rawCounts: Record<string, number> = {}
    for (const v of sold) {
      const key = (v.model ?? '').trim()
      if (key) rawCounts[key] = (rawCounts[key] ?? 0) + 1
    }

    const fallbackModels = Object.entries(rawCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([model, count]) => ({ model, count }))

    // ── Try AI normalization ─────────────────────────────────────────────────
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

      const modelList = sold
        .map(v => (v.model ?? '').trim())
        .filter(Boolean)
        .join('\n')

      const ai = new Anthropic({ apiKey })
      const message = await ai.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Abaixo está uma lista de modelos de veículos vendidos (um por linha, nome bruto do banco de dados).

Sua tarefa:
1. Agrupe variações do mesmo modelo (ex: "GOL 1.0", "GOL G6", "Gol Trend" → "Gol")
2. Conte quantas vezes cada modelo aparece na lista
3. Retorne os 10 modelos com mais vendas, ordenados do maior para o menor

Responda SOMENTE com um JSON array. Formato exato:
[{"model":"Gol","count":18},{"model":"Civic","count":12}]

Lista de modelos:
${modelList}`,
        }],
      })

      const text = (message.content[0] as { type: string; text: string }).text ?? ''
      console.log('[top-models] AI response:', text.slice(0, 300))

      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        const aiModels = (JSON.parse(match[0]) as { model: string; count: number }[]).slice(0, 10)
        if (aiModels.length) {
          console.log('[top-models] using AI result:', aiModels.length, 'models')
          const payload = { models: aiModels }
          await setCache(svc, profile.dealership_id, CACHE_KEY, payload, CACHE_TTL_HOURS)
          return NextResponse.json(payload)
        }
      }
    } catch (aiErr: any) {
      console.error('[top-models] AI failed, using fallback:', aiErr?.message)
    }

    // ── Fallback: raw aggregation ────────────────────────────────────────────
    console.log('[top-models] using raw fallback:', fallbackModels.length, 'models')
    const payload = { models: fallbackModels }
    await setCache(svc, profile.dealership_id, CACHE_KEY, payload, CACHE_TTL_HOURS)
    return NextResponse.json(payload)
  } catch (err: any) {
    console.error('[top-models] fatal error:', err)
    return NextResponse.json({ error: err?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}
