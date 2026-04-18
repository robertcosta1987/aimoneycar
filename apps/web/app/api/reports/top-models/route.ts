/**
 * GET /api/reports/top-models
 *
 * Fetches sold vehicles from the past year, sends the raw model list to Claude,
 * and returns the top 10 models (normalized and grouped) with their sale counts.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = createServiceClient()
    const { data: profile } = await svc
      .from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: sold } = await svc
      .from('vehicles')
      .select('model')
      .eq('dealership_id', profile.dealership_id)
      .eq('status', 'sold')
      .not('model', 'is', null)
      .gte('sale_date', oneYearAgo)
      .limit(1000)

    if (!sold || sold.length === 0) {
      return NextResponse.json({ models: [] })
    }

    // Pre-group by exact model string to reduce tokens
    const counts: Record<string, number> = {}
    for (const v of sold) {
      const m = (v.model ?? '').trim()
      if (m) counts[m] = (counts[m] ?? 0) + 1
    }

    const lines = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([model, count]) => `${model}: ${count}`)
      .join('\n')

    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const message = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Você é um analista de uma revenda de veículos brasileira.
Abaixo está uma lista de modelos de veículos vendidos no último ano com suas quantidades.
Agrupe variações do mesmo modelo (ex: "Gol 1.0", "Gol G5", "Gol Trend" → "Gol").
Retorne os top 10 modelos com maior volume de vendas (somando as variações).
Responda SOMENTE com um JSON array, sem explicação. Formato:
[{"model":"Gol","count":15},{"model":"Corolla","count":12}]

Dados:
${lines}`,
      }],
    })

    const text = (message.content[0] as any).text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return NextResponse.json({ models: [] })

    const models = JSON.parse(match[0]) as { model: string; count: number }[]

    return NextResponse.json({ models: models.slice(0, 10) })
  } catch (err: any) {
    console.error('[top-models]', err)
    return NextResponse.json({ error: err?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}
