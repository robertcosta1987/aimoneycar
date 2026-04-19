/**
 * lib/ai/whatsapp-agent.ts
 *
 * Customer-facing WhatsApp AI agent.
 * Mirrors the widget chat agent: same tools, same prompt structure,
 * same data sources (dealership info, vehicles, available slots from DB).
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { AIResponse, AIVehicle } from '@/types/whatsapp'

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
      console.warn(`[Claude/whatsapp] rate-limited (${status}), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`)
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

// ─── Slot logic (mirrors widget exactly) ──────────────────────────────────────
// 9:00–18:00 BRT, 30-min appointments, 15-min gap = 45-min cycle, max 2 concurrent

const SLOT_STARTS_BRT = (() => {
  const slots: string[] = []
  let h = 9, m = 0
  while (h < 18) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    m += 45
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60 }
    if (h === 17 && m > 15) break
  }
  return slots
})()

async function getSlotsForDate(dealershipId: string, dateISO: string): Promise<{ time: string; available: boolean }[]> {
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

  return SLOT_STARTS_BRT.map(slotTime => {
    const [sh, sm] = slotTime.split(':').map(Number)
    const slotStartMs = Date.UTC(
      Number(dateISO.slice(0, 4)),
      Number(dateISO.slice(5, 7)) - 1,
      Number(dateISO.slice(8, 10)),
      sh + 3, sm  // BRT+3 = UTC
    )
    const slotEndMs = slotStartMs + 30 * 60 * 1000
    const count = booked.filter(a => {
      const aStart = new Date(a.data_inicio).getTime()
      const aEnd   = new Date(a.data_fim).getTime()
      return aStart < slotEndMs && aEnd > slotStartMs
    }).length
    return { time: slotTime, available: count < 2 }
  })
}

// ─── Tools (mirrors widget) ────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_veiculos',
    description: 'Busca veículos disponíveis no estoque por marca, modelo, ano ou preço',
    input_schema: {
      type: 'object' as const,
      properties: {
        marca:     { type: 'string', description: 'Marca do veículo (ex: Volkswagen, Fiat)' },
        modelo:    { type: 'string', description: 'Modelo do veículo (ex: Gol, Onix)' },
        ano_min:   { type: 'integer', description: 'Ano mínimo' },
        ano_max:   { type: 'integer', description: 'Ano máximo' },
        preco_max: { type: 'number', description: 'Preço máximo em reais' },
      },
    },
  },
  {
    name: 'proximos_dias_disponiveis',
    description: 'Retorna os próximos dias com horários disponíveis para agendamento. USE SEMPRE este tool antes de sugerir datas ao cliente — nunca invente datas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        quantidade_dias: { type: 'integer', description: 'Quantos dias verificar a partir de hoje (padrão: 7)' },
      },
    },
  },
  {
    name: 'verificar_disponibilidade',
    description: 'Verifica horários disponíveis para agendamento em uma data específica (use o campo "data_iso" retornado por proximos_dias_disponiveis)',
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
    description: 'Agenda uma visita ou test drive para o cliente. Use quando o cliente confirmar data e horário.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome:              { type: 'string', description: 'Nome completo do cliente' },
        telefone:          { type: 'string', description: 'Telefone do cliente com DDD' },
        data_hora:         { type: 'string', description: 'Data e hora ISO (ex: 2024-04-15T14:00:00)' },
        tipo:              { type: 'string', enum: ['visita', 'test_drive'], description: 'Tipo de agendamento' },
        veiculo_interesse: { type: 'string', description: 'Veículo de interesse' },
      },
      required: ['nome', 'telefone', 'data_hora', 'tipo'],
    },
  },
  {
    name: 'cancelar_agendamento',
    description: 'Cancela um agendamento existente do cliente',
    input_schema: {
      type: 'object' as const,
      properties: {
        agendamento_id: { type: 'string', description: 'ID do agendamento' },
        motivo:         { type: 'string', description: 'Motivo do cancelamento' },
      },
      required: ['agendamento_id'],
    },
  },
]

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, any>,
  dealershipId: string,
  conversaId: string,
  customerPhone: string,
): Promise<string> {
  try {
    let result: any

    switch (name) {
      case 'buscar_veiculos': {
        let query = getSvc()
          .from('vehicles')
          .select('id, brand, model, version, year_model, color, mileage, sale_price, fuel, transmission')
          .eq('dealership_id', dealershipId)
          .eq('status', 'available')

        if (input.marca)     query = query.ilike('brand', `%${input.marca}%`)
        if (input.modelo)    query = query.ilike('model', `%${input.modelo}%`)
        if (input.ano_min)   query = query.gte('year_model', input.ano_min)
        if (input.ano_max)   query = query.lte('year_model', input.ano_max)
        if (input.preco_max) query = query.lte('sale_price', input.preco_max)

        const { data } = await query.limit(10)
        result = { encontrados: data?.length || 0, veiculos: data || [] }
        break
      }

      case 'proximos_dias_disponiveis': {
        const dias = Math.min(input.quantidade_dias || 7, 14)
        const TZ  = { timeZone: 'America/Sao_Paulo' }
        const now = new Date()

        // Build candidate dates starting from tomorrow in BRT
        const candidates: { iso: string; label: string }[] = []
        for (let i = 1; candidates.length < dias && i <= dias + 7; i++) {
          const iso = new Date(now.getTime() + i * 86400000).toLocaleDateString('en-CA', TZ)
          const d   = new Date(iso + 'T12:00:00Z')
          const weekday = d.toLocaleDateString('pt-BR', { ...TZ, weekday: 'long' })
          const mmdd    = iso.slice(5).replace('-', '/')
          candidates.push({ iso, label: `${weekday} (${mmdd})` })
        }

        // Check availability using the same logic as the widget
        const results = await Promise.all(
          candidates.map(async (c) => {
            const slots   = await getSlotsForDate(dealershipId, c.iso)
            const horarios = slots.filter(s => s.available).map(s => s.time)
            return { ...c, data_iso: c.iso, horarios, total: horarios.length }
          })
        )

        const comDisponibilidade = results.filter(r => r.total > 0)
        result = {
          instrucao: 'Use o campo "label" de cada dia ao apresentar opções ao cliente. Não altere nem recalcule as datas.',
          dias: comDisponibilidade.length > 0 ? comDisponibilidade : results,
        }
        break
      }

      case 'verificar_disponibilidade': {
        const slots   = await getSlotsForDate(dealershipId, input.data)
        const available = slots.filter(s => s.available).map(s => s.time)
        const TZ      = { timeZone: 'America/Sao_Paulo' }
        const dateObj = new Date(input.data + 'T12:00:00Z')
        const diaSemana  = dateObj.toLocaleDateString('pt-BR', { ...TZ, weekday: 'long' })
        const mmdd       = (input.data as string).slice(5).replace('-', '/')
        result = {
          data: input.data,
          label: `${diaSemana} (${mmdd})`,
          horarios_disponiveis: available,
          total: available.length,
          instrucao: `Ao apresentar esta data, use EXATAMENTE: "${diaSemana} (${mmdd})"`,
        }
        break
      }

      case 'agendar_visita': {
        const localStr = (input.data_hora as string).includes('T') ? input.data_hora : (input.data_hora as string).replace(' ', 'T')
        const [datePart, timePart] = localStr.split('T')
        const [hh, mm] = (timePart || '09:00').split(':').map(Number)
        const slotKey  = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`

        // Validate slot time against the same set the widget uses
        if (!SLOT_STARTS_BRT.includes(slotKey)) {
          result = {
            success: false,
            error: `Horário ${slotKey} não é válido. Horários disponíveis: ${SLOT_STARTS_BRT.join(', ')}`,
          }
          break
        }

        // Check availability the same way the widget does
        const slots = await getSlotsForDate(dealershipId, datePart)
        const slot  = slots.find(s => s.time === slotKey)
        if (!slot?.available) {
          result = {
            success: false,
            error: `Horário ${slotKey} em ${datePart} não está disponível.`,
            alternativas: slots.filter(s => s.available).map(s => s.time),
            instrucao: 'Ofereça as alternativas ao cliente.',
          }
          break
        }

        // Build UTC timestamps (BRT = UTC-3) — same as widget
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
            dealership_id:     dealershipId,
            data_inicio:       startUTC.toISOString(),
            data_fim:          endUTC.toISOString(),
            lead_nome:         input.nome,
            lead_telefone:     input.telefone || customerPhone,
            lead_email:        null,
            tipo:              input.tipo,
            veiculo_interesse: input.veiculo_interesse || null,
            origem:            'whatsapp',
            dados_qualificacao: {},
            conversa_id:       conversaId,
            status:            'agendado',
          })
          .select('id, data_inicio, data_fim, tipo, status')
          .single()

        if (error) {
          result = { success: false, error: error.message }
        } else {
          const TZ       = { timeZone: 'America/Sao_Paulo' }
          const dateObj  = new Date(datePart + 'T12:00:00Z')
          const diaSemana = dateObj.toLocaleDateString('pt-BR', { ...TZ, weekday: 'long' })
          const mmdd      = datePart.slice(5).replace('-', '/')
          result = {
            success: true,
            agendamento: { id: inserted.id, data: datePart, horario: slotKey, tipo: inserted.tipo },
            label: `${diaSemana} (${mmdd}) às ${slotKey}`,
          }
        }
        break
      }

      case 'cancelar_agendamento': {
        const { data } = await getSvc().rpc('cancelar_agendamento', {
          p_agendamento_id: input.agendamento_id,
          p_motivo:         input.motivo || null,
        })
        result = data
        break
      }

      default:
        result = { error: `Ferramenta desconhecida: ${name}` }
    }

    return JSON.stringify(result)
  } catch (e: any) {
    return JSON.stringify({ error: e.message })
  }
}

// ─── Context builder ──────────────────────────────────────────────────────────

interface WhatsAppContext {
  dealershipId:        string
  conversaId:          string
  customerPhone:       string
  customerName?:       string | null
  dealership:          { name: string; address: string; phone: string; city: string; state: string } | null
  availableVehicles:   AIVehicle[]
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

async function buildContext(
  dealershipId:  string,
  conversaId:    string,
  excludeMsgId?: string,
): Promise<WhatsAppContext> {
  let historyQuery = getSvc()
    .from('whatsapp_mensagens')
    .select('direcao, conteudo, criado_em')
    .eq('conversa_id', conversaId)
  if (excludeMsgId) {
    historyQuery = historyQuery.not('wasender_msg_id', 'eq', excludeMsgId)
  }
  historyQuery = historyQuery.order('criado_em', { ascending: false }).limit(8)

  const [
    { data: messages },
    { data: vehicles },
    { data: conversa },
    { data: dealership },
  ] = await Promise.all([
    historyQuery,

    getSvc()
      .from('vehicles')
      .select('id, brand, model, version, year_model, color, mileage, sale_price, fuel, transmission')
      .eq('dealership_id', dealershipId)
      .eq('status', 'available')
      .not('sale_price', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30),

    getSvc()
      .from('whatsapp_conversas')
      .select('nome_contato, telefone, telefone_limpo')
      .eq('id', conversaId)
      .single(),

    getSvc()
      .from('dealerships')
      .select('name, address, phone, whatsapp, city, state')
      .eq('id', dealershipId)
      .single(),
  ])

  const availableVehicles: AIVehicle[] = (vehicles ?? []).map(v => ({
    id:      v.id,
    brand:   v.brand,
    model:   v.model,
    year:    v.year_model,
    price:   v.sale_price ?? 0,
    mileage: v.mileage,
    color:   v.color,
  }))

  return {
    dealershipId,
    conversaId,
    customerPhone:  conversa?.telefone_limpo ?? '',
    customerName:   conversa?.nome_contato,
    dealership:     dealership ? {
      name:    dealership.name,
      address: dealership.address || '',
      phone:   dealership.phone || dealership.whatsapp || '',
      city:    dealership.city  || '',
      state:   dealership.state || '',
    } : null,
    availableVehicles,
    conversationHistory: ((messages ?? []).reverse()).map(m => ({
      role:    m.direcao === 'entrada' ? 'user' as const : 'assistant' as const,
      content: m.conteudo,
    })),
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  ctx:          WhatsAppContext,
  customPrompt?: string,
  horaInicio?:   string,
  horaFim?:      string,
): string {
  // All dates in BRT (America/Sao_Paulo) — Vercel runs in UTC, which can be
  // a day ahead of Brazil late at night, causing the AI to compute wrong weekdays.
  // We pre-compute the next 7 days so the AI never has to calculate dates itself.
  // This date block is always appended — even when a custom prompt is used —
  // because without it the AI falls back to its training data calendar (wrong year).
  const now      = new Date()
  const TZ       = { timeZone: 'America/Sao_Paulo' }
  const todayISO = now.toLocaleDateString('en-CA', TZ)   // YYYY-MM-DD in BRT
  const todayStr = now.toLocaleDateString('pt-BR', { ...TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() + i * 86400000)
    const iso     = d.toLocaleDateString('en-CA', TZ)
    const weekday = d.toLocaleDateString('pt-BR', { ...TZ, weekday: 'long' })
    const display = d.toLocaleDateString('pt-BR', { ...TZ, day: '2-digit', month: '2-digit' })
    return `- "${weekday}" = ${iso} (${display})`
  }).join('\n')

  const tomorrow = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA', TZ)
  const afterTom = new Date(now.getTime() + 2 * 86400000).toLocaleDateString('en-CA', TZ)

  const dateBlock = `

DATA DE HOJE: ${todayStr} (${todayISO})

PRÓXIMOS 7 DIAS (use EXATAMENTE estas datas — nunca calcule por conta própria):
${next7Days}

- "amanhã" = ${tomorrow}
- "depois de amanhã" = ${afterTom}
IMPORTANTE: Ao mencionar um dia da semana (ex: "segunda-feira"), use SEMPRE a data da tabela acima. Nunca escreva uma data diferente da listada.`

  if (customPrompt) return customPrompt + dateBlock

  const d = ctx.dealership
  const storeName    = d?.name    || 'nossa loja'
  const storeAddress = d?.address || ''
  const storePhone   = d?.phone   || ''

  const vehicleList = ctx.availableVehicles.slice(0, 20)
    .map(v => {
      const version = (v as any).version ? ` ${(v as any).version}` : ''
      const km      = v.mileage ? ` — ${Number(v.mileage).toLocaleString('pt-BR')} km` : ''
      const cor     = v.color   ? ` — ${v.color}` : ''
      const trans   = (v as any).transmission ? ` — ${(v as any).transmission}` : ''
      return `• ${v.brand} ${v.model}${version} ${v.year} — R$ ${Number(v.price).toLocaleString('pt-BR')}${km}${cor}${trans}`
    })
    .join('\n') || 'Nenhum veículo com preço disponível no momento.'

  return `Você é o assistente virtual da ${storeName}, uma revenda de veículos seminovos.

DADOS DA LOJA:
📍 ${storeAddress}
📞 ${storePhone}
🕐 Horário de atendimento presencial: ${horaInicio && horaFim ? `${horaInicio} às ${horaFim}` : '09:00 às 18:00'}
⏰ Slots de agendamento disponíveis: ${SLOT_STARTS_BRT.join(', ')}
${dateBlock}

${ctx.customerName ? `CLIENTE: ${ctx.customerName}` : ''}

VEÍCULOS DISPONÍVEIS (${ctx.availableVehicles.length} unidades):
${vehicleList}

OBJETIVO: Ajudar o cliente a encontrar o veículo certo e AGENDAR UMA VISITA ou TEST DRIVE.

PERSONALIDADE:
- Educado, simpático e prestativo
- Linguagem descontraída e brasileira
- SEMPRE em português do Brasil
- Respostas CURTAS e objetivas — é WhatsApp, não e-mail! (máximo 3-4 linhas)
- Use 1-2 emojis por mensagem, com moderação

FLUXO IDEAL:
1. Cumprimente e pergunte o que o cliente procura
2. Sugira 1-3 veículos que se encaixam no perfil
3. Tire dúvidas sobre preço, km, condições
4. Convide para visita presencial ou test drive
5. Ofereça horários disponíveis
6. Confirme o agendamento com nome e veículo de interesse

REGRAS:
- Você responde 24 horas por dia, 7 dias por semana — NUNCA diga que está fora do horário
- Ao sugerir horários, ofereça apenas slots dentro do horário de atendimento acima
- NUNCA invente veículos fora da lista acima
- Para financiamento: trabalhamos com os principais bancos, simule na loja
- Se não souber responder, ofereça falar com um vendedor: ${storePhone}
- Mencione o endereço ao sugerir a visita
- NUNCA mencione datas ou dias da semana sem antes chamar proximos_dias_disponiveis — suas datas internas estão desatualizadas
- Ao sugerir opções de agenda, chame proximos_dias_disponiveis e apresente o campo "label" de cada dia exatamente como retornado
- Se o cliente escolher um dia, chame verificar_disponibilidade com o campo "data_iso" correspondente para confirmar os horários
- Se o cliente confirmar data e horário, chame agendar_visita imediatamente
- IMPORTANTE: só confirme o agendamento ao cliente se agendar_visita retornar success=true. Se retornar success=false, use proximos_dias_disponiveis para oferecer alternativas`
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface GenerateResponseParams {
  dealershipId:        string
  conversaId:          string
  userMessage:         string
  wasenderMsgId?:      string
  customSystemPrompt?: string
  useSmartModel?:      boolean
  businessHoursStart?: string
  businessHoursEnd?:   string
}

export async function generateAIResponse(params: GenerateResponseParams): Promise<AIResponse> {
  const {
    dealershipId, conversaId, userMessage, wasenderMsgId,
    customSystemPrompt, useSmartModel, businessHoursStart, businessHoursEnd,
  } = params

  const ctx          = await buildContext(dealershipId, conversaId, wasenderMsgId)
  const systemPrompt = buildSystemPrompt(ctx, customSystemPrompt, businessHoursStart, businessHoursEnd)
  const model        = useSmartModel ? 'claude-3-5-sonnet-20241022' : 'claude-3-5-haiku-20241022'

  const apiMessages: Anthropic.MessageParam[] = ctx.conversationHistory.slice(-10).map(m => ({
    role:    m.role,
    content: m.content,
  }))
  apiMessages.push({ role: 'user', content: userMessage })

  try {
    let responseText = 'Desculpe, não consegui processar sua mensagem no momento.'
    const MAX_ITERATIONS = 5
    let iterations = 0

    while (iterations < MAX_ITERATIONS) {
      iterations++

      const response = await callWithRetry(() => getAI().messages.create({
        model,
        max_tokens: 1024,
        system:     systemPrompt,
        tools:      TOOLS,
        messages:   apiMessages,
      }))

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(c => c.type === 'text')
        if (textBlock?.type === 'text') responseText = textBlock.text
        break
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
        apiMessages.push({ role: 'assistant', content: response.content })

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            if (block.type !== 'tool_use') return null
            const result = await executeTool(
              block.name,
              block.input as Record<string, any>,
              dealershipId,
              conversaId,
              ctx.customerPhone,
            )
            return { type: 'tool_result' as const, tool_use_id: block.id, content: result }
          })
        )

        apiMessages.push({
          role:    'user',
          content: toolResults.filter(Boolean) as Anthropic.ToolResultBlockParam[],
        })
        continue
      }

      // Unexpected stop — grab whatever text is available
      const textBlock = response.content.find(c => c.type === 'text')
      if (textBlock?.type === 'text') responseText = textBlock.text
      break
    }

    return {
      message:               responseText,
      intent:                extractIntent(userMessage),
      vehicleIds:            extractVehicleReferences(responseText, ctx.availableVehicles),
      shouldTransferToHuman: shouldTransfer(userMessage),
    }
  } catch (e: unknown) {
    console.error('[WhatsApp AI] generation error:', e)
    const phone = ctx.dealership?.phone || ''
    return {
      message:               `Desculpe, estou com uma instabilidade agora 😅 Por favor, ligue para *${phone}* e nossa equipe te atende!`,
      intent:                'erro',
      vehicleIds:            [],
      shouldTransferToHuman: true,
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractIntent(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('agenda') || m.includes('visita') || m.includes('test drive') || m.includes('agendar')) return 'agendamento'
  if (m.includes('preço') || m.includes('valor') || m.includes('quanto'))        return 'consulta_preco'
  if (m.includes('financ') || m.includes('parcela') || m.includes('entrada'))    return 'financiamento'
  if (m.includes('troca') || m.includes('aceita meu'))                           return 'troca_veiculo'
  if (m.includes('disponível') || m.includes('tem ') || m.includes('estoque'))   return 'consulta_estoque'
  if (m.includes('endereço') || m.includes('onde fica') || m.includes('localiz')) return 'localizacao'
  if (m.includes('horário') || m.includes('funciona') || m.includes('abre'))     return 'horario'
  if (m.includes('cancelar') || m.includes('remarcar') || m.includes('desmarcar')) return 'cancelamento'
  return 'conversa_geral'
}

function extractVehicleReferences(response: string, vehicles: AIVehicle[]): string[] {
  return vehicles
    .filter(v => new RegExp(`${v.brand}.*${v.model}`, 'i').test(response))
    .map(v => v.id)
}

function shouldTransfer(msg: string): boolean {
  const triggers = [
    'falar com humano', 'falar com pessoa', 'falar com vendedor', 'atendente',
    'gerente', 'reclamação', 'não estou satisfeito', 'advogado', 'procon',
  ]
  return triggers.some(t => msg.toLowerCase().includes(t))
}

export function shouldUseSmartModel(msg: string): boolean {
  const complex = ['financiamento', 'parcela', 'entrada', 'comparar', 'diferença', 'melhor opção', 'recomendar', 'troca']
  return complex.some(w => msg.toLowerCase().includes(w))
}
