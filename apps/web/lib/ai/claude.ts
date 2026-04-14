import Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from '@/types'
import type { DashboardConfig } from '@/types/dashboard'
import * as fipe from '@/lib/fipe/client'
import { getFieldMap } from '@/lib/ai/field-map'

function svc() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const pct = (n: number) => `${n.toFixed(1)}%`

export interface FullDealershipContext {
  dealershipId: string
  dealershipName: string
  dealershipCity?: string | null
  summary: {
    totalVehicles: number
    availableCount: number
    soldCount: number
    criticalCount: number
    avgDaysAvailable: number
    avgDaysSold: number
    totalRevenue: number
    totalProfit: number
    totalExpenses: number
    totalCustomers: number
    activeEmployees: number
    pendingOrders: number
  }
  availableVehicles: any[]
  soldVehicles: any[]
  expensesByCategory: Record<string, number>
  financings: any[]
  fines: any[]
  customers: any[]
  employees: any[]
}

// ─── FIPE Tool definitions ─────────────────────────────────────────────────────

const FIPE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'fipe_search_price',
    description: 'Busca o preço FIPE de um veículo pelo nome da marca, modelo e ano. Use esta ferramenta sempre que precisar saber o valor de mercado (tabela FIPE) de qualquer veículo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand: { type: 'string', description: 'Nome da marca (ex: Toyota, Honda, Volkswagen, Fiat)' },
        model: { type: 'string', description: 'Nome do modelo (ex: Corolla, Civic, Gol, Palio)' },
        year: { type: 'number', description: 'Ano do modelo (ex: 2020)' },
        type: { type: 'string', enum: ['carros', 'motos', 'caminhoes'], description: 'Tipo de veículo. Padrão: carros' },
      },
      required: ['brand', 'model', 'year'],
    },
  },
  {
    name: 'fipe_list_brands',
    description: 'Lista todas as marcas disponíveis na tabela FIPE para um tipo de veículo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['carros', 'motos', 'caminhoes'], description: 'Tipo de veículo' },
      },
      required: [],
    },
  },
  {
    name: 'fipe_list_models',
    description: 'Lista todos os modelos de uma marca na tabela FIPE.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_id: { type: 'string', description: 'ID da marca (obtido via fipe_list_brands)' },
        type: { type: 'string', enum: ['carros', 'motos', 'caminhoes'] },
      },
      required: ['brand_id'],
    },
  },
  {
    name: 'fipe_list_years',
    description: 'Lista os anos/combustíveis disponíveis para um modelo na tabela FIPE.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_id: { type: 'string', description: 'ID da marca' },
        model_id: { type: 'string', description: 'ID do modelo' },
        type: { type: 'string', enum: ['carros', 'motos', 'caminhoes'] },
      },
      required: ['brand_id', 'model_id'],
    },
  },
  {
    name: 'fipe_get_price',
    description: 'Obtém o preço FIPE exato de um veículo dado marca, modelo e ano/combustível.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_id: { type: 'string' },
        model_id: { type: 'string' },
        model_year_id: { type: 'string', description: 'Ex: "2020-1" (ano-combustivel). Combustível: 1=Gasolina, 2=Etanol, 3=Diesel, 5=Flex' },
        type: { type: 'string', enum: ['carros', 'motos', 'caminhoes'] },
      },
      required: ['brand_id', 'model_id', 'model_year_id'],
    },
  },
  {
    name: 'fipe_lookup_code',
    description: 'Busca um veículo pelo código FIPE (ex: 005340-4).',
    input_schema: {
      type: 'object' as const,
      properties: {
        fipe_code: { type: 'string', description: 'Código FIPE do veículo' },
        model_year_id: { type: 'string', description: 'Opcional: ano específico (ex: 2020-1)' },
      },
      required: ['fipe_code'],
    },
  },
]

// ─── Dashboard render tool ─────────────────────────────────────────────────────

const DASHBOARD_TOOL: Anthropic.Tool = {
  name: 'render_dashboard',
  description: `Renders a visual PowerBI-style dashboard with KPI cards and interactive charts directly in the chat.
ALWAYS call this tool when the user asks for any kind of analysis, report, or data summary — margins, sales, inventory, expenses, performance, etc.
Call it BEFORE writing your text commentary. The dashboard will be displayed visually above your reply.
Choose chart types wisely: bar for comparisons, line/area for time trends, pie for distributions/proportions.
KPI color guide: green=positive/good, red=negative/alert, yellow=warning, blue=neutral info.
For KPI trend field, use symbols like "+12% vs mês anterior" or "▲ 3 veículos" or "↓ 5 dias".`,
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Dashboard title (e.g. "Análise de Margem — Últimos 30 dias")' },
      kpis: {
        type: 'array',
        description: 'Key metric cards shown at the top',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string', description: 'Formatted value (e.g. "R$ 42.500" or "12,4%")' },
            color: { type: 'string', enum: ['green', 'red', 'yellow', 'blue', 'default'] },
            trend: { type: 'string', description: 'Optional trend text (e.g. "+8% vs mês anterior")' },
          },
          required: ['label', 'value'],
        },
      },
      charts: {
        type: 'array',
        description: 'Visual charts to render',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['bar', 'line', 'area', 'pie'], description: 'Chart type' },
            title: { type: 'string' },
            data: {
              type: 'array',
              description: 'Array of data objects. Each object has the xKey field plus one field per series.',
              items: { type: 'object' },
            },
            xKey: { type: 'string', description: 'The field name used as the X axis / category label' },
            series: {
              type: 'array',
              description: 'Data series to plot',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: 'Field name in the data objects' },
                  label: { type: 'string', description: 'Human-readable legend label' },
                  color: { type: 'string', description: 'Optional hex color' },
                },
                required: ['key', 'label'],
              },
            },
          },
          required: ['type', 'title', 'data', 'xKey', 'series'],
        },
      },
    },
    required: ['title', 'kpis', 'charts'],
  },
}

// ─── Calendar Tool definitions ──────────────────────────────────────────────────

const CALENDAR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'calendar_get_slots',
    description: 'Busca horários disponíveis para agendamento em uma data ou período. Use sempre que precisar saber quando há horário livre para marcar uma visita ou test drive.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_inicio: { type: 'string', description: 'Data início no formato YYYY-MM-DD (ex: 2024-04-15)' },
        data_fim: { type: 'string', description: 'Data fim no formato YYYY-MM-DD. Se omitido, usa data_inicio.' },
      },
      required: ['data_inicio'],
    },
  },
  {
    name: 'calendar_list_appointments',
    description: 'Lista agendamentos da revenda em um período. Use para responder perguntas sobre agenda, quem está marcado, quantos agendamentos há, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_inicio: { type: 'string', description: 'Data início no formato YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'Data fim no formato YYYY-MM-DD' },
        status: { type: 'string', description: 'Filtrar por status: agendado, confirmado, em_atendimento, concluido, cancelado, no_show' },
      },
      required: ['data_inicio'],
    },
  },
  {
    name: 'calendar_create_appointment',
    description: 'Cria um novo agendamento para um cliente. Use quando o usuário quiser marcar uma visita ou test drive.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_nome: { type: 'string', description: 'Nome completo do cliente' },
        lead_telefone: { type: 'string', description: 'Telefone do cliente com DDD' },
        lead_email: { type: 'string', description: 'Email do cliente (opcional)' },
        data_hora: { type: 'string', description: 'Data e hora no formato ISO (ex: 2024-04-15T14:00:00)' },
        tipo: { type: 'string', enum: ['visita', 'test_drive', 'avaliacao_troca', 'entrega'], description: 'Tipo de agendamento' },
        veiculo_interesse: { type: 'string', description: 'Veículo de interesse (ex: Gol 2020 branco)' },
      },
      required: ['lead_nome', 'lead_telefone', 'data_hora', 'tipo'],
    },
  },
  {
    name: 'calendar_update_status',
    description: 'Atualiza o status de um agendamento existente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agendamento_id: { type: 'string', description: 'ID do agendamento' },
        status: { type: 'string', enum: ['confirmado', 'em_atendimento', 'concluido', 'no_show', 'cancelado'], description: 'Novo status' },
        motivo: { type: 'string', description: 'Motivo (obrigatório para cancelado)' },
      },
      required: ['agendamento_id', 'status'],
    },
  },
]

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>, dealershipId: string): Promise<string> {
  try {
    let result: any
    const type = input.type ?? 'carros'

    switch (name) {
      case 'fipe_search_price':
        result = await fipe.searchPrice(input.brand, input.model, input.year, type)
        break
      case 'fipe_list_brands':
        result = await fipe.listBrands(type)
        break
      case 'fipe_list_models':
        result = await fipe.listModels(type, input.brand_id)
        break
      case 'fipe_list_years':
        result = await fipe.listYears(type, input.brand_id, input.model_id)
        break
      case 'fipe_get_price':
        result = await fipe.getPrice(type, input.brand_id, input.model_id, input.model_year_id)
        break
      case 'fipe_lookup_code':
        result = input.model_year_id
          ? await fipe.lookupFipeCodeYear(input.fipe_code, input.model_year_id)
          : await fipe.lookupByFipeCode(input.fipe_code)
        break
      // ── Calendar tools ──────────────────────────────────────────────────
      case 'calendar_get_slots': {
        const endDate = input.data_fim || input.data_inicio
        const { data, error } = await svc().rpc('get_slots_disponiveis', {
          p_dealership_id: dealershipId,
          p_data_inicio: input.data_inicio,
          p_data_fim: endDate,
          p_salesperson_id: null,
        })
        if (error) { result = { error: error.message }; break }
        // Group by date, return only available slots
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

      case 'calendar_list_appointments': {
        const endDate = input.data_fim || input.data_inicio
        const { data, error } = await svc().rpc('get_calendario_dashboard', {
          p_dealership_id: dealershipId,
          p_data_inicio: input.data_inicio,
          p_data_fim: endDate,
          p_salesperson_id: null,
        })
        if (error) { result = { error: error.message }; break }
        let appts = data || []
        if (input.status) appts = appts.filter((a: any) => a.status === input.status)
        result = {
          total: appts.length,
          agendamentos: appts.map((a: any) => ({
            id: a.id,
            cliente: a.lead_nome,
            telefone: a.lead_telefone,
            data_hora: a.data_inicio,
            tipo: a.tipo,
            veiculo: a.veiculo_interesse,
            status: a.status,
            vendedor: a.salesperson_name,
          })),
        }
        break
      }

      case 'calendar_create_appointment': {
        const dataInicio = new Date(input.data_hora)
        const dataFim = new Date(dataInicio.getTime() + 30 * 60 * 1000)
        const { data, error } = await svc().rpc('criar_agendamento', {
          p_dealership_id: dealershipId,
          p_data_inicio: dataInicio.toISOString(),
          p_data_fim: dataFim.toISOString(),
          p_lead_nome: input.lead_nome,
          p_lead_telefone: input.lead_telefone,
          p_lead_email: input.lead_email || null,
          p_tipo: input.tipo,
          p_vehicle_id: null,
          p_veiculo_interesse: input.veiculo_interesse || null,
          p_salesperson_id: null,
          p_origem: 'chat_interno',
          p_dados_qualificacao: '{}',
          p_conversa_id: null,
        })
        if (error) { result = { error: error.message }; break }
        result = data
        break
      }

      case 'calendar_update_status': {
        if (input.status === 'cancelado') {
          const { data } = await svc().rpc('cancelar_agendamento', {
            p_agendamento_id: input.agendamento_id,
            p_motivo: input.motivo || null,
          })
          result = data
        } else {
          const { error } = await svc()
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

// ─── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: FullDealershipContext): string {
  const s = ctx.summary
  const lines: string[] = []

  lines.push(`Você é o assistente de inteligência artificial da **${ctx.dealershipName}**${ctx.dealershipCity ? ` (${ctx.dealershipCity})` : ''}, uma revenda de veículos usados.`)
  lines.push(`Você se chama **Moneycar IA**. Especialista em gestão de estoque, vendas e finanças de revendas.`)
  lines.push(`Responda sempre em português brasileiro. Seja direto e prático. Formate valores em R$. Use markdown quando útil.`)
  lines.push(`Data de hoje: **${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}**`)
  lines.push(`Você tem acesso COMPLETO a todos os dados da revenda listados abaixo. Nunca diga que não tem acesso a dados — eles estão todos aqui.`)
  lines.push(``)
  lines.push(`## REGRA OBRIGATÓRIA — Dashboards Visuais`)
  lines.push(`Sempre que o usuário pedir análise, relatório, resumo ou qualquer dado quantitativo, OBRIGATORIAMENTE chame a ferramenta **render_dashboard** ANTES de escrever sua resposta em texto.`)
  lines.push(`O dashboard será exibido visualmente com gráficos interativos no chat. Após chamar render_dashboard, escreva um comentário conciso em texto com insights adicionais.`)
  lines.push(`Exemplos de quando chamar render_dashboard: margem de lucro, análise de estoque, vendas do período, despesas, performance de vendedores, comparativos, qualquer pergunta com números.`)
  lines.push(``)
  lines.push(`Você também tem acesso via ferramentas (tools) a:`)
  lines.push(`- **render_dashboard** — renderiza dashboard visual com KPIs e gráficos no chat (use SEMPRE para dados quantitativos)`)
  lines.push(`- **Tabela FIPE em tempo real** — use sempre que precisar do valor de mercado de um veículo`)
  lines.push(`- **Agenda e agendamentos** — consulte horários disponíveis, liste agendamentos, crie e atualize visitas/test drives`)

  lines.push(`\n## MAPA DE CAMPOS DO BANCO DE DADOS`)
  lines.push(`Use o mapa abaixo para traduzir perguntas em linguagem natural para os campos corretos do banco.`)
  lines.push(`Ele descreve todas as 28 tabelas, seus campos, os valores aceitos e as fórmulas de cálculo.`)
  lines.push(`Sempre que o usuário perguntar sobre dados específicos, consulte este mapa para garantir que está`)
  lines.push(`usando os campos certos, os valores corretos dos enums, e as fórmulas de lucro/margem exatas.`)
  lines.push(``)
  lines.push(getFieldMap())

  lines.push(`\n## Resumo Geral`)
  lines.push(`- Estoque: ${s.availableCount} disponíveis | ${s.soldCount} vendidos | ${s.totalVehicles} total`)
  lines.push(`- Críticos (>90 dias parados): ${s.criticalCount}`)
  lines.push(`- Tempo médio em estoque (disponíveis): ${s.avgDaysAvailable} dias`)
  lines.push(`- Tempo médio até venda (vendidos): ${s.avgDaysSold} dias`)
  lines.push(`- Faturamento total: R$ ${brl(s.totalRevenue)}`)
  lines.push(`- Lucro total: R$ ${brl(s.totalProfit)}`)
  lines.push(`- Despesas totais: R$ ${brl(s.totalExpenses)}`)
  lines.push(`- Clientes: ${s.totalCustomers} | Funcionários ativos: ${s.activeEmployees} | Pedidos em aberto: ${s.pendingOrders}`)

  if (ctx.soldVehicles.length > 0) {
    lines.push(`\n## Veículos Vendidos (${ctx.soldVehicles.length}) — por tempo até venda`)
    lines.push(`| # | Veículo | Placa | Ano | Compra | Venda | Despesas | Lucro | Margem | Dias |`)
    lines.push(`|---|---------|-------|-----|--------|-------|----------|-------|--------|------|`)
    ctx.soldVehicles.forEach((v, i) => {
      const label = `${v.brand} ${v.model}${v.version ? ' ' + v.version : ''}`
      lines.push(
        `| ${i + 1} | ${label} | ${v.plate ?? '—'} | ${v.year_model ?? v.year_fab} ` +
        `| R$ ${brl(v.purchase_price)} | R$ ${brl(v.sale_price ?? 0)} ` +
        `| R$ ${brl(v.totalExp)} | R$ ${brl(v.profit ?? 0)} ` +
        `| ${v.profitPct != null ? pct(v.profitPct) : '—'} | ${v.days_in_stock ?? '—'}d |`
      )
    })
  }

  if (ctx.availableVehicles.length > 0) {
    lines.push(`\n## Veículos em Estoque (${ctx.availableVehicles.length}) — por dias parado`)
    lines.push(`| # | Veículo | Placa | Ano | Compra | Venda | Despesas | Dias | Status |`)
    lines.push(`|---|---------|-------|-----|--------|-------|----------|------|--------|`)
    ctx.availableVehicles.forEach((v, i) => {
      const label = `${v.brand} ${v.model}${v.version ? ' ' + v.version : ''}`
      const status = (v.days_in_stock ?? 0) > 90 ? '🔴 CRÍTICO' : (v.days_in_stock ?? 0) > 45 ? '🟡 ATENÇÃO' : '🟢 OK'
      lines.push(
        `| ${i + 1} | ${label} | ${v.plate ?? '—'} | ${v.year_model ?? v.year_fab} ` +
        `| R$ ${brl(v.purchase_price)} | R$ ${brl(v.sale_price ?? 0)} ` +
        `| R$ ${brl(v.totalExp)} | ${v.days_in_stock ?? '—'}d | ${status} |`
      )
    })
  }

  const expCats = Object.entries(ctx.expensesByCategory).sort((a, b) => b[1] - a[1])
  if (expCats.length > 0) {
    lines.push(`\n## Despesas por Categoria`)
    expCats.forEach(([cat, total]) => {
      const share = s.totalExpenses > 0 ? (total / s.totalExpenses) * 100 : 0
      lines.push(`- ${cat}: R$ ${brl(total)} (${pct(share)})`)
    })
  }

  if (ctx.financings.length > 0) {
    lines.push(`\n## Financiamentos (${ctx.financings.length})`)
    ctx.financings.slice(0, 30).forEach(f => {
      lines.push(`- Veículo ${f.vehicle_external_id ?? '?'} | ${f.bank ?? '—'} | R$ ${brl(f.total_amount ?? 0)} | ${f.installments ?? '?'}x | ${f.status}`)
    })
  }

  const unpaidFines = ctx.fines.filter(f => !f.is_paid)
  if (ctx.fines.length > 0) {
    const totalFines = ctx.fines.reduce((s, f) => s + (f.amount ?? 0), 0)
    const unpaidTotal = unpaidFines.reduce((s, f) => s + (f.amount ?? 0), 0)
    lines.push(`\n## Multas (${ctx.fines.length} total, ${unpaidFines.length} não pagas)`)
    lines.push(`- Total: R$ ${brl(totalFines)} | Não pagas: R$ ${brl(unpaidTotal)}`)
  }

  if (ctx.employees.length > 0) {
    lines.push(`\n## Funcionários`)
    ctx.employees.forEach(e => {
      lines.push(`- ${e.name} | ${e.role ?? 'sem cargo'} | ${e.is_active ? 'ativo' : 'inativo'}`)
    })
  }

  if (ctx.customers.length > 0) {
    const bySource: Record<string, number> = {}
    ctx.customers.forEach(c => { const src = c.source ?? 'Desconhecido'; bySource[src] = (bySource[src] ?? 0) + 1 })
    lines.push(`\n## Clientes (${ctx.customers.length})`)
    Object.entries(bySource).sort((a, b) => b[1] - a[1]).forEach(([src, n]) => {
      lines.push(`- ${src}: ${n}`)
    })
  }

  return lines.join('\n')
}

// ─── Main chat function with tool-use loop ─────────────────────────────────────

export async function chatWithClaude(
  messages: ChatMessage[],
  context: FullDealershipContext
): Promise<{ reply: string; dashboard?: DashboardConfig }> {
  const systemPrompt = buildSystemPrompt(context)
  const apiMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const ALL_TOOLS = [DASHBOARD_TOOL, ...FIPE_TOOLS, ...CALENDAR_TOOLS]

  let capturedDashboard: DashboardConfig | undefined

  // Agentic loop: keep calling Claude until it stops using tools
  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools: ALL_TOOLS,
      messages: apiMessages,
    })

    // If Claude is done (no tool calls), return the text + any captured dashboard
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') throw new Error('No text in response')
      return { reply: textBlock.text, dashboard: capturedDashboard }
    }

    // Claude wants to use tools — execute them all in parallel
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')

      // Add Claude's assistant turn (with tool_use blocks) to history
      apiMessages.push({ role: 'assistant', content: response.content })

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== 'tool_use') return null

          // Intercept render_dashboard — capture config, return "rendered"
          if (block.name === 'render_dashboard') {
            capturedDashboard = block.input as unknown as DashboardConfig
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: 'Dashboard rendered successfully. Now provide a concise text commentary.',
            }
          }

          const result = await executeTool(block.name, block.input as Record<string, any>, context.dealershipId)
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result,
          }
        })
      )

      // Add tool results as user turn and loop
      apiMessages.push({
        role: 'user',
        content: toolResults.filter(Boolean) as Anthropic.ToolResultBlockParam[],
      })

      continue
    }

    // Unexpected stop reason — return whatever text is available
    const textBlock = response.content.find(b => b.type === 'text')
    if (textBlock && textBlock.type === 'text') return { reply: textBlock.text, dashboard: capturedDashboard }
    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`)
  }
}
