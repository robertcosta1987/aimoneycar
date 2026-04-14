import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function DELETE() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = createServiceClient()
    const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    const D = profile.dealership_id

    // Delete in dependency order (children before parents)
    const steps = [
      svc.from('expenses').delete().eq('dealership_id', D),
      svc.from('vehicle_fines').delete().eq('dealership_id', D),
      svc.from('financings').delete().eq('dealership_id', D),
      svc.from('ai_alerts').delete().eq('dealership_id', D),
    ]
    await Promise.all(steps)

    // Then parent tables
    await svc.from('vehicles').delete().eq('dealership_id', D)
    await svc.from('customers').delete().eq('dealership_id', D)
    await Promise.all([
      svc.from('orders').delete().eq('dealership_id', D),
      svc.from('imports').delete().eq('dealership_id', D),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[clear-data]', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
