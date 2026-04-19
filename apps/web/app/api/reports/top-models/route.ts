/**
 * GET /api/reports/top-models
 *
 * Returns top 10 models by sales volume over the past 12 months.
 * Counting is by model name only (all versions combined) so numbers are accurate.
 * AI produces a clean display label (e.g. "Gol 1.0 MT") using the most-sold version.
 * Strips "//" artifacts and excludes "Repasse" entries.
 * Cached 36 h. Empty results are never cached.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCache, setCache } from '@/lib/ai/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'top-models-v9'
const CACHE_TTL_HOURS = 36

function cleanName(raw: string): string {
  return raw.replace(/^\/+|\/+$/g, '').trim()
}

function isRepasse(raw: string): boolean {
  return /repasse/i.test(raw)
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

    // Clean and filter
    const sold = (raw ?? [])
      .map(v => ({ ...v, model: cleanName(v.model ?? '') }))
      .filter(v => v.model && !isRepasse(v.model) && !isRepasse(v.version ?? ''))

    console.log('[top-models] sold vehicles after filter:', sold.length)
    if (!sold.length) return NextResponse.json({ models: [] })

    // ── Count by model name only (all versions combined) ────────────────────
    // Also track the most common version+transmission per model for display
    const modelCounts: Record<string, number> = {}
    const versionCounts: Record<string, Record<string, number>> = {}

    for (const v of sold) {
      const model = v.model.toUpperCase()
      modelCounts[model] = (modelCounts[model] ?? 0) + 1

      const versionKey = `${v.version ?? ''}|||${v.transmission ?? ''}`
      if (!versionCounts[model]) versionCounts[model] = {}
      versionCounts[model][versionKey] = (versionCounts[model][versionKey] ?? 0) + 1
    }

    // Top 20 models by total sales count
    const top20 = Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([model, count]) => {
        // Pick the most-sold version for this model
        const bestVersionKey = Object.entries(versionCounts[model] ?? {})
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '|||'
        const [version, transmission] = bestVersionKey.split('|||')
        return { model, version: version || null, transmission: transmission || null, count }
      })

    // Fallback display name (raw, no AI)
    const fallbackModels = top20.slice(0, 10).map(v => ({
      model: [v.model, v.version].filter(Boolean).join(' ').trim(),
      count: v.count,
    }))

    // ── Try AI for clean display labels ─────────────────────────────────────
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

      const lines = top20
        .map((v, i) => `${i + 1}. modelo="${v.model}" versão="${v.version ?? ''}" câmbio="${v.transmission ?? ''}" vendas=${v.count}`)
        .join('\n')

      const ai = new Anthropic({ apiKey })
      const message = await ai.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Você é especialista em veículos brasileiros.
Para cada item, crie um nome de exibição curto no formato: "Modelo Motor Câmbio"
Regras:
- Modelo: nome comercial curto (ex: Gol, Civic, HB20, City, Onix)
- Motor: apenas a cilindrada extraída da versão (ex: 1.0, 1.8, 2.0). Se não houver, omita.
- Câmbio: AT (automático/CVT/auto), MT (manual). Se desconhecido, omita.
Exemplos: "GOL | 1.0 MPI FLEX | manual" → "Gol 1.0 MT"
         "COROLLA | XEI 2.0 FLEX | automático" → "Corolla 2.0 AT"
         "HB20 | SENSE 1.0 | " → "HB20 1.0"

Retorne SOMENTE um JSON array com os nomes na mesma ordem da lista de entrada:
["Gol 1.0 MT","Corolla 2.0 AT","HB20 1.0"]

Lista:
${lines}`,
        }],
      })

      const text = (message.content[0] as { type: string; text: string }).text ?? ''
      console.log('[top-models] AI response:', text.slice(0, 400))

      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        const names: string[] = JSON.parse(match[0])
        if (names.length) {
          const aiModels = top20.slice(0, 10).map((v, i) => ({
            model: (names[i] ?? fallbackModels[i]?.model ?? v.model).trim(),
            count: v.count,
          }))
          console.log('[top-models] using AI result:', aiModels.length, 'models')
          const payload = { models: aiModels }
          await setCache(svc, profile.dealership_id, CACHE_KEY, payload, CACHE_TTL_HOURS)
          return NextResponse.json(payload)
        }
      }
    } catch (aiErr: any) {
      console.error('[top-models] AI failed, using fallback:', aiErr?.message)
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
