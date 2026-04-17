import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/wasender/client'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/whatsapp/send
// Body: { conversaId, message, mediaUrl?, mediaType? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { conversaId, message, mediaUrl, mediaType } = body

  if (!conversaId || !message) {
    return NextResponse.json({ error: 'conversaId and message required' }, { status: 400 })
  }

  const { data: conversa } = await getSvc()
    .from('whatsapp_conversas')
    .select('*')
    .eq('id', conversaId)
    .single()

  if (!conversa) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const { data: sessao } = await getSvc()
    .from('whatsapp_sessoes')
    .select('*')
    .eq('dealership_id', conversa.dealership_id)
    .single()

  if (!sessao) {
    return NextResponse.json({ error: 'WhatsApp session not configured' }, { status: 400 })
  }

  // Save outgoing message
  const { data: outMsg } = await getSvc()
    .from('whatsapp_mensagens')
    .insert({
      conversa_id:   conversaId,
      dealership_id: conversa.dealership_id,
      direcao:       'saida',
      tipo:          mediaUrl ? (mediaType ?? 'imagem') : 'texto',
      conteudo:      message,
      midia_url:     mediaUrl ?? null,
      status:        'pendente',
    })
    .select('id')
    .single()

  const to = conversa.remote_jid ?? `+${conversa.telefone_limpo}`

  const sendParams: Parameters<typeof sendWhatsAppMessage>[0] = {
    apiKey: sessao.wasender_api_key,
    to,
    ...(mediaUrl
      ? { [mediaType ?? 'image']: mediaUrl, caption: message }
      : { text: message }),
  }

  const result = await sendWhatsAppMessage(sendParams)

  await getSvc().from('whatsapp_mensagens').update({
    wasender_msg_id: result.data?.msgId?.toString() ?? null,
    status:          result.success ? 'enviado' : 'falhou',
    erro:            result.error ?? null,
    enviado_em:      result.success ? new Date().toISOString() : null,
  }).eq('id', outMsg?.id)

  await getSvc().from('whatsapp_conversas').update({
    ultima_mensagem_em: new Date().toISOString(),
    total_mensagens:    conversa.total_mensagens + 1,
    atualizado_em:      new Date().toISOString(),
  }).eq('id', conversaId)

  return NextResponse.json({
    success:   result.success,
    messageId: outMsg?.id,
    error:     result.error,
  })
}
