import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage } from '@/types'
import * as fipe from '@/lib/fipe/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const pct = (n: number) => `${n.toFixed(1)}%`

export interface FullDealershipContext {
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

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
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
  lines.push(`Você se chama **Moneycar AI**. Especialista em gestão de estoque, vendas e finanças de revendas.`)
  lines.push(`Responda sempre em português brasileiro. Seja direto e prático. Formate valores em R$. Use markdown quando útil.`)
  lines.push(`Você tem acesso COMPLETO a todos os dados da revenda listados abaixo. Nunca diga que não tem acesso a dados — eles estão todos aqui.`)
  lines.push(`Você também tem acesso à **Tabela FIPE em tempo real** via ferramentas (tools). Use-as sempre que precisar consultar preço de mercado de qualquer veículo.`)

  lines.push(`\n## Resumo Geral`)
  lines.push(`- Estoque: ${s.availableCount} disponíveis | ${s.soldCount} vendidos | ${s.totalVehicles} total`)
  lines.push(`- Críticos (>60 dias parados): ${s.criticalCount}`)
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
      const status = (v.days_in_stock ?? 0) > 60 ? '🔴 CRÍTICO' : (v.days_in_stock ?? 0) > 30 ? '🟡 ATENÇÃO' : '🟢 OK'
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
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context)
  const apiMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  // Agentic loop: keep calling Claude until it stops using tools
  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      tools: FIPE_TOOLS,
      messages: apiMessages,
    })

    // If Claude is done (no tool calls), return the text
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') throw new Error('No text in response')
      return textBlock.text
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
          const result = await executeTool(block.name, block.input as Record<string, any>)
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
    if (textBlock && textBlock.type === 'text') return textBlock.text
    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`)
  }
}
