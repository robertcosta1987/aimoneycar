import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function getAI() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) }

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const status = err?.status ?? err?.statusCode
      if (status !== 429 && status !== 529) throw err
      if (attempt === maxRetries) break
      const retryAfter = err?.headers?.['retry-after']
      const waitMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 8_000)
        : Math.min(1000 * 2 ** attempt, 8_000)
      console.warn(`[Claude/widget] rate-limited (${status}), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, waitMs))
    }
  }
  throw lastErr
}
function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Slot logic ────────────────────────────────────────────────────────────────
// 9:00 – 18:00 BRT, 30 min appointments, 15 min gap between = 45 min cycle
// Max 2 concurrent appointments (2 salespeople)
const SLOT_STARTS_LOCAL = (() => {
  const slots: string[] = []
  let h = 9, m = 0
  while (h < 18) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    m += 45
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60 }
    if (h === 17 && m > 15) break  // last slot must end by 18:00 (17:15 + 30 = 17:45)
  }
  return slots
})()

// Returns slots with availability for a given date (YYYY-MM-DD)
async function getSlotsForDate(dealershipId: string, dateISO: string): Promise<{ time: string; available: boolean }[]> {
  // Fetch all non-cancelled appointments for that day (stored as timestamptz)
  // BRT = UTC-3, so 9:00 BRT = 12:00 UTC
  const dayStart = `${dateISO}T00:00:00-03:00`
  const dayEnd   = `${dateISO}T23:59:59-03:00`

  const { data: existing } = await getSvc()
    .from('agendamentos')
    .select('data_inicio, data_fim')
    .eq('dealership_id', dealershipId)
    .neq('status', 'cancelado')
    .gte('data_inicio', dayStart)
    .lte('data_inicio', dayEnd)

  const booked = existing || []

  return SLOT_STARTS_LOCAL.map(slotTime => {
    const [sh, sm] = slotTime.split(':').map(Number)
    const slotStartMs = Date.UTC(
      Number(dateISO.slice(0, 4)),
      Number(dateISO.slice(5, 7)) - 1,
      Number(dateISO.slice(8, 10)),
      sh + 3, sm   // BRT+3 = UTC
    )
    const slotEndMs = slotStartMs + 30 * 60 * 1000

    const count = booked.filter(a => {
      const aStart = new Date(a.data_inicio).getTime()
      const aEnd   = new Date(a.data_fim).getTime()
      return aStart < slotEndMs && aEnd > slotStartMs  // overlaps
    }).length

    return { time: slotTime, available: count < 2 }
  })
}

// Returns grouped slots for multiple days (for system prompt)
async function getSlotsNextDays(dealershipId: string, days = 7): Promise<Record<string, string[]>> {
  const now = new Date()
  const result: Record<string, string[]> = {}

  await Promise.all(
    Array.from({ length: days }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() + i)
      const iso = d.toISOString().split('T')[0]
      return getSlotsForDate(dealershipId, iso).then(slots => {
        const available = slots.filter(s => s.available).map(s => s.time)
        if (available.length > 0) result[iso] = available
      })
    })
  )

  return result
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { messages, visitorId, conversationId } = await req.json()

    const { data: dealership } = await getSvc()
      .from('dealerships')
      .select('id, name, city, state, address, phone, whatsapp')
      .eq('slug', params.slug)
      .single()

    if (!dealership) {
      return NextResponse.json({ error: 'Revenda não encontrada' }, { status: 404 })
    }

    // Get available vehicles
    const { data: vehicles } = await getSvc()
      .from('vehicles')
      .select('id, brand, model, version, year_model, color, mileage, sale_price, fuel, transmission')
      .eq('dealership_id', dealership.id)
      .eq('status', 'available')
      .order('created_at', { ascending: false })
      .limit(30)

    // Get available slots for next 7 days
    const slotsByDate = await getSlotsNextDays(dealership.id, 7)

    const systemPrompt = buildSystemPrompt(dealership, vehicles || [], slotsByDate)

    const tools: Anthropic.Tool[] = [
      {
        name: 'buscar_veiculos',
        description: 'Busca veículos disponíveis no estoque por marca, modelo, ano ou preço',
        input_schema: {
          type: 'object' as const,
          properties: {
            marca: { type: 'string', description: 'Marca do veículo (ex: Volkswagen, Fiat)' },
            modelo: { type: 'string', description: 'Modelo do veículo (ex: Gol, Onix)' },
            ano_min: { type: 'integer', description: 'Ano mínimo' },
            ano_max: { type: 'integer', description: 'Ano máximo' },
            preco_max: { type: 'number', description: 'Preço máximo em reais' },
          },
        },
      },
      {
        name: 'verificar_disponibilidade',
        description: 'Verifica horários disponíveis para agendamento em uma data específica',
        input_schema: {
          type: 'object' as const,
          properties: {
            data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
          },
          required: ['data'],
        },
      },
      {
        name: 'agendar_visita',
        description: 'Agenda uma visita ou test drive para o cliente',
        input_schema: {
          type: 'object' as const,
          properties: {
            nome: { type: 'string', description: 'Nome completo do cliente' },
            telefone: { type: 'string', description: 'Telefone com DDD' },
            email: { type: 'string', description: 'Email do cliente (opcional)' },
            data_hora: { type: 'string', description: 'Data e hora no formato YYYY-MM-DDTHH:MM (ex: 2024-04-15T14:00)' },
            tipo: { type: 'string', enum: ['visita', 'test_drive'], description: 'Tipo de agendamento' },
            veiculo_id: { type: 'string', description: 'ID do veículo específico (opcional)' },
            veiculo_interesse: { type: 'string', description: 'Descrição do veículo de interesse' },
          },
          required: ['nome', 'telefone', 'data_hora', 'tipo'],
        },
      },
      {
        name: 'qualificar_lead',
        description: 'Salva informações de qualificação do lead coletadas durante a conversa',
        input_schema: {
          type: 'object' as const,
          properties: {
            nome: { type: 'string' },
            telefone: { type: 'string' },
            email: { type: 'string' },
            orcamento_max: { type: 'number' },
            forma_pagamento: { type: 'string', enum: ['avista', 'financiamento', 'consorcio'] },
            tem_troca: { type: 'boolean' },
            urgencia: { type: 'string', enum: ['imediato', 'esta_semana', 'este_mes', 'pesquisando'] },
          },
        },
      },
    ]

    // Agentic loop
    const apiMessages: Anthropic.MessageParam[] = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }))

    let response = await callWithRetry(() => getAI().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: apiMessages,
    }))

    // Process one round of tool calls
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
      apiMessages.push({ role: 'assistant', content: response.content })

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== 'tool_use') return null
          const result = await executeTool(dealership.id, block.name, block.input as any, conversationId)
          return { type: 'tool_result' as const, tool_use_id: block.id, content: JSON.stringify(result) }
        })
      )

      apiMessages.push({
        role: 'user',
        content: toolResults.filter(Boolean) as Anthropic.ToolResultBlockParam[],
      })

      response = await callWithRetry(() => getAI().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: apiMessages,
      }))
    }

    const textBlock = response.content.find(b => b.type === 'text')
    const replyText = textBlock?.type === 'text' ? textBlock.text : 'Desculpe, não consegui processar sua mensagem.'

    await saveConversation(dealership.id, conversationId, visitorId, messages, replyText)

    return NextResponse.json({ message: replyText, conversationId }, { headers: CORS_HEADERS })
  } catch (err: any) {
    console.error('[Widget Chat]', err)
    return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500, headers: CORS_HEADERS })
  }
}

function buildSystemPrompt(dealership: any, vehicles: any[], slotsByDate: Record<string, string[]>): string {
  const now = new Date()
  const todayStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const todayISO = now.toISOString().split('T')[0]
  const tomorrowISO = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
  const afterTomorrowISO = new Date(now.getTime() + 2 * 86400000).toISOString().split('T')[0]

  const slotsText = Object.entries(slotsByDate).slice(0, 7).map(([date, times]) => {
    const d = new Date(date + 'T12:00:00')
    const label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    return `• ${label} (${date}): ${times.slice(0, 8).join(', ')}`
  }).join('\n') || 'Sem horários disponíveis no momento.'

  return `Você é o assistente virtual da ${dealership.name}, uma revenda de veículos seminovos${dealership.city ? ` em ${dealership.city}/${dealership.state || 'BR'}` : ''}.

DATA DE HOJE: ${todayStr} (${todayISO})
- "amanhã" = ${tomorrowISO}
- "depois de amanhã" = ${afterTomorrowISO}
Sempre use essas datas ao interpretar referências relativas de tempo.

OBJETIVO: Ajudar clientes a encontrar veículos e AGENDAR VISITAS/TEST DRIVES.

REGRAS:
- Respostas curtas (máximo 3 frases)
- Use 1-2 emojis por mensagem
- Nunca invente informações sobre veículos
- SEMPRE colete nome e telefone ANTES de confirmar agendamento
- Se o horário não estiver disponível, sugira alternativas da lista abaixo
- Ao agendar, use o formato exato: YYYY-MM-DDTHH:MM (ex: ${todayISO}T09:00)

HORÁRIO DE FUNCIONAMENTO: Segunda a Sábado, 09:00 – 18:00
DURAÇÃO DA VISITA: 30 minutos

HORÁRIOS DISPONÍVEIS (próximos 7 dias):
${slotsText}

VEÍCULOS DISPONÍVEIS (${vehicles.length} unidades):
${vehicles.slice(0, 15).map(v =>
  `• ${v.brand} ${v.model}${v.version ? ' ' + v.version : ''} ${v.year_model} - ${v.color || '?'} - ${v.mileage?.toLocaleString('pt-BR') ?? '?'} km - R$ ${v.sale_price?.toLocaleString('pt-BR') ?? '?'}`
).join('\n')}${vehicles.length > 15 ? `\n... e mais ${vehicles.length - 15} veículos` : ''}

INFORMAÇÕES:
- Endereço: ${dealership.address || 'Consulte nosso site'}
- Telefone: ${dealership.phone || dealership.whatsapp || 'Não informado'}

Fluxo ideal: cumprimentar → mostrar opções → qualificar → oferecer agendamento → confirmar nome/telefone → criar agendamento.`
}

async function executeTool(dealershipId: string, toolName: string, input: any, conversationId: string): Promise<any> {
  switch (toolName) {
    case 'buscar_veiculos': {
      let query = getSvc()
        .from('vehicles')
        .select('id, brand, model, version, year_model, color, mileage, sale_price, fuel, transmission')
        .eq('dealership_id', dealershipId)
        .eq('status', 'available')

      if (input.marca) query = query.ilike('brand', `%${input.marca}%`)
      if (input.modelo) query = query.ilike('model', `%${input.modelo}%`)
      if (input.ano_min) query = query.gte('year_model', input.ano_min)
      if (input.ano_max) query = query.lte('year_model', input.ano_max)
      if (input.preco_max) query = query.lte('sale_price', input.preco_max)

      const { data } = await query.limit(10)
      return { encontrados: data?.length || 0, veiculos: data || [] }
    }

    case 'verificar_disponibilidade': {
      const slots = await getSlotsForDate(dealershipId, input.data)
      const available = slots.filter(s => s.available).map(s => s.time)
      return {
        data: input.data,
        horarios_disponiveis: available,
        total: available.length,
      }
    }

    case 'agendar_visita': {
      // Parse as BRT (UTC-3)
      const localStr = input.data_hora.includes('T') ? input.data_hora : input.data_hora.replace(' ', 'T')
      const [datePart, timePart] = localStr.split('T')
      const [hh, mm] = (timePart || '09:00').split(':').map(Number)

      // Validate slot time
      const slotKey = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      if (!SLOT_STARTS_LOCAL.includes(slotKey)) {
        return {
          success: false,
          error: `Horário ${slotKey} não é um horário válido. Horários disponíveis: ${SLOT_STARTS_LOCAL.join(', ')}`,
        }
      }

      // Check availability
      const slots = await getSlotsForDate(dealershipId, datePart)
      const slot = slots.find(s => s.time === slotKey)
      if (!slot?.available) {
        const others = slots.filter(s => s.available).map(s => s.time)
        return {
          success: false,
          error: `Horário ${slotKey} em ${datePart} não está disponível.`,
          alternativas: others,
        }
      }

      // Build UTC timestamps (BRT = UTC-3)
      const startUTC = new Date(Date.UTC(
        Number(datePart.slice(0, 4)),
        Number(datePart.slice(5, 7)) - 1,
        Number(datePart.slice(8, 10)),
        hh + 3, mm
      ))
      const endUTC = new Date(startUTC.getTime() + 30 * 60 * 1000)

      const { data: inserted, error } = await getSvc()
        .from('agendamentos')
        .insert({
          dealership_id: dealershipId,
          data_inicio: startUTC.toISOString(),
          data_fim: endUTC.toISOString(),
          lead_nome: input.nome,
          lead_telefone: input.telefone,
          lead_email: input.email || null,
          tipo: input.tipo,
          vehicle_id: input.veiculo_id || null,
          veiculo_interesse: input.veiculo_interesse || null,
          origem: 'widget',
          dados_qualificacao: {},
          conversa_id: conversationId || null,
          status: 'agendado',
        })
        .select('id, data_inicio, data_fim, tipo, status')
        .single()

      if (error) {
        console.error('[agendar_visita] insert error:', error)
        return { success: false, error: 'Erro ao salvar agendamento.' }
      }

      if (conversationId) {
        await getSvc()
          .from('widget_conversas')
          .update({ agendamento_id: inserted.id, convertido: true })
          .eq('id', conversationId)
      }

      return {
        success: true,
        agendamento: {
          id: inserted.id,
          data: datePart,
          horario: slotKey,
          tipo: inserted.tipo,
        },
      }
    }

    case 'qualificar_lead': {
      if (!conversationId) return { success: false }

      const temperatura =
        input.urgencia === 'imediato' || input.urgencia === 'esta_semana' ? 'quente'
        : input.urgencia === 'este_mes' ? 'morno'
        : 'frio'

      await getSvc()
        .from('widget_conversas')
        .update({
          lead_nome: input.nome,
          lead_telefone: input.telefone,
          lead_email: input.email,
          qualificado: true,
          dados_qualificacao: input,
          temperatura,
        })
        .eq('id', conversationId)

      return { success: true }
    }

    default:
      return { error: 'Ferramenta desconhecida' }
  }
}

async function saveConversation(
  dealershipId: string,
  conversationId: string | undefined,
  visitorId: string,
  messages: any[],
  replyText: string
) {
  const allMessages = [
    ...messages,
    { role: 'assistant', content: replyText, timestamp: new Date().toISOString() },
  ]

  if (conversationId) {
    await getSvc()
      .from('widget_conversas')
      .update({ mensagens: allMessages })
      .eq('id', conversationId)
  } else {
    await getSvc().from('widget_conversas').insert({
      dealership_id: dealershipId,
      visitor_id: visitorId,
      mensagens: allMessages,
    })
  }
}
