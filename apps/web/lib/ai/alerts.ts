import Anthropic from '@anthropic-ai/sdk'
import type { Vehicle, Expense, AIAlert } from '@/types'

function getAI() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) }

export interface AlertCandidate {
  vehicle?: Vehicle
  totalExpenses?: number
  reason: string
  data?: Record<string, unknown>
}

export async function generateDailyAlerts(
  dealershipId: string,
  dealershipName: string,
  vehicles: Vehicle[],
  expenses: Expense[]
): Promise<Omit<AIAlert, 'id' | 'created_at'>[]> {
  const available = vehicles.filter(v => v.status === 'available')

  // Sort and cap each category to avoid a massive prompt
  const critical = available
    .filter(v => v.days_in_stock > 90)
    .sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0))
    .slice(0, 10)

  const attention = available
    .filter(v => v.days_in_stock >= 46 && v.days_in_stock <= 90)
    .sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0))
    .slice(0, 5)

  // Build expense map
  const expensesByVehicle = expenses.reduce<Record<string, number>>((acc, e) => {
    if (e.vehicle_id) acc[e.vehicle_id] = (acc[e.vehicle_id] ?? 0) + e.amount
    return acc
  }, {})

  const highExpense = available
    .filter(v => v.purchase_price > 0)
    .map(v => ({ v, ratio: (expensesByVehicle[v.id] ?? 0) / v.purchase_price }))
    .filter(({ ratio }) => ratio > 0.15)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5)
    .map(({ v, ratio }) => ({
      vehicle: v,
      totalExpenses: expensesByVehicle[v.id],
      reason: `${v.brand} ${v.model} acumulou R$ ${(expensesByVehicle[v.id] ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em despesas (${(ratio * 100).toFixed(1)}% do custo de compra)`,
    }))

  const candidates: AlertCandidate[] = [
    ...critical.map(v => ({
      vehicle: v,
      reason: `${v.brand} ${v.model} ${v.year_model ?? ''} (placa ${v.plate ?? 'sem placa'}) está há ${v.days_in_stock} dias no estoque`,
    })),
    ...attention.map(v => ({
      vehicle: v,
      reason: `${v.brand} ${v.model} ${v.year_model ?? ''} (placa ${v.plate ?? 'sem placa'}) está há ${v.days_in_stock} dias no estoque`,
    })),
    ...highExpense,
  ]

  // No alerts needed if fleet is healthy
  if (candidates.length === 0) return []

  const criticalTotal = available.filter(v => v.days_in_stock > 90).length
  const attentionTotal = available.filter(v => v.days_in_stock >= 46 && v.days_in_stock <= 90).length

  const prompt = `Você é o sistema de alertas da revenda "${dealershipName}".
Analise as situações abaixo e gere exatamente ${candidates.length} alertas em português, um por situação listada, na mesma ordem.

Frota disponível: ${available.length} veículos | Críticos (>90d): ${criticalTotal} | Atenção (46-90d): ${attentionTotal}

Situações (${candidates.length} no total):
${candidates.map((c, i) => `${i + 1}. ${c.reason}`).join('\n')}

Responda APENAS com um array JSON de exatamente ${candidates.length} objetos, na mesma ordem:
[{"type":"critical"|"warning"|"info"|"success","title":"título curto","message":"1-2 frases acionáveis","action":"texto do botão ou null"}]`

  // Throws on API error — caller handles it
  const response = await getAI().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error(`Claude returned no valid JSON. Response: ${text.slice(0, 200)}`)

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    type: AIAlert['type']
    title: string
    message: string
    action: string | null
  }>

  return parsed.map((a, i) => ({
    dealership_id: dealershipId,
    vehicle_id: candidates[i]?.vehicle?.id ?? null,
    type: a.type,
    title: a.title,
    message: a.message,
    action: a.action,
    action_data: candidates[i]?.vehicle ? { vehicle_id: candidates[i].vehicle!.id } : null,
    is_read: false,
    is_dismissed: false,
    sent_whatsapp: false,
  }))
}
