import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

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
      + '-' + Date.now().toString(36)  // ensure uniqueness

    const { data: dealership, error: dealErr } = await supabase
      .from('dealerships')
      .insert({ name: dealershipName, slug } as any)
      .select('id')
      .single()

    if (dealErr) {
      console.error('Dealership insert error:', dealErr)
      return NextResponse.json({ error: dealErr.message }, { status: 400 })
    }

    const dealershipId = (dealership as any).id

    // Check if user record already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single()

    let userErr: any = null

    if (existingUser) {
      // User exists — just update the dealership_id
      const { error } = await supabase
        .from('users')
        .update({ dealership_id: dealershipId } as any)
        .eq('id', userId)
      userErr = error
    } else {
      // New user — insert full record
      const { error } = await supabase.from('users').insert({
        id: userId,
        dealership_id: dealershipId,
        name,
        email,
        role: 'owner',
      } as any)
      userErr = error
    }

    if (userErr) {
      console.error('User write error:', userErr)
      await supabase.from('dealerships').delete().eq('id', dealershipId)
      return NextResponse.json({ error: userErr.message }, { status: 400 })
    }

    // Verify the write actually persisted
    const { data: verify } = await supabase
      .from('users')
      .select('id, dealership_id')
      .eq('id', userId)
      .single()

    return NextResponse.json({
      dealershipId,
      userDealershipId: (verify as any)?.dealership_id,
      verified: (verify as any)?.dealership_id === dealershipId,
    })
  } catch (err) {
    console.error('Register API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
