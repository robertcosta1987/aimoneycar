import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
  if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const { importId, counts, errors } = await req.json()
  const D = profile.dealership_id

  const totalImported = Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0)

  await svc
    .from('imports')
    .update({
      status: (errors as string[]).length > 0 && (counts.vehicles ?? 0) === 0 ? 'error' : 'complete',
      records_imported: totalImported,
      errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importId)

  try { await svc.rpc('refresh_days_in_stock', { d_id: D }) } catch { /* optional */ }

  return NextResponse.json({ ok: true, totalImported })
}
