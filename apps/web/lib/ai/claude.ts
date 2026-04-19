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

function getAI() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
  })
}

// Retries a fn up to maxRetries times on 429/529, honouring the retry-after header.
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const status = err?.status ?? err?.statusCode
      if (status !== 429 && status !== 529) throw err        // not retriable
      if (attempt === maxRetries) break                       // exhausted
      const retryAfter = err?.headers?.['retry-after']
      const waitMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 8_000)  // respect server hint, cap at 60s
        : Math.min(1000 * 2 ** attempt, 8_000)              // exponential: 1s, 2s, 4s …
      console.warn(`[Claude] rate-limited (${status}), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, waitMs))
    }
  }
  throw lastErr
}

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
    totalCommissionsPaid: number
    totalCommissionsPending: number
  }
  availableVehicles: any[]
  soldVehicles: any[]
  expensesByCategory: Record<string, number>
  financings: any[]
  fines: any[]
  customers: any[]
  employees: any[]
  orders: any[]
  commissions: any[]
  commissionStandards: any[]
  employeeSalaries: any[]
  saleData: any[]
  purchaseData: any[]
  vendors: any[]
  vehicleTrades: any[]
  vehiclePendencies: any[]
  postSaleExpenses: any[]
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

// ─── Vehicle query tool ────────────────────────────────────────────────────────

const QUERY_VEHICLES_TOOL: Anthropic.Tool = {
  name: 'query_vehicles',
  description: `Busca e agrega dados de veículos do banco. Use SEMPRE para relatórios, rankings ou qualquer dado de veículos.

IMPORTANTE: Para relatórios/agrupamentos, SEMPRE use o parâmetro group_by — isso retorna dados agregados compactos (poucos tokens). Sem group_by, retorna no máximo 30 registros individuais.

group_by aceita: "year_fab_range" (com group_range=5 para intervalos de 5 anos), "brand", "model", "color", "sale_month", "source".

Escopo os filtros apenas ao que foi pedido: se o usuário pergunta sobre 2026, use sale_date_gte/lte para 2026-01-01/2026-12-31 e status=sold.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      status:        { type: 'string', enum: ['available', 'sold'], description: 'Filtrar por status.' },
      brand:         { type: 'string', description: 'Filtrar por marca (busca parcial)' },
      model:         { type: 'string', description: 'Filtrar por modelo (busca parcial)' },
      color:         { type: 'string', description: 'Filtrar por cor (busca parcial, ex: "branco", "prata")' },
      year_fab_gte:  { type: 'number', description: 'Ano de fabricação mínimo' },
      year_fab_lte:  { type: 'number', description: 'Ano de fabricação máximo' },
      sale_date_gte: { type: 'string', description: 'Data de venda mínima (YYYY-MM-DD). Para 2026: 2026-01-01' },
      sale_date_lte: { type: 'string', description: 'Data de venda máxima (YYYY-MM-DD). Para 2026: 2026-12-31' },
      days_gte:      { type: 'number', description: 'Dias em estoque mínimo' },
      days_lte:      { type: 'number', description: 'Dias em estoque máximo' },
      group_by:      { type: 'string', enum: ['year_fab_range', 'brand', 'model', 'color', 'sale_month', 'source'], description: 'Agrupar e agregar resultado. Preferir sempre para relatórios.' },
      group_range:   { type: 'number', description: 'Tamanho do intervalo para year_fab_range (ex: 5 para faixas de 5 anos). Padrão: 5.' },
      order_by:      { type: 'string', description: 'Campo para ordenar sem group_by (days_in_stock, sale_date, sale_price). Padrão: days_in_stock' },
      ascending:     { type: 'boolean', description: 'Crescente? Padrão: false' },
      limit:         { type: 'number', description: 'Máximo de registros individuais sem group_by (padrão 30, máx 100)' },
    },
    required: [],
  },
}

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

      // ── Vehicle query tool ───────────────────────────────────────────────
      case 'query_vehicles': {
        // No expenses join — avoids N+1 subqueries that make large fetches very slow.
        // Profit is approximated as sale_price - purchase_price (expenses are typically small).
        let query = svc()
          .from('vehicles')
          .select('brand, model, year_fab, year_model, purchase_price, sale_price, days_in_stock, status, sale_date, source, color')
          .eq('dealership_id', dealershipId)

        if (input.status)        query = query.eq('status', input.status)
        if (input.brand)         query = query.ilike('brand', `%${input.brand}%`)
        if (input.model)         query = query.ilike('model', `%${input.model}%`)
        if (input.color)         query = query.ilike('color', `%${input.color}%`)
        if (input.year_fab_gte)  query = query.gte('year_fab', input.year_fab_gte)
        if (input.year_fab_lte)  query = query.lte('year_fab', input.year_fab_lte)
        if (input.sale_date_gte) query = query.gte('sale_date', input.sale_date_gte)
        if (input.sale_date_lte) query = query.lte('sale_date', input.sale_date_lte)
        if (input.days_gte)      query = query.gte('days_in_stock', input.days_gte)
        if (input.days_lte)      query = query.lte('days_in_stock', input.days_lte)

        // Aggregation: up to 500 rows (no join = fast); raw records: cap at 30
        const fetchLimit = input.group_by ? 500 : Math.min(input.limit ?? 30, 100)
        const { data, error } = await query
          .order(input.order_by ?? 'days_in_stock', { ascending: input.ascending ?? false })
          .limit(fetchLimit)
        if (error) { result = { error: error.message }; break }

        const enriched = (data ?? []).map((v: any) => {
          const profit = v.sale_price != null ? v.sale_price - v.purchase_price : null
          const marginPct = v.sale_price && v.sale_price > 0 ? (profit ?? 0) / v.sale_price * 100 : null
          return { ...v, profit, marginPct }
        })

        if (input.group_by) {
          // Server-side aggregation — returns compact summary, not raw rows
          const groups: Record<string, { count: number; revenue: number; profit: number; totalDays: number }> = {}
          const rangeSize = input.group_range ?? 5

          enriched.forEach((v: any) => {
            let key: string
            if (input.group_by === 'year_fab_range') {
              const yr = v.year_fab ?? 0
              const start = Math.floor(yr / rangeSize) * rangeSize
              key = `${start}–${start + rangeSize - 1}`
            } else if (input.group_by === 'sale_month') {
              key = v.sale_date ? v.sale_date.slice(0, 7) : 'sem data'
            } else if (input.group_by === 'color') {
              key = (v.color ?? 'Não informado') as string
            } else {
              key = (v[input.group_by as keyof typeof v] ?? 'Outros') as string
            }
            if (!groups[key]) groups[key] = { count: 0, revenue: 0, profit: 0, totalDays: 0 }
            groups[key].count++
            groups[key].revenue += v.sale_price ?? 0
            groups[key].profit  += v.profit ?? 0
            groups[key].totalDays += v.days_in_stock ?? 0
          })

          result = {
            total: enriched.length,
            group_by: input.group_by,
            groups: Object.entries(groups)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, g]) => ({
                group: key,
                count: g.count,
                revenue: Math.round(g.revenue),
                profit: Math.round(g.profit),
                avg_margin_pct: g.revenue > 0 ? +((g.profit / g.revenue) * 100).toFixed(1) : 0,
                avg_days: g.count > 0 ? Math.round(g.totalDays / g.count) : 0,
              })),
          }
        } else {
          // Raw records — already limited to 30-100
          result = {
            total: enriched.length,
            vehicles: enriched.map((v: any) => ({
              brand: v.brand, model: v.model, year_fab: v.year_fab, color: v.color,
              purchase_price: v.purchase_price, sale_price: v.sale_price,
              profit: v.profit != null ? Math.round(v.profit) : null,
              margin_pct: v.marginPct != null ? +v.marginPct.toFixed(1) : null,
              days_in_stock: v.days_in_stock, sale_date: v.sale_date, status: v.status,
            })),
          }
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
  lines.push(`- **query_vehicles** — busca veículos no banco com filtros (status, marca, modelo, ano, data de venda, etc). Use SEMPRE que precisar de dados detalhados de veículos — relatórios, agrupamentos, rankings, vendas por período, etc.`)
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
  lines.push(`- Comissões pagas: R$ ${brl(s.totalCommissionsPaid)} | Comissões a pagar: R$ ${brl(s.totalCommissionsPending)}`)
  lines.push(`- Clientes: ${s.totalCustomers} | Funcionários ativos: ${s.activeEmployees} | Pedidos em aberto: ${s.pendingOrders}`)

  // Show only top-10 worst-aged available vehicles as a quick reference.
  // For full vehicle data (reports, rankings, groupings) use the query_vehicles tool.
  if (ctx.availableVehicles.length > 0) {
    const critical = ctx.availableVehicles.filter(v => (v.days_in_stock ?? 0) > 90).length
    const attention = ctx.availableVehicles.filter(v => (v.days_in_stock ?? 0) > 45 && (v.days_in_stock ?? 0) <= 90).length
    lines.push(`\n## Estoque Atual (${ctx.availableVehicles.length} veículos) — use query_vehicles para dados completos`)
    lines.push(`Situação: 🔴 ${critical} críticos (>90d) | 🟡 ${attention} em atenção (46-90d) | 🟢 ${ctx.availableVehicles.length - critical - attention} OK`)
    lines.push(`Top 10 mais parados:`)
    ctx.availableVehicles.slice(0, 10).forEach(v => {
      const status = (v.days_in_stock ?? 0) > 90 ? '🔴' : (v.days_in_stock ?? 0) > 45 ? '🟡' : '🟢'
      lines.push(`${status} ${v.brand} ${v.model} ${v.year_model ?? v.year_fab} | ${v.plate ?? '—'} | ${v.days_in_stock ?? '—'}d | R$ ${brl(v.sale_price ?? v.purchase_price)}`)
    })
  }

  if (ctx.soldVehicles.length > 0) {
    lines.push(`\n## Vendidos Recentes (${ctx.soldVehicles.length} nos últimos 180 dias) — use query_vehicles para relatórios completos`)
    lines.push(`Top 5 mais recentes:`)
    ctx.soldVehicles.slice(0, 5).forEach(v => {
      lines.push(`${v.brand} ${v.model} ${v.year_model ?? v.year_fab} | vendido ${v.sale_date ?? '—'} | lucro R$ ${brl(v.profit ?? 0)} (${v.profitPct != null ? pct(v.profitPct) : '—'})`)
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
    const finTotal = ctx.financings.reduce((s, f) => s + (f.total_amount ?? 0), 0)
    const finActive = ctx.financings.filter(f => f.status === 'active' || f.status === 'ativo').length
    lines.push(`\n## Financiamentos: ${ctx.financings.length} total | ${finActive} ativos | Valor total: R$ ${brl(finTotal)}`)
    lines.push(`(Para detalhes de financiamentos individuais, peça ao usuário para consultar a seção de financiamentos)`)
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
    lines.push(`| Nome | Cargo | Status | Salário Base | Comissão Padrão |`)
    lines.push(`|------|-------|--------|--------------|-----------------|`)
    ctx.employees.forEach(e => {
      lines.push(
        `| ${e.name} | ${e.role ?? '—'} | ${e.is_active ? 'ativo' : 'inativo'}` +
        ` | ${e.base_salary != null ? `R$ ${brl(e.base_salary)}` : '—'}` +
        ` | ${e.commission_percent != null ? `${e.commission_percent}%` : '—'} |`
      )
    })
  }

  if (ctx.commissions.length > 0) {
    const empById: Record<string, string> = {}
    ctx.employees.forEach(e => { empById[e.id] = e.name; if (e.external_id) empById[e.external_id] = e.name })
    const byEmp: Record<string, { name: string; total: number; paid: number; pending: number; count: number }> = {}
    ctx.commissions.forEach(c => {
      const key = c.employee_id ?? c.employee_external_id ?? 'Desconhecido'
      const name = empById[key] ?? empById[c.employee_external_id] ?? key
      if (!byEmp[key]) byEmp[key] = { name, total: 0, paid: 0, pending: 0, count: 0 }
      byEmp[key].total += c.amount ?? 0
      byEmp[key].count++
      if (c.is_paid) byEmp[key].paid += c.amount ?? 0
      else byEmp[key].pending += c.amount ?? 0
    })
    lines.push(`\n## Comissões por Vendedor (${ctx.commissions.length} registros)`)
    lines.push(`| Vendedor | Qtd | Total | Pagas | A Pagar |`)
    lines.push(`|----------|-----|-------|-------|---------|`)
    Object.values(byEmp).sort((a, b) => b.total - a.total).forEach(e => {
      lines.push(`| ${e.name} | ${e.count} | R$ ${brl(e.total)} | R$ ${brl(e.paid)} | R$ ${brl(e.pending)} |`)
    })
  }

  if (ctx.commissionStandards.length > 0) {
    const empById2: Record<string, string> = {}
    ctx.employees.forEach(e => { empById2[e.id] = e.name; if (e.external_id) empById2[e.external_id] = e.name })
    lines.push(`\n## Regras de Comissão: ${ctx.commissionStandards.length} padrões configurados`)
    ctx.commissionStandards.filter(cs => cs.is_active).forEach(cs => {
      const name = empById2[cs.employee_id] ?? empById2[cs.employee_external_id] ?? '—'
      lines.push(`- ${name}: ${cs.percent != null ? `${cs.percent}%` : '—'} (${cs.type ?? '—'})`)
    })
  }

  if (ctx.employeeSalaries.length > 0) {
    const salByType: Record<string, number> = {}
    ctx.employeeSalaries.forEach(s => {
      const t = s.type ?? 'Outros'
      salByType[t] = (salByType[t] ?? 0) + (s.amount ?? 0)
    })
    lines.push(`\n## Pagamentos a Funcionários (${ctx.employeeSalaries.length} lançamentos)`)
    Object.entries(salByType).sort((a, b) => b[1] - a[1]).forEach(([type, total]) => {
      lines.push(`- ${type}: R$ ${brl(total)}`)
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

  // ── Orders summary ─────────────────────────────────────────────────────────
  if (ctx.orders.length > 0) {
    const openOrders = ctx.orders.filter((o: any) => o.status === 'open')
    const totalOrderValue = ctx.orders.reduce((s: number, o: any) => s + (o.amount ?? 0), 0)
    lines.push(`\n## Pedidos: ${ctx.orders.length} total | ${openOrders.length} em aberto | Valor total: R$ ${brl(totalOrderValue)}`)
  }

  // ── Sale data summary ──────────────────────────────────────────────────────
  if (ctx.saleData.length > 0) {
    const payMethodCount: Record<string, number> = {}
    ctx.saleData.forEach(s => {
      const pm = s.payment_method ?? 'Não informado'
      payMethodCount[pm] = (payMethodCount[pm] ?? 0) + 1
    })
    lines.push(`\n## Dados de Venda (${ctx.saleData.length} registros) — formas de pagamento:`)
    Object.entries(payMethodCount).sort((a, b) => b[1] - a[1]).forEach(([pm, n]) => {
      lines.push(`- ${pm}: ${n} vendas`)
    })
  }

  // ── Purchase data ─────────────────────────────────────────────────────────
  if (ctx.purchaseData.length > 0) {
    const payMethodCount: Record<string, number> = {}
    ctx.purchaseData.forEach(p => {
      const pm = p.payment_method ?? 'Não informado'
      payMethodCount[pm] = (payMethodCount[pm] ?? 0) + 1
    })
    lines.push(`\n## Dados de Compra (${ctx.purchaseData.length} registros)`)
    lines.push(`Formas de pagamento (compra):`)
    Object.entries(payMethodCount).sort((a, b) => b[1] - a[1]).forEach(([pm, n]) => {
      lines.push(`- ${pm}: ${n} compras`)
    })
  }

  // ── Vendors ───────────────────────────────────────────────────────────────
  if (ctx.vendors.length > 0) {
    const byCategory: Record<string, number> = {}
    ctx.vendors.forEach(v => { const cat = v.category ?? 'Sem categoria'; byCategory[cat] = (byCategory[cat] ?? 0) + 1 })
    lines.push(`\n## Fornecedores/Prestadores (${ctx.vendors.length})`)
    Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
      lines.push(`- ${cat}: ${n}`)
    })
  }

  // ── Vehicle trades ────────────────────────────────────────────────────────
  if (ctx.vehicleTrades.length > 0) {
    const totalTradeInValue = ctx.vehicleTrades.reduce((s, t) => s + (t.trade_in_value ?? 0), 0)
    lines.push(`\n## Trocas de Veículos (${ctx.vehicleTrades.length} negociações)`)
    lines.push(`- Valor total atribuído a veículos recebidos em troca: R$ ${brl(totalTradeInValue)}`)
    lines.push(`| Data | Veículo Recebido | Veículo Entregue | Valor Troca | Diferença |`)
    lines.push(`|------|-----------------|------------------|-------------|-----------|`)
    ctx.vehicleTrades.slice(0, 30).forEach(t => {
      lines.push(
        `| ${t.trade_date ?? '—'} | ${t.incoming_vehicle_external_id ?? '—'}` +
        ` | ${t.outgoing_vehicle_external_id ?? '—'}` +
        ` | R$ ${brl(t.trade_in_value ?? 0)} | R$ ${brl(t.difference_amount ?? 0)} |`
      )
    })
  }

  // ── Vehicle pendencies ────────────────────────────────────────────────────
  if (ctx.vehiclePendencies.length > 0) {
    const pending = ctx.vehiclePendencies.filter(p => p.status === 'pending')
    const totalPendingAmount = pending.reduce((s, p) => s + (p.amount ?? 0), 0)
    lines.push(`\n## Pendências de Veículos (${ctx.vehiclePendencies.length} total, ${pending.length} em aberto)`)
    lines.push(`- Valor total pendências em aberto: R$ ${brl(totalPendingAmount)}`)
    if (pending.length > 0) {
      lines.push(`| Veículo | Descrição | Valor | Data |`)
      lines.push(`|---------|-----------|-------|------|`)
      pending.slice(0, 20).forEach(p => {
        lines.push(`| ${p.vehicle_external_id ?? '?'} | ${p.description ?? '—'} | R$ ${brl(p.amount ?? 0)} | ${p.date ?? '—'} |`)
      })
    }
  }

  // ── Post-sale expenses ────────────────────────────────────────────────────
  if (ctx.postSaleExpenses.length > 0) {
    const totalPostSale = ctx.postSaleExpenses.reduce((s, e) => s + (e.amount ?? 0), 0)
    lines.push(`\n## Despesas Pós-Venda (${ctx.postSaleExpenses.length} registros)`)
    lines.push(`- Total despesas pós-venda: R$ ${brl(totalPostSale)}`)
    lines.push(`| Veículo | Descrição | Valor | Data |`)
    lines.push(`|---------|-----------|-------|------|`)
    ctx.postSaleExpenses.slice(0, 20).forEach(e => {
      lines.push(`| ${e.vehicle_external_id ?? '?'} | ${e.description ?? '—'} | R$ ${brl(e.amount ?? 0)} | ${e.date ?? '—'} |`)
    })
  }

  // ── Salesperson ranking ───────────────────────────────────────────────────
  lines.push(`\n## COMO IDENTIFICAR O VENDEDOR DE CADA VENDA`)
  lines.push(`IMPORTANTE: o campo vendedor NÃO está em sale_data diretamente — use a hierarquia abaixo:`)
  lines.push(``)
  lines.push(`1. **sale_data.employee_external_id** → se preenchido, é o campo mais direto (vVendedorID do MDB).`)
  lines.push(`2. **commissions.vehicle_external_id** = vehicle.external_id → commissions.employee_external_id → employees.name`)
  lines.push(`   Esta é a ligação mais completa: cada comissão registra exatamente qual funcionário vendeu qual veículo.`)
  lines.push(`3. **orders.vehicle_external_id** = vehicle.external_id → orders.employee_external_id → employees.name`)
  lines.push(`   ATENÇÃO: nesta revenda os pedidos (orders) NÃO têm vehicle_external_id preenchido.`)
  lines.push(`   Portanto esta rota NÃO funciona para ranking de vendedor por veículo.`)
  lines.push(``)
  lines.push(`**Para gerar ranking de melhores vendedores:**`)
  lines.push(`- Agrupe commissions por employee_external_id (→ employees.name)`)
  lines.push(`- Some commission.amount por funcionário → total de comissões geradas`)
  lines.push(`- Conte registros por funcionário → número de vendas`)
  lines.push(`- Se commissions estiver vazia mas sale_data.employee_external_id estiver preenchido, use sale_data`)
  lines.push(``)

  // ── Relationship map ──────────────────────────────────────────────────────
  lines.push(`\n## MAPA DE RELACIONAMENTOS ENTRE TABELAS`)
  lines.push(`Use este mapa para correlacionar dados entre tabelas ao responder perguntas:`)
  lines.push(``)
  lines.push(`**VEÍCULO** (vehicles) é o centro de tudo:`)
  lines.push(`- vehicle.external_id → sale_data.vehicle_external_id (dados detalhados da venda: cliente, forma de pagamento)`)
  lines.push(`- vehicle.external_id → purchase_data.vehicle_external_id (dados detalhados da compra: fornecedor, forma de pagamento)`)
  lines.push(`- vehicle.id → expenses.vehicle_id (despesas de preparação/manutenção do veículo)`)
  lines.push(`- vehicle.external_id → vehicle_fines.vehicle_external_id (multas do veículo)`)
  lines.push(`- vehicle.external_id → vehicle_pendencies.vehicle_external_id (pendências antes da venda)`)
  lines.push(`- vehicle.external_id → post_sale_expenses.vehicle_external_id (custos após a venda)`)
  lines.push(`- vehicle.external_id → commissions.vehicle_external_id (comissão gerada pela venda)`)
  lines.push(`- vehicle.external_id → financings.vehicle_external_id (financiamento do cliente)`)
  lines.push(`- vehicle.external_id → vehicle_trades.incoming/outgoing_vehicle_external_id (troca)`)
  lines.push(`- vehicle.external_id → orders.vehicle_external_id (pedido de venda)`)
  lines.push(``)
  lines.push(`**FUNCIONÁRIO/VENDEDOR** (employees):`)
  lines.push(`- employee.external_id = employee_external_id nos outros registros`)
  lines.push(`- employee.id → orders.employee_id (pedidos realizados pelo vendedor)`)
  lines.push(`- employee.external_id → orders.employee_external_id (pedidos pelo código externo)`)
  lines.push(`- employee.id → commissions.employee_id (comissões do vendedor)`)
  lines.push(`- employee.id → commission_standards.employee_id (regras de comissão do vendedor)`)
  lines.push(`- employee.id → employee_salaries.employee_id (pagamentos: salário, comissão, adiantamento)`)
  lines.push(`- employee.id → agendamentos.salesperson_id (atendimentos agendados pelo vendedor)`)
  lines.push(``)
  lines.push(`**CLIENTE** (customers):`)
  lines.push(`- customer.external_id → sale_data.customer_external_id (venda para o cliente)`)
  lines.push(`- customer.id → orders.customer_id (pedidos do cliente)`)
  lines.push(`- customer.external_id → financings.customer_external_id (financiamento do cliente)`)
  lines.push(`- customer.id → vehicle_trades.customer_id (troca realizada pelo cliente)`)
  lines.push(``)
  lines.push(`**PEDIDO** (orders) ↔ **VENDA** (sale_data):`)
  lines.push(`- orders.employee_external_id → employees.external_id: identifica o vendedor responsável pelo pedido`)
  lines.push(`- ATENÇÃO: nesta revenda orders.vehicle_external_id está NULO em todos os registros.`)
  lines.push(`  Não use orders para correlacionar veículo ↔ vendedor. Use commissions.`)
  lines.push(`- Para ranquear vendedores por veículo vendido: use commissions (vehicle_external_id + employee_external_id)`)
  lines.push(`- Para ranquear vendedores por número de pedidos: use orders (employee_external_id), mas sem saber qual carro`)
  lines.push(``)
  lines.push(`**DESPESAS** (expenses) vs **DESPESAS PÓS-VENDA** (post_sale_expenses):`)
  lines.push(`- expenses: custos ANTES ou DURANTE o período em estoque (preparação, IPVA, seguro, etc.)`)
  lines.push(`- post_sale_expenses: custos APÓS a venda (garantia, recalls, devolução)`)
  lines.push(`- Ambas vinculadas ao veículo via vehicle_external_id`)
  lines.push(``)
  lines.push(`**FORNECEDORES** (vendors):`)
  lines.push(`- vendors.external_id → purchase_data.supplier_external_id (fornecedor do veículo comprado)`)
  lines.push(`- vendors podem ser pessoas físicas ou jurídicas de quem a revenda compra veículos`)

  return lines.join('\n')
}

// ─── Main chat function with tool-use loop ─────────────────────────────────────

export async function chatWithClaude(
  messages: ChatMessage[],
  context: FullDealershipContext
): Promise<{ reply: string; dashboard?: DashboardConfig }> {
  const systemPrompt = buildSystemPrompt(context)
  // Keep only the last 10 messages (5 exchanges) to cap token usage on long conversations
  const recentMessages = messages.slice(-10)
  // Anthropic requires conversations to start with a user message — strip any leading assistant turns
  const trimmed = [...recentMessages]
  while (trimmed.length > 0 && trimmed[0].role === 'assistant') trimmed.shift()
  const apiMessages: Anthropic.MessageParam[] = trimmed.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const ALL_TOOLS = [DASHBOARD_TOOL, QUERY_VEHICLES_TOOL, ...FIPE_TOOLS, ...CALENDAR_TOOLS]

  let capturedDashboard: DashboardConfig | undefined
  let iterations = 0
  const MAX_ITERATIONS = 8

  // Agentic loop: keep calling Claude until it stops using tools
  while (true) {
    if (++iterations > MAX_ITERATIONS) {
      throw new Error(`Agentic loop exceeded ${MAX_ITERATIONS} iterations — possible tool loop detected`)
    }
    const response = await callWithRetry(() => getAI().messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: ALL_TOOLS,
      messages: apiMessages,
    } as any))

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
