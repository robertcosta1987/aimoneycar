import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/whatsapp/conversations/[id]?page=&limit=
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url)
  const page  = parseInt(searchParams.get('page')  || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  const { data: conversa, error: convErr } = await getSvc()
    .from('whatsapp_conversas')
    .select('*')
    .eq('id', params.id)
    .single()

  if (convErr || !conversa) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const { data: mensagens, count } = await getSvc()
    .from('whatsapp_mensagens')
    .select('*', { count: 'exact' })
    .eq('conversa_id', params.id)
    .order('criado_em', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  return NextResponse.json({
    conversation: conversa,
    messages:     (mensagens ?? []).reverse(),
    pagination: {
      page,
      limit,
      total: count ?? 0,
      pages: Math.ceil((count ?? 0) / limit),
    },
  })
}

// PATCH /api/whatsapp/conversations/[id] — update status or notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json()
  const allowed = ['status', 'nome_contato', 'contexto_resumo', 'veiculo_interesse_id']
  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  const { error } = await getSvc()
    .from('whatsapp_conversas')
    .update(patch)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
