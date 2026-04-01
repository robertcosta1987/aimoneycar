import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getDealershipId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('dealership_id')
    .eq('id', userId)
    .single()
  return data?.dealership_id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dealershipId = await getDealershipId(supabase, user.id)
  if (!dealershipId) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  let query = supabase
    .from('vehicles')
    .select('*')
    .eq('dealership_id', dealershipId)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') query = query.eq('status', status)
  if (search) query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%,plate.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dealershipId = await getDealershipId(supabase, user.id)
  if (!dealershipId) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('vehicles')
    .insert({ ...body, dealership_id: dealershipId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
