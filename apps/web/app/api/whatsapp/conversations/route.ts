import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/conversations?dealershipId=&status=&page=&limit=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dealershipId = searchParams.get('dealershipId')
  const status       = searchParams.get('status')
  const page  = parseInt(searchParams.get('page')  || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  if (!dealershipId) return NextResponse.json({ error: 'dealershipId required' }, { status: 400 })

  let query = supabase
    .from('whatsapp_conversas')
    .select('*', { count: 'exact' })
    .eq('dealership_id', dealershipId)
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
    .range((page - 1) * limit, page * limit - 1)

  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    conversations: data ?? [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      pages: Math.ceil((count ?? 0) / limit),
    },
  })
}
