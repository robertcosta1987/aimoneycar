/**
 * app/api/whatsapp/webhook/route.ts
 *
 * Receives WASenderAPI webhook events.
 * Configure webhook URL in WASenderAPI dashboard as:
 *   https://app.moneycar.ai/api/whatsapp/webhook?d=<dealership_id>
 *
 * The `d` query parameter identifies which dealership session to use.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendWhatsAppMessage,
  sendPresenceUpdate,
  markMessageAsRead,
  cleanPhoneNumber,
} from '@/lib/wasender/client'
import { generateAIResponse, shouldUseSmartModel } from '@/lib/ai/whatsapp-agent'
import type {
  WASenderWebhookPayload,
  WASenderIncomingMessage,
  WhatsAppSessao,
} from '@/types/whatsapp'

// Allow up to 60s for AI generation + tool calls (Vercel Pro)
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── POST: receive event ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const dealershipId = searchParams.get('d')

    const body: WASenderWebhookPayload = await req.json()
    console.log(`[Webhook] RAW PAYLOAD:`, JSON.stringify(body, null, 2))
    console.log(`[Webhook] event=${body.event} dealership=${dealershipId ?? 'unset'}`)

    switch (body.event) {
      case 'messages.received':
        if (body.data.messages) {
          // Handle both single message and array
          const msgs = Array.isArray(body.data.messages)
            ? body.data.messages
            : [body.data.messages]
          for (const msg of msgs) {
            await handleIncomingMessage(msg, dealershipId)
          }
        } else {
          console.log('[Webhook] messages.received but no data.messages — full data:', JSON.stringify(body.data))
        }
        break
      case 'session.status':
        await handleSessionStatus(body, dealershipId)
        break
      default:
        console.log(`[Webhook] unhandled event: ${body.event}`)
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[Webhook] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── GET: verify endpoint ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const challenge = new URL(req.url).searchParams.get('challenge')
  if (challenge) return new NextResponse(challenge)
  return NextResponse.json({ status: 'Webhook endpoint active' })
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleIncomingMessage(
  message: WASenderIncomingMessage,
  dealershipId: string | null
) {
  console.log('[Webhook] handleIncomingMessage raw:', JSON.stringify(message, null, 2))

  const { key, messageBody, message: msgContent, pushName } = message

  if (key?.fromMe) return  // skip own messages
  if (key?.remoteJid?.includes('@g.us')) return  // skip groups

  const phoneNumber = key?.cleanedSenderPn ?? cleanPhoneNumber(key?.remoteJid ?? '')
  // Use senderPn (phone JID) for replies when addressingMode is 'lid'
  const remoteJid = (key?.addressingMode === 'lid' && key?.senderPn)
    ? key.senderPn
    : key?.remoteJid ?? ''

  console.log(`[Webhook] from=${phoneNumber} text="${messageBody}" msgId=${key?.id}`)

  // ── Deduplication: skip if this wasender_msg_id was already processed ────────
  if (key?.id) {
    const { data: alreadyProcessed } = await supabase
      .from('whatsapp_mensagens')
      .select('id')
      .eq('wasender_msg_id', key.id)
      .maybeSingle()
    if (alreadyProcessed) {
      console.log(`[Webhook] duplicate msg ${key.id} — skipping`)
      return
    }
  }

  // Load session — filter by dealership only; don't rely on status field
  let sessaoQuery = supabase.from('whatsapp_sessoes').select('*')
  if (dealershipId) sessaoQuery = sessaoQuery.eq('dealership_id', dealershipId)
  const { data: sessao } = await sessaoQuery.single() as { data: WhatsAppSessao | null }

  if (!sessao) {
    console.error('[Webhook] no active session found')
    return
  }

  if (!sessao.ai_ativo) {
    console.log('[Webhook] AI disabled for this session')
    return
  }

  if (!isWithinBusinessHours(sessao)) {
    await sendOutOfHoursMessage(sessao, remoteJid)
    return
  }

  // Upsert conversation
  let conversa = await getOrCreateConversa(sessao.dealership_id, phoneNumber, remoteJid, pushName)
  if (!conversa) {
    console.error('[Webhook] failed to upsert conversation')
    return
  }

  // Parse and save incoming message BEFORE generating AI response
  // (so it's persisted even if AI fails)
  const { tipo, conteudo, midiaUrl, midiaTipo } = parseMessageContent(msgContent, messageBody)

  await supabase.from('whatsapp_mensagens').insert({
    conversa_id:    conversa.id,
    dealership_id:  sessao.dealership_id,
    wasender_msg_id: key.id,
    direcao:        'entrada',
    tipo,
    conteudo,
    midia_url:      midiaUrl ?? null,
    midia_tipo:     midiaTipo ?? null,
    status:         'entregue',
  })

  await supabase.from('whatsapp_conversas').update({
    total_mensagens:   conversa.total_mensagens + 1,
    ultima_mensagem_em: new Date().toISOString(),
    atualizado_em:     new Date().toISOString(),
  }).eq('id', conversa.id)

  // WA housekeeping
  await markMessageAsRead(sessao.wasender_api_key, remoteJid, key.id)
  await sendPresenceUpdate(sessao.wasender_api_key, remoteJid, 'composing')

  // Generate AI response — pass wasenderMsgId so context builder excludes it from history
  const aiResult = await generateAIResponse({
    dealershipId:       sessao.dealership_id,
    conversaId:         conversa.id,
    userMessage:        conteudo,
    wasenderMsgId:      key.id,
    customSystemPrompt: sessao.prompt_sistema ?? undefined,
    useSmartModel:      shouldUseSmartModel(conteudo),
  })

  await sendPresenceUpdate(sessao.wasender_api_key, remoteJid, 'paused')

  // Save outgoing message record
  const { data: outMsg } = await supabase
    .from('whatsapp_mensagens')
    .insert({
      conversa_id:   conversa.id,
      dealership_id: sessao.dealership_id,
      direcao:       'saida',
      tipo:          'texto',
      conteudo:      aiResult.message,
      status:        'pendente',
    })
    .select('id')
    .single()

  // Send via WASenderAPI
  const sendResult = await sendWhatsAppMessage({
    apiKey: sessao.wasender_api_key,
    to:     remoteJid,
    text:   aiResult.message,
  })

  await supabase.from('whatsapp_mensagens').update({
    wasender_msg_id: sendResult.data?.msgId?.toString() ?? null,
    status:          sendResult.success ? 'enviado' : 'falhou',
    erro:            sendResult.error ?? null,
    enviado_em:      sendResult.success ? new Date().toISOString() : null,
  }).eq('id', outMsg?.id)

  // Update conversation intent
  await supabase.from('whatsapp_conversas').update({
    ultima_intencao: aiResult.intent,
    total_mensagens: conversa.total_mensagens + 2,
    atualizado_em:   new Date().toISOString(),
  }).eq('id', conversa.id)

  // Alert if human transfer requested
  if (aiResult.shouldTransferToHuman) {
    await supabase.from('ai_alerts').insert({
      dealership_id: sessao.dealership_id,
      type:          'warning',
      title:         'WhatsApp: atendimento requer humano',
      message:       `Cliente ${conversa.nome_contato ?? conversa.telefone} solicitou atendimento humano: "${conteudo.slice(0, 120)}"`,
      action:        'Abrir conversa',
      action_data:   { conversa_id: conversa.id },
      is_read:       false,
      is_dismissed:  false,
    })
  }

  console.log(`[Webhook] response sent to ${phoneNumber} (${aiResult.intent})`)
}

async function handleSessionStatus(payload: WASenderWebhookPayload, dealershipId: string | null) {
  console.log('[Webhook] session status event:', JSON.stringify(payload))
  if (!dealershipId) return

  const status = (payload.data as any)?.status === 'connected' ? 'conectado' : 'desconectado'
  await supabase.from('whatsapp_sessoes')
    .update({ status, ultimo_status_check: new Date().toISOString() })
    .eq('dealership_id', dealershipId)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateConversa(
  dealershipId: string,
  phoneNumber: string,
  remoteJid: string,
  pushName?: string
) {
  const { data: existing } = await supabase
    .from('whatsapp_conversas')
    .select('*')
    .eq('dealership_id', dealershipId)
    .eq('telefone_limpo', phoneNumber)
    .single()

  if (existing) {
    if (pushName && !existing.nome_contato) {
      await supabase.from('whatsapp_conversas')
        .update({ nome_contato: pushName })
        .eq('id', existing.id)
      return { ...existing, nome_contato: pushName }
    }
    return existing
  }

  const { data: created } = await supabase
    .from('whatsapp_conversas')
    .insert({
      dealership_id:  dealershipId,
      telefone:       `+${phoneNumber}`,
      telefone_limpo: phoneNumber,
      nome_contato:   pushName ?? null,
      remote_jid:     remoteJid,
      status:         'ativo',
    })
    .select()
    .single()

  return created
}

function parseMessageContent(
  msgContent: WASenderIncomingMessage['message'],
  fallbackBody: string
): { tipo: string; conteudo: string; midiaUrl?: string; midiaTipo?: string } {
  if (msgContent.imageMessage) {
    return { tipo: 'imagem', conteudo: msgContent.imageMessage.caption || '[Imagem]',
      midiaUrl: msgContent.imageMessage.url, midiaTipo: msgContent.imageMessage.mimetype }
  }
  if (msgContent.videoMessage) {
    return { tipo: 'video', conteudo: msgContent.videoMessage.caption || '[Vídeo]',
      midiaUrl: msgContent.videoMessage.url, midiaTipo: msgContent.videoMessage.mimetype }
  }
  if (msgContent.audioMessage) {
    return { tipo: 'audio', conteudo: '[Áudio]',
      midiaUrl: msgContent.audioMessage.url, midiaTipo: msgContent.audioMessage.mimetype }
  }
  if (msgContent.documentMessage) {
    return { tipo: 'documento', conteudo: `[Documento: ${msgContent.documentMessage.fileName}]`,
      midiaUrl: msgContent.documentMessage.url, midiaTipo: msgContent.documentMessage.mimetype }
  }
  return { tipo: 'texto', conteudo: msgContent.conversation || fallbackBody }
}

function isWithinBusinessHours(sessao: WhatsAppSessao): boolean {
  if (!sessao.horario_atendimento_inicio || !sessao.horario_atendimento_fim) return true
  const br = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const cur = br.getHours() * 100 + br.getMinutes()
  const [sh, sm] = sessao.horario_atendimento_inicio.split(':').map(Number)
  const [eh, em] = sessao.horario_atendimento_fim.split(':').map(Number)
  return cur >= (sh * 100 + sm) && cur <= (eh * 100 + em)
}

async function sendOutOfHoursMessage(sessao: WhatsAppSessao, remoteJid: string) {
  const msg = sessao.mensagem_fora_horario ??
    `Olá! 👋 Obrigado por entrar em contato! Nosso horário de atendimento é das ${sessao.horario_atendimento_inicio} às ${sessao.horario_atendimento_fim}. Em breve retornaremos! 🚗`
  await sendWhatsAppMessage({ apiKey: sessao.wasender_api_key, to: remoteJid, text: msg })
}

