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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
        let query = supabase
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
        const TZ = { timeZone: 'America/Sao_Paulo' }
        const now = new Date()

        // Build list of upcoming dates in BRT
        const candidates: { iso: string; label: string; display: string }[] = []
        for (let i = 1; i <= dias + 7; i++) { // check extra days in case some are fully booked
          const d = new Date(Date.UTC(
            ...(() => {
              // Get the BRT date for "today + i days" safely
              const t = new Date(now.getTime() + i * 86400000)
              const s = t.toLocaleDateString('en-CA', TZ) // YYYY-MM-DD
              const [y, m, dd] = s.split('-').map(Number)
              return [y, m - 1, dd] as [number, number, number]
            })(),
            12, 0, 0,
          ))
          const iso = d.toLocaleDateString('en-CA', TZ)
          const weekday = d.toLocaleDateString('pt-BR', { ...TZ, weekday: 'long' })
          const mmdd = iso.slice(5).replace('-', '/')
          candidates.push({ iso, label: `${weekday} (${mmdd})`, display: `${weekday}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` })
          if (candidates.length >= dias) break
        }

        // Check availability for each day in parallel
        const results = await Promise.all(
          candidates.map(async (c) => {
            const { data: slots } = await supabase.rpc('get_slots_disponiveis', {
              p_dealership_id:  dealershipId,
              p_data_inicio:    c.iso,
              p_data_fim:       c.iso,
              p_salesperson_id: null,
            })
            const available = (slots || []).filter((s: any) => s.disponivel)
            return { ...c, data_iso: c.iso, horarios: available.map((s: any) => (s.horario as string).slice(0, 5)), total: available.length }
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
        const { data: slots } = await supabase.rpc('get_slots_disponiveis', {
          p_dealership_id:  dealershipId,
          p_data_inicio:    input.data,
          p_data_fim:       input.data,
          p_salesperson_id: null,
        })
        const available = (slots || []).filter((s: any) => s.disponivel)
        // Compute the day label server-side in BRT so the AI never has to
        // convert a YYYY-MM-DD string to a weekday name (it gets that wrong).
        const [y, m, d] = (input.data as string).split('-').map(Number)
        const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)) // noon UTC avoids any TZ shift
        const TZ = { timeZone: 'America/Sao_Paulo' }
        const diaSemana = dateObj.toLocaleDateString('pt-BR', { ...TZ, weekday: 'long' })
        const dataDisplay = dateObj.toLocaleDateString('pt-BR', { ...TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
        result = {
          data: input.data,
          dia_semana: diaSemana,
          data_formatada: dataDisplay,
          label: `${diaSemana}, ${dataDisplay}`,
          horarios_disponiveis: available.map((s: any) => (s.horario as string).slice(0, 5)),
          total: available.length,
          instrucao: `Ao apresentar esta data ao cliente, use EXATAMENTE: "${diaSemana} (${(input.data as string).slice(5).replace('-', '/')})" — não calcule o dia da semana por conta própria.`,
        }
        break
      }

      case 'agendar_visita': {
        const dataInicio = new Date(input.data_hora)
        const dataFim    = new Date(dataInicio.getTime() + 30 * 60 * 1000)

        const { data, error } = await supabase.rpc('criar_agendamento', {
          p_dealership_id:      dealershipId,
          p_data_inicio:        dataInicio.toISOString(),
          p_data_fim:           dataFim.toISOString(),
          p_lead_nome:          input.nome,
          p_lead_telefone:      input.telefone || customerPhone,
          p_lead_email:         null,
          p_tipo:               input.tipo,
          p_vehicle_id:         null,
          p_veiculo_interesse:  input.veiculo_interesse || null,
          p_salesperson_id:     null,
          p_origem:             'whatsapp',
          p_dados_qualificacao: '{}',
          p_conversa_id:        conversaId,
        })
        if (error) {
          result = { success: false, error: error.message }
        } else if (!data?.success) {
          // Slot unavailable — suggest checking availability instead
          result = {
            success: false,
            error: data?.error || 'Horário não disponível.',
            instrucao: 'Use verificar_disponibilidade para consultar horários livres e ofereça alternativas ao cliente.',
          }
        } else {
          // Add server-computed date label to the success response so AI echoes it correctly
          const dtISO = (input.data_hora as string).slice(0, 10)
          const [y2, m2, d2] = dtISO.split('-').map(Number)
          const dtObj = new Date(Date.UTC(y2, m2 - 1, d2, 12, 0, 0))
          const TZ2 = { timeZone: 'America/Sao_Paulo' }
          const diaSemana2 = dtObj.toLocaleDateString('pt-BR', { ...TZ2, weekday: 'long' })
          const dataDisplay2 = dtObj.toLocaleDateString('pt-BR', { ...TZ2, day: '2-digit', month: '2-digit', year: 'numeric' })
          result = {
            ...data,
            dia_semana: diaSemana2,
            data_formatada: dataDisplay2,
            label: `${diaSemana2}, ${dataDisplay2}`,
          }
        }
        break
      }

      case 'cancelar_agendamento': {
        const { data } = await supabase.rpc('cancelar_agendamento', {
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
  let historyQuery = supabase
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

    supabase
      .from('vehicles')
      .select('id, brand, model, version, year_model, color, mileage, sale_price, fuel, transmission')
      .eq('dealership_id', dealershipId)
      .eq('status', 'available')
      .not('sale_price', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30),

    supabase
      .from('whatsapp_conversas')
      .select('nome_contato, telefone, telefone_limpo')
      .eq('id', conversaId)
      .single(),

    supabase
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
🕐 Horário de atendimento presencial: ${horaInicio && horaFim ? `${horaInicio} às ${horaFim}` : '08:00 às 18:00'}
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
  const model        = useSmartModel ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

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

      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system:     systemPrompt,
        tools:      TOOLS,
        messages:   apiMessages,
      })

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
