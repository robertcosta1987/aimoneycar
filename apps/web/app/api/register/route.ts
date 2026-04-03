import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { userId, name, email, dealershipName } = await req.json() as {
      userId: string
      name: string
      email: string
      dealershipName: string
    }

    if (!userId || !name || !email || !dealershipName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Create dealership (service role bypasses RLS)
    const slug = dealershipName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    const { data: dealership, error: dealErr } = await supabase
      .from('dealerships')
      .insert({ name: dealershipName, slug } as any)
      .select('id')
      .single()

    if (dealErr) {
      console.error('Dealership insert error:', dealErr)
      return NextResponse.json({ error: dealErr.message }, { status: 400 })
    }

    // Create user record linked to dealership
    const { error: userErr } = await supabase.from('users').insert({
      id: userId,
      dealership_id: (dealership as any).id,
      name,
      email,
      role: 'owner',
    } as any)

    if (userErr) {
      console.error('User insert error:', userErr)
      // Roll back dealership
      await supabase.from('dealerships').delete().eq('id', (dealership as any).id)
      return NextResponse.json({ error: userErr.message }, { status: 400 })
    }

    return NextResponse.json({ dealershipId: (dealership as any).id })
  } catch (err) {
    console.error('Register API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
