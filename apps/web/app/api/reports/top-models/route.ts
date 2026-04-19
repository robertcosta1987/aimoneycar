/**
 * GET /api/reports/top-models
 *
 * Sends the raw list of sold vehicle model names (past 6 months) to Claude.
 * Claude groups, normalizes, and ranks them — returns top 10 with counts.
 * Cached for 36 hours.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCache, setCache } from '@/lib/ai/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'top-models-v5'
const CACHE_TTL_HOURS = 36

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = createServiceClient()
    const { data: profile } = await svc
      .from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    // ── Cache check ──────────────────────────────────────────────────────────
    const cached = await getCache<{ models: { model: string; count: number }[] }>(
      svc, profile.dealership_id, CACHE_KEY,
    )
    if (cached) return NextResponse.json(cached)

    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Try with date filter first; fall back to all sold if nothing comes back
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

    if (!sold || sold.length === 0) return NextResponse.json({ models: [] })

    // Build flat list of model names — one per sale, raw as-is from DB
    const modelList = sold
      .map(v => (v.model ?? '').trim())
      .filter(Boolean)
      .join('\n')

    // ── AI: group, normalize, rank ───────────────────────────────────────────
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const message = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Abaixo está uma lista de modelos de veículos vendidos (um por linha, nome bruto do banco de dados).

Sua tarefa:
1. Agrupe variações do mesmo modelo (ex: "GOL 1.0", "GOL G6", "Gol Trend" → "Gol")
2. Conte quantas vezes cada modelo aparece
3. Retorne os 10 modelos com mais vendas

Responda SOMENTE com um JSON array ordenado por quantidade. Formato exato:
[{"model":"Gol","count":18},{"model":"Civic","count":12}]

Lista de modelos:
${modelList}`,
      }],
    })

    const text = (message.content[0] as { type: string; text: string }).text ?? ''
    const match = text.match(/\[[\s\S]*?\]/)
    if (!match) {
      console.error('[top-models] AI returned no valid JSON:', text)
      return NextResponse.json({ models: [] })
    }

    const models = (JSON.parse(match[0]) as { model: string; count: number }[]).slice(0, 10)
    const payload = { models }

    await setCache(svc, profile.dealership_id, CACHE_KEY, payload, CACHE_TTL_HOURS)
    return NextResponse.json(payload)
  } catch (err: any) {
    console.error('[top-models]', err)
    return NextResponse.json({ error: err?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}
