import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { messages, visitorId, conversationId } = await req.json()

    // Get dealership by slug
    const { data: dealership } = await supabase
      .from('dealerships')
      .select('id, name, city, state, address, phone, whatsapp')
      .eq('slug', params.slug)
      .single()

    if (!dealership) {
      return NextResponse.json({ error: 'Revenda não encontrada' }, { status: 404 })
    }

    // Get calendar config (seed if missing)
    let { data: config } = await supabase
      .from('calendario_config')
      .select('*')
      .eq('dealership_id', dealership.id)
      .single()

    if (!config) {
      await supabase.from('calendario_config').insert({ dealership_id: dealership.id })
      const { data: newConfig } = await supabase
        .from('calendario_config')
        .select('*')
        .eq('dealership_id', dealership.id)
        .single()
      config = newConfig
    }

    // Seed business hours if table is empty for this dealership
    const { count: hoursCount } = await supabase
      .from('horarios_funcionamento')
      .select('id', { count: 'exact', head: true })
      .eq('dealership_id', dealership.id)

    if (!hoursCount || hoursCount === 0) {
      await supabase.rpc('seed_horarios_funcionamento', { p_dealership_id: dealership.id })
    }

    // Get available vehicles
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, brand, model, version, year_model, color, mileage, sale_price, fuel, transmission')
      .eq('dealership_id', dealership.id)
      .eq('status', 'available')
      .order('created_at', { ascending: false })
      .limit(30)

    // Get available slots for next 7 days
    const today = new Date().toISOString().split('T')[0]
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: availableSlots } = await supabase.rpc('get_slots_disponiveis', {
      p_dealership_id: dealership.id,
      p_data_inicio: today,
      p_data_fim: nextWeek,
      p_salesperson_id: null,
    })

    const systemPrompt = buildSystemPrompt(dealership, config, vehicles || [], availableSlots || [])

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
            data_hora: { type: 'string', description: 'Data e hora ISO (ex: 2024-04-15T14:00:00)' },
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

    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: apiMessages,
    })

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

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: apiMessages,
      })
    }

    const textBlock = response.content.find(b => b.type === 'text')
    const replyText = textBlock?.type === 'text' ? textBlock.text : 'Desculpe, não consegui processar sua mensagem.'

    // Save conversation
    await saveConversation(dealership.id, conversationId, visitorId, messages, replyText)

    return NextResponse.json({ message: replyText, conversationId }, { headers: CORS_HEADERS })
  } catch (err: any) {
    console.error('[Widget Chat]', err)
    return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500, headers: CORS_HEADERS })
  }
}

function buildSystemPrompt(dealership: any, config: any, vehicles: any[], slots: any[]): string {
  const slotsByDate: Record<string, string[]> = {}
  for (const slot of slots.filter((s: any) => s.disponivel)) {
    const d = slot.data
    if (!slotsByDate[d]) slotsByDate[d] = []
    slotsByDate[d].push((slot.horario as string).slice(0, 5))
  }

  const now = new Date()
  const todayStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const todayISO = now.toISOString().split('T')[0]
  const tomorrowISO = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
  const afterTomorrowISO = new Date(now.getTime() + 2 * 86400000).toISOString().split('T')[0]

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
- Se o horário não estiver disponível, sugira alternativas

VEÍCULOS DISPONÍVEIS (${vehicles.length} unidades):
${vehicles.slice(0, 15).map(v =>
  `• ${v.brand} ${v.model}${v.version ? ' ' + v.version : ''} ${v.year_model} - ${v.color || '?'} - ${v.mileage?.toLocaleString('pt-BR') ?? '?'} km - R$ ${v.sale_price?.toLocaleString('pt-BR') ?? '?'} - ${v.transmission || ''}`
).join('\n')}${vehicles.length > 15 ? `\n... e mais ${vehicles.length - 15} veículos` : ''}

HORÁRIOS DISPONÍVEIS (próximos 7 dias):
${Object.entries(slotsByDate).slice(0, 5).map(([date, times]) => {
  const d = new Date(date + 'T12:00:00')
  const label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  return `• ${label}: ${(times as string[]).slice(0, 6).join(', ')}`
}).join('\n') || 'Consulte disponibilidade pelo telefone.'}

INFORMAÇÕES:
- Endereço: ${dealership.address || 'Consulte nosso site'}
- Telefone: ${dealership.phone || dealership.whatsapp || 'Não informado'}
- Duração da visita: ${config?.duracao_padrao_minutos || 30} minutos

Fluxo ideal: cumprimentar → mostrar opções → qualificar → oferecer agendamento → confirmar nome/telefone → criar agendamento.`
}

async function executeTool(dealershipId: string, toolName: string, input: any, conversationId: string): Promise<any> {
  switch (toolName) {
    case 'buscar_veiculos': {
      let query = supabase
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
      const { data: slots } = await supabase.rpc('get_slots_disponiveis', {
        p_dealership_id: dealershipId,
        p_data_inicio: input.data,
        p_data_fim: input.data,
        p_salesperson_id: null,
      })
      const available = (slots || []).filter((s: any) => s.disponivel)
      return {
        data: input.data,
        horarios_disponiveis: available.map((s: any) => (s.horario as string).slice(0, 5)),
        total: available.length,
      }
    }

    case 'agendar_visita': {
      const dataInicio = new Date(input.data_hora)
      const dataFim = new Date(dataInicio.getTime() + 30 * 60 * 1000)

      const { data: result } = await supabase.rpc('criar_agendamento', {
        p_dealership_id: dealershipId,
        p_data_inicio: dataInicio.toISOString(),
        p_data_fim: dataFim.toISOString(),
        p_lead_nome: input.nome,
        p_lead_telefone: input.telefone,
        p_lead_email: input.email || null,
        p_tipo: input.tipo,
        p_vehicle_id: input.veiculo_id || null,
        p_veiculo_interesse: input.veiculo_interesse || null,
        p_salesperson_id: null,
        p_origem: 'widget',
        p_dados_qualificacao: '{}',
        p_conversa_id: conversationId || null,
      })

      if (result?.success && conversationId) {
        await supabase
          .from('widget_conversas')
          .update({ agendamento_id: result.agendamento.id, convertido: true })
          .eq('id', conversationId)
      }

      return result
    }

    case 'qualificar_lead': {
      if (!conversationId) return { success: false }

      const temperatura =
        input.urgencia === 'imediato' || input.urgencia === 'esta_semana' ? 'quente'
        : input.urgencia === 'este_mes' ? 'morno'
        : 'frio'

      await supabase
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
    await supabase
      .from('widget_conversas')
      .update({ mensagens: allMessages })
      .eq('id', conversationId)
  } else {
    await supabase.from('widget_conversas').insert({
      dealership_id: dealershipId,
      visitor_id: visitorId,
      mensagens: allMessages,
    })
  }
}
