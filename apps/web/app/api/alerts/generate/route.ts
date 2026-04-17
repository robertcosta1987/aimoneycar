import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { generateDailyAlerts } from '@/lib/ai/alerts'
import type { Vehicle, Expense } from '@/types'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel Pro allows up to 60s

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = createServiceClient()

    const { data: profile } = await svc
      .from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    const dealId = profile.dealership_id

    const { data: dealership } = await svc
      .from('dealerships').select('id, name').eq('id', dealId).single()
    if (!dealership) return NextResponse.json({ error: 'Dealership not found' }, { status: 404 })

    // Step 1: fetch all available vehicles (lightweight — no expenses)
    const vehicles = await fetchAll<Vehicle>(
      svc.from('vehicles')
        .select('id, brand, model, year_model, plate, days_in_stock, purchase_price, sale_price, status, color, mileage, fuel, transmission, dealership_id, external_id, created_at, updated_at')
        .eq('dealership_id', dealId)
        .eq('status', 'available')
    )

    // Step 2: identify candidate vehicle IDs before touching expenses
    const criticalIds = vehicles
      .filter(v => (v.days_in_stock ?? 0) > 90)
      .sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0))
      .slice(0, 10)
      .map(v => v.id)

    const attentionIds = vehicles
      .filter(v => (v.days_in_stock ?? 0) >= 46 && (v.days_in_stock ?? 0) <= 90)
      .sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0))
      .slice(0, 10)
      .map(v => v.id)

    const candidateIds = [...new Set([...criticalIds, ...attentionIds])]

    // Step 3: only fetch expenses for those candidate vehicles (not all 500k+)
    let expenses: Expense[] = []
    if (candidateIds.length > 0) {
      expenses = await fetchAll<Expense>(
        svc.from('expenses')
          .select('id, vehicle_id, amount, category, dealership_id')
          .in('vehicle_id', candidateIds)
      )
    }

    const alerts = await generateDailyAlerts(dealId, dealership.name, vehicles, expenses)

    if (alerts.length === 0) {
      return NextResponse.json({ generated: 0, message: 'Nenhuma situação de alerta encontrada na frota.' })
    }

    const { error } = await svc.from('ai_alerts').insert(alerts as any)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ generated: alerts.length })
  } catch (err: any) {
    console.error('[alerts/generate]', err)
    return NextResponse.json(
      { error: err?.message ?? 'Erro desconhecido ao gerar alertas' },
      { status: 500 }
    )
  }
}
