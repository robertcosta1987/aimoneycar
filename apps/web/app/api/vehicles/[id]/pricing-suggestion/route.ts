/**
 * GET /api/vehicles/[id]/pricing-suggestion
 *
 * Returns pricing intelligence for a single vehicle based on this dealership's
 * own historical sales of the same brand + model (year ±2).
 *
 * Response shape:
 *   { hasEnoughData: false, count: number }
 *   { hasEnoughData: true, count, avgSalePrice, medianSalePrice, minPrice,
 *     maxPrice, avgDaysToSell, suggestion: 'aligned'|'above'|'below'|'missing' }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id)
      return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    const dealId = profile.dealership_id

    // Fetch the target vehicle
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id, brand, model, year_model, sale_price')
      .eq('id', params.id)
      .eq('dealership_id', dealId)
      .single()

    if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

    // Query comps: sold vehicles, same brand + model, year ±2
    const yearMin = (vehicle.year_model ?? 2000) - 2
    const yearMax = (vehicle.year_model ?? 9999) + 2

    let { data: comps } = await supabase
      .from('vehicles')
      .select('sale_price, days_in_stock')
      .eq('dealership_id', dealId)
      .eq('status', 'sold')
      .ilike('brand', vehicle.brand)
      .ilike('model', vehicle.model)
      .gte('year_model', yearMin)
      .lte('year_model', yearMax)
      .gt('sale_price', 0)
      .order('sale_date', { ascending: false })
      .limit(50)

    // Broaden to all years if not enough comps
    if (!comps || comps.length < 3) {
      const { data: broader } = await supabase
        .from('vehicles')
        .select('sale_price, days_in_stock')
        .eq('dealership_id', dealId)
        .eq('status', 'sold')
        .ilike('brand', vehicle.brand)
        .ilike('model', vehicle.model)
        .gt('sale_price', 0)
        .order('sale_date', { ascending: false })
        .limit(50)
      comps = broader
    }

    const count = comps?.length ?? 0

    if (count < 3) {
      return NextResponse.json({ hasEnoughData: false, count })
    }

    const prices      = comps!.map(c => c.sale_price as number)
    const daysArr     = comps!.map(c => c.days_in_stock as number).filter(d => d > 0)
    const avgSalePrice    = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
    const medianSalePrice = Math.round(median(prices))
    const minPrice        = Math.min(...prices)
    const maxPrice        = Math.max(...prices)
    const avgDaysToSell   = daysArr.length
      ? Math.round(daysArr.reduce((s, d) => s + d, 0) / daysArr.length)
      : null

    const currentPrice = vehicle.sale_price as number | null

    let suggestion: 'aligned' | 'above' | 'below' | 'missing'
    if (!currentPrice || currentPrice === 0) {
      suggestion = 'missing'
    } else if (currentPrice > avgSalePrice * 1.12) {
      suggestion = 'above'
    } else if (currentPrice < avgSalePrice * 0.88) {
      suggestion = 'below'
    } else {
      suggestion = 'aligned'
    }

    return NextResponse.json({
      hasEnoughData: true,
      count,
      avgSalePrice,
      medianSalePrice,
      minPrice,
      maxPrice,
      avgDaysToSell,
      suggestion,
      currentPrice,
    })
  } catch (err: any) {
    console.error('[pricing-suggestion]', err)
    return NextResponse.json({ error: err?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}
