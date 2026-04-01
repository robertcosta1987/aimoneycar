import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, DashboardStats, Vehicle, Expense } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface DealershipContext {
  dealershipName: string
  stats?: DashboardStats
  criticalVehicles?: Vehicle[]
  recentExpenses?: Expense[]
}

function buildSystemPrompt(ctx: DealershipContext): string {
  const lines: string[] = [
    `Você é o assistente de inteligência artificial da ${ctx.dealershipName}, uma revenda de veículos usados.`,
    `Você se chama Moneycar AI. Você é especialista em gestão de estoque, vendas e finanças de revendas de veículos.`,
    `Responda sempre em português brasileiro. Seja direto, prático e use linguagem do mercado automotivo.`,
    `Formate valores monetários em reais (R$). Use formatação markdown quando útil.`,
    '',
    '## Suas capacidades:',
    '- Analisar estoque e identificar veículos em risco (muitos dias parados)',
    '- Calcular margens, lucros e ROI de veículos',
    '- Alertar sobre despesas acima do esperado',
    '- Sugerir estratégias de precificação e vendas',
    '- Responder perguntas sobre performance da revenda',
    '- Ajudar a interpretar relatórios e métricas',
  ]

  if (ctx.stats) {
    const s = ctx.stats
    lines.push('')
    lines.push('## Dados atuais da revenda:')
    lines.push(`- Veículos disponíveis: ${s.available_vehicles} de ${s.total_vehicles} no estoque`)
    lines.push(`- Veículos críticos (>60 dias): ${s.critical_vehicles}`)
    lines.push(`- Média de dias no estoque: ${s.avg_days_in_stock} dias`)
    lines.push(`- Despesas totais do estoque: R$ ${s.total_expenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    lines.push(`- Vendas no mês: ${s.monthly_sales}`)
    lines.push(`- Receita do mês: R$ ${s.monthly_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    lines.push(`- Lucro do mês: R$ ${s.monthly_profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  if (ctx.criticalVehicles && ctx.criticalVehicles.length > 0) {
    lines.push('')
    lines.push('## Veículos críticos (mais de 60 dias no estoque):')
    ctx.criticalVehicles.slice(0, 5).forEach(v => {
      lines.push(`- ${v.brand} ${v.model} ${v.year_model} | ${v.days_in_stock} dias | R$ ${(v.sale_price ?? v.purchase_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    })
  }

  return lines.join('\n')
}

export async function chatWithClaude(
  messages: ChatMessage[],
  context: DealershipContext
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}
