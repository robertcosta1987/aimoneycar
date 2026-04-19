/**
 * GET /api/reports/top-models
 *
 * Queries sold vehicles from the past 6 months, sends the pre-aggregated
 * model list to Claude (positional array — no key-matching issues), and
 * returns the top 10 clean model names with their sales counts.
 * Cached for 36 hours.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCache, setCache } from '@/lib/ai/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'top-models-v4'
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

    const { data: sold, error } = await svc
      .from('vehicles')
      .select('model')
      .eq('dealership_id', profile.dealership_id)
      .eq('status', 'sold')
      .not('model', 'is', null)
      .gte('sale_date', sixMonthsAgo)
      .limit(2000)

    if (error) throw error
    if (!sold || sold.length === 0) return NextResponse.json({ models: [] })

    // Pre-aggregate by raw model string, sort by count desc
    const rawCounts: Record<string, number> = {}
    for (const v of sold) {
      const key = (v.model ?? '').trim()
      if (key) rawCounts[key] = (rawCounts[key] ?? 0) + 1
    }

    // Top 30 raw entries sent to AI (more than enough to get top 10 clean names)
    const top30 = Object.entries(rawCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)

    // ── Ask Claude to return clean names as a positional JSON array ──────────
    const numberedList = top30.map(([model], i) => `${i + 1}. ${model}`).join('\n')

    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const message = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Você é um especialista em veículos brasileiros.
Abaixo há uma lista numerada de nomes de modelos de veículos (como aparecem num banco de dados).
Para cada item, extraia APENAS o nome comercial curto do modelo, sem versão, motorização, ano ou marca.
Exemplos: "GOL 1.0 MPI TREND" → "Gol", "COROLLA XEI 2.0 FLEX" → "Corolla", "HB20 1.6 COMFORT PLUS" → "HB20".

Retorne SOMENTE um JSON array com os nomes limpos na mesma ordem da lista. Exemplo:
["Gol","Corolla","HB20","Palio","Civic"]

Lista:
${numberedList}`,
      }],
    })

    const text = (message.content[0] as { type: string; text: string }).text ?? ''
    const match = text.match(/\[[\s\S]*?\]/)

    let cleanNames: string[] = []
    if (match) {
      try { cleanNames = JSON.parse(match[0]) } catch { /* fall through */ }
    }

    // Merge clean names with counts, re-aggregate grouped names, then sort
    const merged: Record<string, number> = {}
    for (let i = 0; i < top30.length; i++) {
      const clean = (cleanNames[i] ?? top30[i][0]).trim()
      merged[clean] = (merged[clean] ?? 0) + top30[i][1]
    }

    const models = Object.entries(merged)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([model, count]) => ({ model, count }))

    const payload = { models }
    await setCache(svc, profile.dealership_id, CACHE_KEY, payload, CACHE_TTL_HOURS)

    return NextResponse.json(payload)
  } catch (err: any) {
    console.error('[top-models]', err)
    return NextResponse.json({ error: err?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}
