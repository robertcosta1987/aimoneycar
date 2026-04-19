/**
 * GET /api/reports/top-models
 *
 * Returns the top 10 best-selling models in the past 6 months,
 * grouped directly by the model field (no AI required).
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCache, setCache } from '@/lib/ai/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'top-models-v2'
const CACHE_TTL_HOURS = 6

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

    if (!sold || sold.length === 0) {
      return NextResponse.json({ models: [] })
    }

    // Group by model name (case-insensitive, trimmed)
    const counts: Record<string, number> = {}
    for (const v of sold) {
      const key = (v.model ?? '').trim().toUpperCase()
      if (key) counts[key] = (counts[key] ?? 0) + 1
    }

    const models = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([model, count]) => ({
        // Capitalize nicely: "GOL" → "Gol"
        model: model.charAt(0) + model.slice(1).toLowerCase(),
        count,
      }))

    const payload = { models }

    await setCache(svc, profile.dealership_id, CACHE_KEY, payload, CACHE_TTL_HOURS)

    return NextResponse.json(payload)
  } catch (err: any) {
    console.error('[top-models]', err)
    return NextResponse.json({ error: err?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}
