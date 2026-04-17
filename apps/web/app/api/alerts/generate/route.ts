import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { generateDailyAlerts } from '@/lib/ai/alerts'
import type { Vehicle, Expense } from '@/types'
export const dynamic = 'force-dynamic'

export async function POST() {
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

  const [vehicles, expenses] = await Promise.all([
    fetchAll<Vehicle>(svc.from('vehicles').select('*').eq('dealership_id', dealId).eq('status', 'available')),
    fetchAll<Expense>(svc.from('expenses').select('*').eq('dealership_id', dealId)),
  ])

  const alerts = await generateDailyAlerts(dealId, dealership.name, vehicles, expenses)

  if (alerts.length === 0) {
    return NextResponse.json({ generated: 0 })
  }

  const { error } = await svc.from('ai_alerts').insert(alerts as any)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ generated: alerts.length })
}
