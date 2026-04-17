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
  // Pre-compute candidates locally for deterministic alerts
  const candidates: AlertCandidate[] = []

  // Vehicles over 90 days
  const critical = vehicles.filter(v => v.status === 'available' && v.days_in_stock > 90)
  critical.forEach(v => {
    candidates.push({
      vehicle: v,
      reason: `${v.brand} ${v.model} ${v.year_model} está há ${v.days_in_stock} dias no estoque`,
    })
  })

  // Vehicles between 46-90 days
  const warning = vehicles.filter(v => v.status === 'available' && v.days_in_stock >= 46 && v.days_in_stock <= 90)
  warning.slice(0, 3).forEach(v => {
    candidates.push({
      vehicle: v,
      reason: `${v.brand} ${v.model} ${v.year_model} está há ${v.days_in_stock} dias no estoque`,
    })
  })

  // High expense vehicles
  const expensesByVehicle = expenses.reduce<Record<string, number>>((acc, e) => {
    if (e.vehicle_id) {
      acc[e.vehicle_id] = (acc[e.vehicle_id] ?? 0) + e.amount
    }
    return acc
  }, {})

  vehicles.forEach(v => {
    if (v.status !== 'available') return
    const totalExp = expensesByVehicle[v.id] ?? 0
    const expenseRatio = totalExp / v.purchase_price
    if (expenseRatio > 0.15) {
      candidates.push({
        vehicle: v,
        totalExpenses: totalExp,
        reason: `${v.brand} ${v.model} acumulou R$ ${totalExp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em despesas (${(expenseRatio * 100).toFixed(1)}% do custo de compra)`,
      })
    }
  })

  if (candidates.length === 0 && vehicles.filter(v => v.status === 'available').length === 0) {
    return []
  }

  // Use Claude to generate natural language alerts from candidates
  const prompt = `Você é o sistema de alertas da revenda "${dealershipName}".
Com base nos dados abaixo, gere alertas claros e acionáveis em português.
Para cada situação, gere um objeto JSON com: type ("critical"|"warning"|"info"|"success"), title (curto), message (1-2 frases), action (texto do botão ou null).

Situações identificadas:
${candidates.map((c, i) => `${i + 1}. ${c.reason}`).join('\n')}

Total de veículos disponíveis: ${vehicles.filter(v => v.status === 'available').length}
Veículos críticos (>60 dias): ${critical.length}

Responda APENAS com um array JSON válido. Exemplo:
[{"type":"critical","title":"Veículo parado há 90 dias","message":"O Fiat Uno 2020 está há 90 dias sem venda. Considere reduzir o preço.","action":"Ver veículo"}]`

  let alerts: Omit<AIAlert, 'id' | 'created_at'>[] = []

  try {
    const response = await getAI().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        type: AIAlert['type']
        title: string
        message: string
        action: string | null
      }>

      alerts = parsed.map((a, i) => ({
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
  } catch (err) {
    console.error('Claude alert generation failed:', err)
  }

  return alerts
}
