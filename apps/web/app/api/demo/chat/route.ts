import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDashboardStats, demoVehicles, expensesByCategory, demoSales } from '@/lib/demo-data'
import { formatCurrency, formatPercent } from '@/lib/utils'
export const dynamic = 'force-dynamic'

function getAI() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) }

function buildDemoContext(): string {
  const stats = getDashboardStats()
  const available = demoVehicles.filter(v => v.status === 'available')
  const critical = available.filter(v => v.daysInStock > 60)
  const totalExpenses = expensesByCategory.reduce((s, e) => s + e.total, 0)

  const lines = [
    'Você é o assistente de IA da Moneycar, uma revenda de veículos usados em Praia Grande/SP.',
    'Responda em português brasileiro. Seja direto e use linguagem do mercado automotivo.',
    'Estes são dados reais da revenda (demonstração):',
    '',
    '## Estoque atual:',
    `- ${available.length} veículos disponíveis`,
    `- ${critical.length} veículos críticos (>60 dias parados)`,
    `- Tempo médio no estoque: ${stats.averageDaysInStock} dias`,
    `- Valor total do estoque: ${formatCurrency(stats.totalInventoryValue)}`,
    '',
    '## Veículos disponíveis:',
    ...available.map(v =>
      `- ${v.brand} ${v.model} ${v.yearModel} | ${v.km.toLocaleString('pt-BR')} km | ${formatCurrency(v.salePrice)} | ${v.daysInStock} dias no estoque | ${v.color} | ${v.fuel} | ${v.transmission}`
    ),
    '',
    '## Vendas do mês:',
    `- ${stats.soldThisMonth} veículos vendidos`,
    `- Faturamento: ${formatCurrency(stats.monthlyRevenue)}`,
    `- Lucro: ${formatCurrency(stats.monthlyProfit)}`,
    `- Margem média: ${formatPercent(stats.averageMargin)}`,
    '',
    '## Vendas recentes:',
    ...demoSales.map(s =>
      `- ${s.vehicle} | ${formatCurrency(s.salePrice)} | Lucro: ${formatCurrency(s.profit)} (${formatPercent(s.profitPercent)})`
    ),
    '',
    '## Despesas por categoria:',
    ...expensesByCategory.map(e =>
      `- ${e.category}: ${formatCurrency(e.total)} (${e.count} transações, média ${formatCurrency(e.average)})`
    ),
    `- Total de despesas: ${formatCurrency(totalExpenses)}`,
    '',
    'Responda qualquer pergunta sobre esses dados de forma natural e conversacional.',
    'Se perguntarem sobre algo não coberto pelos dados, seja honesto e diga o que está disponível.',
  ]

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[]
    }

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages' }, { status: 400 })
    }

    const response = await getAI().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildDemoContext(),
      messages,
    })

    const block = response.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type')

    return NextResponse.json({ reply: block.text })
  } catch (err) {
    console.error('Demo chat error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
