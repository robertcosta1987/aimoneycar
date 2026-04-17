import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateDailyAlerts } from '@/lib/ai/alerts'
import type { Vehicle, Expense } from '@/types'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

    // 1. Fast count of all available vehicles (no row scan)
    const { count: totalAvailable } = await svc
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('dealership_id', dealId)
      .eq('status', 'available')

    // 2. Fetch only the worst aged vehicles — single query, no pagination
    const { data: agedVehicles } = await svc
      .from('vehicles')
      .select('id, brand, model, year_model, plate, days_in_stock, purchase_price, sale_price, status, dealership_id')
      .eq('dealership_id', dealId)
      .eq('status', 'available')
      .gt('days_in_stock', 45)
      .order('days_in_stock', { ascending: false })
      .limit(25)

    const candidates = agedVehicles ?? []
    const candidateIds = candidates.map(v => v.id)

    // 3. Fetch expenses only for those vehicles
    const { data: expenses } = candidateIds.length > 0
      ? await svc.from('expenses')
          .select('id, vehicle_id, amount, category, dealership_id')
          .in('vehicle_id', candidateIds)
      : { data: [] as Expense[] }

    // Build a vehicles array that includes total counts for context
    // Pass agedVehicles as the "vehicles" list — generateDailyAlerts already
    // filters by status === 'available', and all of these qualify
    const alerts = await generateDailyAlerts(
      dealId,
      dealership.name,
      (candidates as unknown as Vehicle[]),
      (expenses ?? []) as Expense[],
      totalAvailable ?? 0
    )

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
