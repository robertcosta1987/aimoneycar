import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) return NextResponse.json({ vehicles: [], customers: [] })

    const svc = createServiceClient()
    const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ vehicles: [], customers: [] })

    const D = profile.dealership_id
    const like = `%${q}%`

    const [{ data: vehicles }, { data: customers }] = await Promise.all([
      svc
        .from('vehicles')
        .select('id, brand, model, version, year_model, plate, status, purchase_price, sale_price')
        .eq('dealership_id', D)
        .or(`brand.ilike.${like},model.ilike.${like},plate.ilike.${like},version.ilike.${like}`)
        .order('days_in_stock', { ascending: false })
        .limit(6),

      svc
        .from('customers')
        .select('id, name, phone, city')
        .eq('dealership_id', D)
        .or(`name.ilike.${like},phone.ilike.${like}`)
        .order('created_at', { ascending: false })
        .limit(4),
    ])

    return NextResponse.json({ vehicles: vehicles ?? [], customers: customers ?? [] })
  } catch {
    return NextResponse.json({ vehicles: [], customers: [] })
  }
}
