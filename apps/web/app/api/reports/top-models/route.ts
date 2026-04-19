/**
 * GET /api/reports/top-models
 *
 * Returns top 10 sold configurations (Model Engine Transmission, e.g. "Gol 1.0 AT")
 * from the past 12 months, ranked by sales volume.
 * AI normalizes the display name; falls back to raw aggregation if AI fails.
 * Cached 36 h. Empty results are never cached.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCache, setCache } from '@/lib/ai/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'top-models-v8'
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

    const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Try with sale_date filter; fall back to all sold vehicles if empty
    let { data: sold } = await svc
      .from('vehicles')
      .select('model, version, transmission')
      .eq('dealership_id', profile.dealership_id)
      .eq('status', 'sold')
      .not('model', 'is', null)
      .gte('sale_date', twelveMonthsAgo)
      .limit(2000)

    if (!sold || sold.length === 0) {
      const fallback = await svc
        .from('vehicles')
        .select('model, version, transmission')
        .eq('dealership_id', profile.dealership_id)
        .eq('status', 'sold')
        .not('model', 'is', null)
        .limit(2000)
      sold = fallback.data
    }

    console.log('[top-models] sold vehicles found:', sold?.length ?? 0)
    if (!sold || sold.length === 0) return NextResponse.json({ models: [] })

    // Pre-aggregate by raw key: "model|version|transmission"
    const rawCounts: Record<string, { model: string; version: string | null; transmission: string | null; count: number }> = {}
    for (const v of sold) {
      const key = `${v.model ?? ''}|${v.version ?? ''}|${v.transmission ?? ''}`
      if (!rawCounts[key]) rawCounts[key] = { model: v.model, version: v.version, transmission: v.transmission, count: 0 }
      rawCounts[key].count++
    }

    const top30 = Object.values(rawCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 30)

    // Fallback display name: "Model Version" (raw)
    const fallbackModels = top30.slice(0, 10).map(v => ({
      model: [v.model, v.version].filter(Boolean).join(' ').trim(),
      count: v.count,
    }))

    // ── Try AI normalization ─────────────────────────────────────────────────
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

      // Build numbered list: "1. GOL | 1.0 MPI FLEX | manual"
      const lines = top30
        .map((v, i) => `${i + 1}. modelo="${v.model ?? ''}" versão="${v.version ?? ''}" câmbio="${v.transmission ?? ''}"`)
        .join('\n')

      const ai = new Anthropic({ apiKey })
      const message = await ai.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Você é especialista em veículos brasileiros.
Para cada item abaixo, crie um nome de exibição no formato: "Modelo Motor Câmbio"
Regras:
- Modelo: nome comercial curto (ex: Gol, Civic, HB20, City)
- Motor: apenas a cilindrada (ex: 1.0, 1.8, 2.0)
- Câmbio: AT (automático/CVT), MT (manual). Se desconhecido, omita.
Exemplos: "GOL 1.0 MPI FLEX | manual" → "Gol 1.0 MT", "COROLLA XEI 2.0 FLEX | automático" → "Corolla 2.0 AT"

Retorne SOMENTE um JSON array com os nomes na mesma ordem da lista. Exemplo:
["Gol 1.0 MT","Corolla 2.0 AT","HB20 1.0 AT"]

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
          // Re-aggregate by AI-normalized name (merges e.g. same model different raw spelling)
          const merged: Record<string, number> = {}
          for (let i = 0; i < top30.length; i++) {
            const name = (names[i] ?? fallbackModels[i]?.model ?? top30[i].model).trim()
            merged[name] = (merged[name] ?? 0) + top30[i].count
          }
          const aiModels = Object.entries(merged)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([model, count]) => ({ model, count }))

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
