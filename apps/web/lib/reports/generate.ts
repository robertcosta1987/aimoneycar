import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { ReportType, ReportPayload } from '@/types/reports'

function getAI() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) }

export async function generateReport(
  supabase: SupabaseClient,
  tipo: ReportType,
  dealership_id: string,
  periodo_dias: number,
  dealership_name: string
): Promise<ReportPayload> {
  const cutoff = new Date(Date.now() - periodo_dias * 86400_000).toISOString().split('T')[0]
  const prevCutoff = new Date(Date.now() - periodo_dias * 2 * 86400_000).toISOString().split('T')[0]

  let rawData: Record<string, unknown> = {}
  let insights: string[] = []

  if (tipo === 'sales_overview') {
    const { data: sold } = await supabase
      .from('vehicles')
      .select('sale_price, purchase_price, sale_date, days_in_stock, expenses:expenses(amount)')
      .eq('dealership_id', dealership_id)
      .eq('status', 'sold')
      .gte('sale_date', cutoff)

    const enriched = (sold ?? []).map((v: any) => {
      const exp = (v.expenses ?? []).reduce((s: number, e: any) => s + e.amount, 0)
      const profit = (v.sale_price ?? 0) - v.purchase_price - exp
      const margin = v.sale_price > 0 ? (profit / v.sale_price) * 100 : 0
      const day = v.sale_date?.slice(5) ?? ''
      return { ...v, profit, margin, day }
    })

    const byDay = enriched.reduce((acc: Record<string, { revenue: number; profit: number }>, s) => {
      if (!acc[s.day]) acc[s.day] = { revenue: 0, profit: 0 }
      acc[s.day].revenue += s.sale_price ?? 0
      acc[s.day].profit += s.profit
      return acc
    }, {})

    rawData = {
      revenue: enriched.reduce((s, x) => s + (x.sale_price ?? 0), 0),
      profit: enriched.reduce((s, x) => s + x.profit, 0),
      count: enriched.length,
      avgMargin: enriched.length ? enriched.reduce((s, x) => s + x.margin, 0) / enriched.length : 0,
      salesByDay: Object.entries(byDay).map(([day, d]) => ({ day, ...d })),
    }

  } else if (tipo === 'inventory_health') {
    const { data: avail } = await supabase
      .from('vehicles')
      .select('id, brand, model, plate, days_in_stock, sale_price')
      .eq('dealership_id', dealership_id)
      .eq('status', 'available')
      .order('days_in_stock', { ascending: false })

    const list = avail ?? []
    rawData = {
      total: list.length,
      healthy: list.filter((v: any) => v.days_in_stock <= 30).length,
      warning: list.filter((v: any) => v.days_in_stock > 30 && v.days_in_stock <= 60).length,
      critical: list.filter((v: any) => v.days_in_stock > 60).length,
      avgDays: list.length ? Math.round(list.reduce((s, v: any) => s + v.days_in_stock, 0) / list.length) : 0,
      criticalVehicles: list
        .filter((v: any) => v.days_in_stock > 60)
        .slice(0, 5)
        .map((v: any) => ({ name: `${v.brand} ${v.model}`, plate: v.plate, days: v.days_in_stock, price: v.sale_price })),
    }

  } else if (tipo === 'margin_analysis') {
    const { data: sold } = await supabase
      .from('vehicles')
      .select('brand, model, sale_price, purchase_price, expenses:expenses(amount)')
      .eq('dealership_id', dealership_id)
      .eq('status', 'sold')
      .gte('sale_date', cutoff)

    const enriched = (sold ?? []).map((v: any) => {
      const exp = (v.expenses ?? []).reduce((s: number, e: any) => s + e.amount, 0)
      const profit = (v.sale_price ?? 0) - v.purchase_price - exp
      const margin = v.sale_price > 0 ? (profit / v.sale_price) * 100 : 0
      return { name: `${v.brand} ${v.model}`, margin, profit }
    }).sort((a, b) => b.margin - a.margin)

    rawData = {
      avgMargin: enriched.length ? enriched.reduce((s, x) => s + x.margin, 0) / enriched.length : 0,
      bestMargin: enriched[0]?.margin ?? 0,
      worstMargin: enriched[enriched.length - 1]?.margin ?? 0,
      vehicles: enriched.slice(0, 8),
    }

  } else if (tipo === 'expense_breakdown') {
    const { data: exps } = await supabase
      .from('expenses')
      .select('category, amount')
      .eq('dealership_id', dealership_id)
      .gte('date', cutoff)

    const list = exps ?? []
    const byCategory = list.reduce((acc: Record<string, { total: number; count: number }>, e: any) => {
      const cat = e.category || 'Outros'
      if (!acc[cat]) acc[cat] = { total: 0, count: 0 }
      acc[cat].total += e.amount
      acc[cat].count += 1
      return acc
    }, {})

    rawData = {
      total: list.reduce((s, e: any) => s + e.amount, 0),
      categoryCount: Object.keys(byCategory).length,
      entryCount: list.length,
      byCategory: Object.entries(byCategory)
        .map(([cat, d]) => ({ cat, ...d }))
        .sort((a, b) => b.total - a.total),
    }

  } else if (tipo === 'monthly_comparison') {
    const [{ data: curr }, { data: prev }] = await Promise.all([
      supabase.from('vehicles').select('sale_price, purchase_price, expenses:expenses(amount)')
        .eq('dealership_id', dealership_id).eq('status', 'sold').gte('sale_date', cutoff),
      supabase.from('vehicles').select('sale_price, purchase_price, expenses:expenses(amount)')
        .eq('dealership_id', dealership_id).eq('status', 'sold').gte('sale_date', prevCutoff).lt('sale_date', cutoff),
    ])

    const calc = (list: any[]) => {
      const rev = list.reduce((s, v) => s + (v.sale_price ?? 0), 0)
      const profit = list.reduce((s, v) => {
        const exp = (v.expenses ?? []).reduce((ss: number, e: any) => ss + e.amount, 0)
        return s + (v.sale_price ?? 0) - v.purchase_price - exp
      }, 0)
      return { rev, profit, count: list.length }
    }

    const c = calc(curr ?? [])
    const p = calc(prev ?? [])

    rawData = {
      currentRevenue: c.rev,
      prevRevenue: p.rev,
      currentProfit: c.profit,
      prevProfit: p.profit,
      currentCount: c.count,
      prevCount: p.count,
      profitChange: p.profit > 0 ? ((c.profit - p.profit) / p.profit) * 100 : 0,
      revenueChange: p.rev > 0 ? ((c.rev - p.rev) / p.rev) * 100 : 0,
    }

  } else if (tipo === 'salesperson_performance') {
    const { data: sold } = await supabase
      .from('vehicles')
      .select('sale_price, purchase_price, sold_by, expenses:expenses(amount)')
      .eq('dealership_id', dealership_id)
      .eq('status', 'sold')
      .gte('sale_date', cutoff)

    const byRep = (sold ?? []).reduce((acc: Record<string, { revenue: number; profit: number; count: number }>, v: any) => {
      const rep = v.sold_by ?? 'Desconhecido'
      if (!acc[rep]) acc[rep] = { revenue: 0, profit: 0, count: 0 }
      const exp = (v.expenses ?? []).reduce((s: number, e: any) => s + e.amount, 0)
      acc[rep].revenue += v.sale_price ?? 0
      acc[rep].profit += (v.sale_price ?? 0) - v.purchase_price - exp
      acc[rep].count += 1
      return acc
    }, {})

    const reps = Object.entries(byRep)
      .map(([name, d]) => ({ name, ...d, margin: d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue)

    rawData = {
      totalSales: (sold ?? []).length,
      totalRevenue: reps.reduce((s, r) => s + r.revenue, 0),
      topName: reps[0]?.name ?? '—',
      reps,
    }

  } else if (tipo === 'lead_funnel') {
    const [{ data: chats }, { data: bookings }] = await Promise.all([
      supabase.from('widget_conversations').select('id')
        .eq('dealership_id', dealership_id).gte('created_at', cutoff),
      supabase.from('agendamentos').select('id')
        .eq('dealership_id', dealership_id).gte('created_at', cutoff),
    ])

    const leads = (chats ?? []).length
    const bookingCount = (bookings ?? []).length
    rawData = {
      leads,
      bookings: bookingCount,
      conversionRate: leads > 0 ? (bookingCount / leads) * 100 : 0,
    }
  }

  // AI Insights
  try {
    const msg = await getAI().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Você é um analista de negócios para revendas de veículos brasileiras.
Analise os dados abaixo do relatório "${tipo}" e gere exatamente 3 insights acionáveis em português (pt-BR).
Cada insight deve ser uma frase direta com recomendação. Responda SOMENTE com um JSON array de 3 strings.

Dados: ${JSON.stringify(rawData)}`,
      }],
    })

    const text = (msg.content[0] as { text: string }).text.trim()
    const match = text.match(/\[[\s\S]*\]/)
    if (match) insights = JSON.parse(match[0])
  } catch {
    insights = ['Importe mais dados para gerar insights personalizados.']
  }

  return {
    tipo,
    dealership_id,
    periodo_dias,
    generated_at: new Date().toISOString(),
    dealership_name,
    data: rawData,
    insights,
  }
}
