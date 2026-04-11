import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkSessionStatus } from '@/lib/wasender/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/session?dealershipId=xxx
export async function GET(req: NextRequest) {
  const dealershipId = new URL(req.url).searchParams.get('dealershipId')
  if (!dealershipId) return NextResponse.json({ error: 'dealershipId required' }, { status: 400 })

  const { data: sessao } = await supabase
    .from('whatsapp_sessoes')
    .select('*')
    .eq('dealership_id', dealershipId)
    .single()

  if (!sessao) return NextResponse.json({ configured: false })

  // Best-effort status check — session is treated as active if credentials are saved
  const status = await checkSessionStatus(sessao.wasender_api_key)
  if (status.phone || status.name) {
    await supabase.from('whatsapp_sessoes').update({
      status:              'conectado',
      telefone:            status.phone ?? sessao.telefone,
      nome:                status.name  ?? sessao.nome,
      ultimo_status_check: new Date().toISOString(),
    }).eq('id', sessao.id)
  }

  return NextResponse.json({
    configured:  true,
    connected:   true, // session exists = treat as active; webhook updates real status
    phone:       status.phone ?? sessao.telefone,
    name:        status.name  ?? sessao.nome,
    sessionId:   sessao.wasender_session_id,
    aiEnabled:   sessao.ai_ativo,
    modelo:      sessao.modelo_padrao,
    businessHours: {
      start: sessao.horario_atendimento_inicio,
      end:   sessao.horario_atendimento_fim,
    },
    webhookUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/api/whatsapp/webhook?d=${dealershipId}`,
  })
}

// POST /api/whatsapp/session — create / update session config
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    dealershipId,
    wasenderSessionId,
    wasenderApiKey,
    aiEnabled,
    modelo,
    systemPrompt,
    businessHoursStart,
    businessHoursEnd,
    outOfHoursMessage,
  } = body

  if (!dealershipId || !wasenderSessionId || !wasenderApiKey) {
    return NextResponse.json(
      { error: 'dealershipId, wasenderSessionId and wasenderApiKey are required' },
      { status: 400 }
    )
  }

  // Status check is best-effort — don't block setup if it fails
  const status = await checkSessionStatus(wasenderApiKey)

  const { data, error } = await supabase
    .from('whatsapp_sessoes')
    .upsert({
      dealership_id:              dealershipId,
      wasender_session_id:        wasenderSessionId,
      wasender_api_key:           wasenderApiKey,
      status:                     status.connected ? 'conectado' : 'conectado', // assume active; real status via webhook
      telefone:                   status.phone ?? null,
      nome:                       status.name  ?? null,
      ai_ativo:                   aiEnabled ?? true,
      modelo_padrao:              modelo ?? 'claude-haiku-4-5-20251001',
      prompt_sistema:             systemPrompt ?? null,
      horario_atendimento_inicio: businessHoursStart ?? '08:00',
      horario_atendimento_fim:    businessHoursEnd   ?? '18:00',
      mensagem_fora_horario:      outOfHoursMessage  ?? null,
      updated_at:                 new Date().toISOString(),
    }, { onConflict: 'dealership_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    session: data,
    connected: true,
    webhookUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/api/whatsapp/webhook?d=${dealershipId}`,
  })
}

// PUT /api/whatsapp/session — update individual settings
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { dealershipId, ...updates } = body
  if (!dealershipId) return NextResponse.json({ error: 'dealershipId required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.aiEnabled       !== undefined) patch.ai_ativo                   = updates.aiEnabled
  if (updates.modelo)                        patch.modelo_padrao               = updates.modelo
  if (updates.systemPrompt    !== undefined) patch.prompt_sistema              = updates.systemPrompt
  if (updates.businessHoursStart)            patch.horario_atendimento_inicio  = updates.businessHoursStart
  if (updates.businessHoursEnd)              patch.horario_atendimento_fim     = updates.businessHoursEnd
  if (updates.outOfHoursMessage !== undefined) patch.mensagem_fora_horario     = updates.outOfHoursMessage

  const { error } = await supabase
    .from('whatsapp_sessoes')
    .update(patch)
    .eq('dealership_id', dealershipId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/whatsapp/session?dealershipId=xxx — remove session config
export async function DELETE(req: NextRequest) {
  const dealershipId = new URL(req.url).searchParams.get('dealershipId')
  if (!dealershipId) return NextResponse.json({ error: 'dealershipId required' }, { status: 400 })

  const { error } = await supabase
    .from('whatsapp_sessoes')
    .delete()
    .eq('dealership_id', dealershipId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
