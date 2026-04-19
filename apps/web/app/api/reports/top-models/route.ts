/**
 * GET /api/reports/top-models
 *
 * Queries sold vehicles from the past 6 months, sends unique model names
 * to Claude to normalize (e.g. "Gol 1.0 MPI" → "Gol"), then returns
 * the top 10 by aggregated sales count. Cached for 36 hours.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCache, setCache } from '@/lib/ai/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'top-models-v3'
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

    // Pre-aggregate by raw model string
    const rawCounts: Record<string, number> = {}
    for (const v of sold) {
      const key = (v.model ?? '').trim()
      if (key) rawCounts[key] = (rawCounts[key] ?? 0) + 1
    }

    const uniqueModels = Object.keys(rawCounts)

    // ── Ask Claude to normalize model names only ─────────────────────────────
    // Send: unique raw model names → get back: { "Gol 1.0 MPI": "Gol", ... }
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const message = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Você é um especialista em veículos brasileiros.
Abaixo há uma lista de nomes de modelos de veículos como aparecem num sistema de revendas.
Para cada nome, retorne APENAS o nome comercial curto do modelo (ex: "Gol", "Palio", "Civic", "Corolla", "HB20").
Não inclua versão, motorização, ano ou geração.

Responda SOMENTE com um objeto JSON no formato:
{"nome original": "nome limpo", ...}

Modelos:
${uniqueModels.map(m => `"${m}"`).join('\n')}`,
      }],
    })

    const text = (message.content[0] as { type: string; text: string }).text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    let nameMap: Record<string, string> = {}
    if (jsonMatch) {
      try { nameMap = JSON.parse(jsonMatch[0]) } catch { /* fall through */ }
    }

    // Re-aggregate using normalized names, fall back to original if AI missed it
    const normalizedCounts: Record<string, number> = {}
    for (const [raw, count] of Object.entries(rawCounts)) {
      const clean = (nameMap[raw] ?? raw).trim()
      normalizedCounts[clean] = (normalizedCounts[clean] ?? 0) + count
    }

    const models = Object.entries(normalizedCounts)
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
