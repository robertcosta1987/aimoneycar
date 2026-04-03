import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage } from '@/types'

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

function buildSystemPrompt(ctx: FullDealershipContext): string {
  const s = ctx.summary
  const lines: string[] = []

  lines.push(`Você é o assistente de inteligência artificial da **${ctx.dealershipName}**${ctx.dealershipCity ? ` (${ctx.dealershipCity})` : ''}, uma revenda de veículos usados.`)
  lines.push(`Você se chama **Moneycar AI**. Especialista em gestão de estoque, vendas e finanças de revendas.`)
  lines.push(`Responda sempre em português brasileiro. Seja direto e prático. Formate valores em R$. Use markdown quando útil.`)
  lines.push(`Você tem acesso COMPLETO a todos os dados da revenda listados abaixo. Nunca diga que não tem acesso a dados — eles estão todos aqui.`)

  // ── Summary ─────────────────────────────────────────────────────────────────
  lines.push(`\n## Resumo Geral`)
  lines.push(`- Estoque: ${s.availableCount} disponíveis | ${s.soldCount} vendidos | ${s.totalVehicles} total`)
  lines.push(`- Críticos (>60 dias parados): ${s.criticalCount}`)
  lines.push(`- Tempo médio em estoque (disponíveis): ${s.avgDaysAvailable} dias`)
  lines.push(`- Tempo médio até venda (vendidos): ${s.avgDaysSold} dias`)
  lines.push(`- Faturamento total (vendas): R$ ${brl(s.totalRevenue)}`)
  lines.push(`- Lucro total: R$ ${brl(s.totalProfit)}`)
  lines.push(`- Despesas totais: R$ ${brl(s.totalExpenses)}`)
  lines.push(`- Clientes cadastrados: ${s.totalCustomers}`)
  lines.push(`- Funcionários ativos: ${s.activeEmployees}`)
  lines.push(`- Pedidos em aberto: ${s.pendingOrders}`)

  // ── Sold vehicles — full list ────────────────────────────────────────────────
  if (ctx.soldVehicles.length > 0) {
    lines.push(`\n## Veículos Vendidos (${ctx.soldVehicles.length} total) — ordenado por tempo até venda`)
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

  // ── Available vehicles — full list ───────────────────────────────────────────
  if (ctx.availableVehicles.length > 0) {
    lines.push(`\n## Veículos em Estoque (${ctx.availableVehicles.length} disponíveis) — ordenado por dias parado`)
    lines.push(`| # | Veículo | Placa | Ano | Preço Compra | Preço Venda | Despesas | Dias | Status |`)
    lines.push(`|---|---------|-------|-----|-------------|-------------|----------|------|--------|`)
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

  // ── Expenses by category ─────────────────────────────────────────────────────
  const expCats = Object.entries(ctx.expensesByCategory).sort((a, b) => b[1] - a[1])
  if (expCats.length > 0) {
    lines.push(`\n## Despesas por Categoria`)
    expCats.forEach(([cat, total]) => {
      const share = s.totalExpenses > 0 ? (total / s.totalExpenses) * 100 : 0
      lines.push(`- ${cat}: R$ ${brl(total)} (${pct(share)})`)
    })
  }

  // ── Financings ───────────────────────────────────────────────────────────────
  if (ctx.financings.length > 0) {
    lines.push(`\n## Financiamentos (${ctx.financings.length})`)
    ctx.financings.slice(0, 30).forEach(f => {
      lines.push(`- Veículo ${f.vehicle_external_id ?? '?'} | ${f.bank ?? '—'} | R$ ${brl(f.total_amount ?? 0)} | ${f.installments ?? '?'}x | Status: ${f.status}`)
    })
  }

  // ── Fines ────────────────────────────────────────────────────────────────────
  const unpaidFines = ctx.fines.filter(f => !f.is_paid)
  if (ctx.fines.length > 0) {
    lines.push(`\n## Multas (${ctx.fines.length} total, ${unpaidFines.length} não pagas)`)
    const totalFines = ctx.fines.reduce((s, f) => s + (f.amount ?? 0), 0)
    const unpaidTotal = unpaidFines.reduce((s, f) => s + (f.amount ?? 0), 0)
    lines.push(`- Total: R$ ${brl(totalFines)} | Não pagas: R$ ${brl(unpaidTotal)}`)
  }

  // ── Employees ────────────────────────────────────────────────────────────────
  if (ctx.employees.length > 0) {
    lines.push(`\n## Funcionários`)
    ctx.employees.forEach(e => {
      lines.push(`- ${e.name} | ${e.role ?? 'sem cargo'} | ${e.is_active ? 'ativo' : 'inativo'}`)
    })
  }

  // ── Customers summary ────────────────────────────────────────────────────────
  if (ctx.customers.length > 0) {
    const bySource: Record<string, number> = {}
    ctx.customers.forEach(c => { const src = c.source ?? 'Desconhecido'; bySource[src] = (bySource[src] ?? 0) + 1 })
    lines.push(`\n## Clientes (${ctx.customers.length} cadastrados)`)
    Object.entries(bySource).sort((a, b) => b[1] - a[1]).forEach(([src, n]) => {
      lines.push(`- ${src}: ${n}`)
    })
  }

  return lines.join('\n')
}

export async function chatWithClaude(
  messages: ChatMessage[],
  context: FullDealershipContext
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system: buildSystemPrompt(context),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}
