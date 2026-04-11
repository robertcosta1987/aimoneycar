/**
 * lib/ai/whatsapp-agent.ts
 *
 * Customer-facing WhatsApp AI agent.
 * Goal: understand what the customer is looking for, match with available
 * vehicles, and schedule an in-person visit or test drive.
 *
 * Uses an agentic tool-use loop (same as internal chat) with calendar access.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { AIResponse, AIVehicle } from '@/types/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Calendar tools (same as internal chat) ───────────────────────────────────

const CALENDAR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'calendar_get_slots',
    description: 'Busca horários disponíveis para agendamento. Use sempre que o cliente quiser saber quando pode vir à loja ou quando for sugerir um horário para visita ou test drive.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_inicio: { type: 'string', description: 'Data início no formato YYYY-MM-DD' },
        data_fim:    { type: 'string', description: 'Data fim no formato YYYY-MM-DD. Se omitido, usa data_inicio.' },
      },
      required: ['data_inicio'],
    },
  },
  {
    name: 'calendar_create_appointment',
    description: 'Cria um agendamento para o cliente. Use quando o cliente confirmar data e horário para visita ou test drive.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_nome:         { type: 'string', description: 'Nome completo do cliente' },
        lead_telefone:     { type: 'string', description: 'Telefone do cliente com DDD' },
        data_hora:         { type: 'string', description: 'Data e hora no formato ISO (ex: 2024-04-15T14:00:00)' },
        tipo:              { type: 'string', enum: ['visita', 'test_drive', 'avaliacao_troca', 'entrega'], description: 'Tipo de agendamento' },
        veiculo_interesse: { type: 'string', description: 'Veículo de interesse mencionado pelo cliente' },
      },
      required: ['lead_nome', 'lead_telefone', 'data_hora', 'tipo'],
    },
  },
  {
    name: 'calendar_list_appointments',
    description: 'Consulta agendamentos existentes. Use para verificar se o cliente já tem algo marcado ou para confirmar um agendamento.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_inicio: { type: 'string', description: 'Data início no formato YYYY-MM-DD' },
        data_fim:    { type: 'string', description: 'Data fim no formato YYYY-MM-DD' },
      },
      required: ['data_inicio'],
    },
  },
  {
    name: 'calendar_update_status',
    description: 'Atualiza o status de um agendamento (confirmar, cancelar, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        agendamento_id: { type: 'string', description: 'ID do agendamento' },
        status:         { type: 'string', enum: ['confirmado', 'cancelado', 'no_show'], description: 'Novo status' },
        motivo:         { type: 'string', description: 'Motivo (obrigatório para cancelado)' },
      },
      required: ['agendamento_id', 'status'],
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
      case 'calendar_get_slots': {
        const endDate = input.data_fim || input.data_inicio
        const { data, error } = await supabase.rpc('get_slots_disponiveis', {
          p_dealership_id:  dealershipId,
          p_data_inicio:    input.data_inicio,
          p_data_fim:       endDate,
          p_salesperson_id: null,
        })
        if (error) { result = { error: error.message }; break }
        const grouped: Record<string, any> = {}
        for (const slot of (data || []).filter((s: any) => s.disponivel)) {
          if (!grouped[slot.data]) grouped[slot.data] = { data: slot.data, dia_nome: slot.dia_nome, horarios: [] }
          grouped[slot.data].horarios.push((slot.horario as string).slice(0, 5))
        }
        result = {
          dias_disponiveis: Object.values(grouped),
          total_slots: (data || []).filter((s: any) => s.disponivel).length,
        }
        break
      }

      case 'calendar_create_appointment': {
        const dataInicio = new Date(input.data_hora)
        const dataFim    = new Date(dataInicio.getTime() + 30 * 60 * 1000)
        const { data, error } = await supabase.rpc('criar_agendamento', {
          p_dealership_id:     dealershipId,
          p_data_inicio:       dataInicio.toISOString(),
          p_data_fim:          dataFim.toISOString(),
          p_lead_nome:         input.lead_nome,
          p_lead_telefone:     input.lead_telefone || customerPhone,
          p_lead_email:        null,
          p_tipo:              input.tipo,
          p_vehicle_id:        null,
          p_veiculo_interesse: input.veiculo_interesse || null,
          p_salesperson_id:    null,
          p_origem:            'whatsapp',
          p_dados_qualificacao: '{}',
          p_conversa_id:       conversaId,
        })
        if (error) { result = { error: error.message }; break }
        result = data
        break
      }

      case 'calendar_list_appointments': {
        const endDate = input.data_fim || input.data_inicio
        const { data, error } = await supabase.rpc('get_calendario_dashboard', {
          p_dealership_id:  dealershipId,
          p_data_inicio:    input.data_inicio,
          p_data_fim:       endDate,
          p_salesperson_id: null,
        })
        if (error) { result = { error: error.message }; break }
        result = {
          total: (data || []).length,
          agendamentos: (data || []).map((a: any) => ({
            id:        a.id,
            cliente:   a.lead_nome,
            data_hora: a.data_inicio,
            tipo:      a.tipo,
            veiculo:   a.veiculo_interesse,
            status:    a.status,
          })),
        }
        break
      }

      case 'calendar_update_status': {
        if (input.status === 'cancelado') {
          const { data } = await supabase.rpc('cancelar_agendamento', {
            p_agendamento_id: input.agendamento_id,
            p_motivo:         input.motivo || null,
          })
          result = data
        } else {
          const { error } = await supabase
            .from('agendamentos')
            .update({ status: input.status, updated_at: new Date().toISOString() })
            .eq('id', input.agendamento_id)
          result = error ? { error: error.message } : { success: true }
        }
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
  availableVehicles:   AIVehicle[]
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

async function buildContext(
  dealershipId:  string,
  conversaId:    string,
  excludeMsgId?: string,
): Promise<WhatsAppContext> {
  // Build the history query, excluding the just-saved incoming message.
  // Without this, the current message appears twice in the API call
  // (once from history, once as the explicit userMessage param), which
  // causes two consecutive user-role messages and an Anthropic API error.
  let historyQuery = supabase
    .from('whatsapp_mensagens')
    .select('direcao, conteudo, criado_em')
    .eq('conversa_id', conversaId)
  if (excludeMsgId) {
    historyQuery = historyQuery.not('wasender_msg_id', 'eq', excludeMsgId)
  }
  historyQuery = historyQuery.order('criado_em', { ascending: false }).limit(12)

  const [
    { data: messages },
    { data: vehicles },
    { data: conversa },
  ] = await Promise.all([
    historyQuery,

    supabase
      .from('vehicles')
      .select('id, brand, model, year_model, sale_price, mileage, color, fuel')
      .eq('dealership_id', dealershipId)
      .eq('status', 'available')
      .not('sale_price', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30),

    supabase
      .from('whatsapp_conversas')
      .select('nome_contato, telefone, telefone_limpo, ultima_intencao')
      .eq('id', conversaId)
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
    customerPhone:       conversa?.telefone_limpo ?? '',
    customerName:        conversa?.nome_contato,
    availableVehicles,
    conversationHistory: ((messages ?? []).reverse()).map(m => ({
      role:    m.direcao === 'entrada' ? 'user' as const : 'assistant' as const,
      content: m.conteudo,
    })),
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: WhatsAppContext, customPrompt?: string, horaInicio?: string, horaFim?: string): string {
  if (customPrompt) return customPrompt

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const vehicleList = ctx.availableVehicles.slice(0, 20)
    .map(v => {
      const km = v.mileage ? ` — ${Number(v.mileage).toLocaleString('pt-BR')} km` : ''
      const cor = v.color ? ` — ${v.color}` : ''
      return `• ${v.brand} ${v.model} ${v.year} — R$ ${Number(v.price).toLocaleString('pt-BR')}${km}${cor}`
    })
    .join('\n') || 'Nenhum veículo com preço disponível no momento.'

  return `Você é o assistente virtual da nossa revenda de veículos seminovos. Seu nome é *Moneycar AI*.

MISSÃO: Entender o que o cliente procura, encontrar o melhor veículo para ele no nosso estoque e agendar uma visita presencial ou test drive.

DADOS DA LOJA:
📍 Avenida Roberto de Almeida Vinhas 1029 - Guilhermina, Praia Grande - SP
📞 (13) 99114-9999
📅 Hoje: ${today}
🕐 Horário de atendimento presencial: ${horaInicio && horaFim ? `${horaInicio} às ${horaFim}` : '08:00 às 18:00'}

${ctx.customerName ? `CLIENTE: ${ctx.customerName}` : ''}

VEÍCULOS DISPONÍVEIS NO ESTOQUE:
${vehicleList}

PERSONALIDADE:
- Sempre educado, simpático e prestativo
- Linguagem descontraída e brasileira (não muito formal)
- SEMPRE em português do Brasil
- Respostas CURTAS e objetivas — é WhatsApp, não e-mail! (máximo 3-4 linhas por mensagem)
- Use 1-2 emojis por mensagem, com moderação

FLUXO IDEAL:
1. Cumprimente e pergunte o que o cliente procura (tipo de veículo, uso, orçamento)
2. Sugira 1-3 veículos do estoque que melhor se encaixam
3. Tire dúvidas sobre preço, km, condições
4. Convide para uma visita presencial ou test drive
5. Consulte a agenda e ofereça horários disponíveis
6. Confirme o agendamento com nome e veículo de interesse

REGRAS:
- Você responde 24 horas por dia, 7 dias por semana — NUNCA diga que está fora do horário
- NUNCA invente veículos fora da lista acima
- Para financiamento: trabalhamos com os principais bancos, simule na loja
- Se o cliente quiser cancelar ou remarcar, use as ferramentas de agenda
- Se não souber responder, ofereça falar com um vendedor: (13) 99114-9999
- Mencione o endereço quando sugerir a visita
- Ao sugerir horários de visita, ofereça apenas slots dentro do horário de atendimento presencial acima

FERRAMENTAS DE AGENDA disponíveis: use-as sempre que precisar verificar horários livres, criar ou alterar agendamentos.`
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface GenerateResponseParams {
  dealershipId:        string
  conversaId:          string
  userMessage:         string
  wasenderMsgId?:      string   // used to exclude the just-saved message from history
  customSystemPrompt?: string
  useSmartModel?:      boolean
  businessHoursStart?: string  // e.g. '08:00' — used only to guide scheduling suggestions
  businessHoursEnd?:   string  // e.g. '18:00'
}

export async function generateAIResponse(params: GenerateResponseParams): Promise<AIResponse> {
  const { dealershipId, conversaId, userMessage, wasenderMsgId, customSystemPrompt, useSmartModel, businessHoursStart, businessHoursEnd } = params

  const ctx          = await buildContext(dealershipId, conversaId, wasenderMsgId)
  const systemPrompt = buildSystemPrompt(ctx, customSystemPrompt, businessHoursStart, businessHoursEnd)
  const model        = useSmartModel ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  // Build message history
  const apiMessages: Anthropic.MessageParam[] = ctx.conversationHistory.slice(-10).map(m => ({
    role:    m.role,
    content: m.content,
  }))
  apiMessages.push({ role: 'user', content: userMessage })

  try {
    // Agentic tool-use loop
    let responseText = 'Desculpe, não consegui processar sua mensagem no momento.'

    while (true) {
      const response = await anthropic.messages.create({
        model,
        max_tokens:  600,
        system:      systemPrompt,
        tools:       CALENDAR_TOOLS,
        messages:    apiMessages,
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
            return {
              type:        'tool_result' as const,
              tool_use_id: block.id,
              content:     result,
            }
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
    return {
      message:               'Desculpe, estou com uma instabilidade agora 😅 Por favor, ligue para *(13) 99114-9999* e nossa equipe te atende!',
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
