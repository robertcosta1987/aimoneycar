/**
 * lib/reports/executive.ts
 *
 * Server-side engine that computes all Executive Report data from Supabase.
 * Called by the POST /api/reports/generate route.
 *
 * All monetary arithmetic uses integer centavos internally.
 * Outputs: ExecutiveReportData (stored as JSONB in executive_reports table)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ReportType, ReportPeriod, ExecutiveReportData,
  TimeSeriesPoint, FinancialOverview, SalesPerformance, SaleVehicleRow,
  InventoryHealth, InventoryVehicleRow, AgingBucket, ExpenseBreakdown,
  ExpenseCategoryRow, FinancingOverview, FinancingByBank,
  OperationalMetrics, InflowOutflowPoint, AlertRecommendation,
} from '@/types/report.types'
import { MONTHS_SHORT, WEEKDAYS_SHORT } from '@/types/report.types'
import { formatCurrency } from '@/lib/utils'

// ─── Internal helpers ─────────────────────────────────────────────────────────

function toCents(v: number) { return Math.round(v * 100) }
function fromCents(c: number) { return c / 100 }

const MONTHS_BR_FULL = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// ─── Period ───────────────────────────────────────────────────────────────────

export function getPeriodDates(type: ReportType): ReportPeriod {
  const now = new Date()
  let start: Date, end: Date, label: string

  switch (type) {
    case 'weekly': {
      end = new Date(now)
      start = new Date(now)
      start.setDate(start.getDate() - 6)
      label = `Semana de ${fmtDate(start)} a ${fmtDate(end)}`
      break
    }
    case 'monthly': {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      label = `${MONTHS_BR_FULL[now.getMonth()]} ${now.getFullYear()}`
      break
    }
    case 'quarterly': {
      // Last 3 complete calendar months
      const endMonth  = now.getMonth()        // current month index
      const endYear   = now.getFullYear()
      start = new Date(endYear, endMonth - 2, 1)
      end   = new Date(endYear, endMonth + 1, 0)
      label = `${MONTHS_SHORT[start.getMonth()]}–${MONTHS_SHORT[end.getMonth()]} ${endYear}`
      break
    }
    case 'annual': {
      start = new Date(now.getFullYear(), 0, 1)
      end   = new Date(now.getFullYear(), 11, 31)
      label = `Anual ${now.getFullYear()}`
      break
    }
  }

  return {
    type,
    label,
    start: isoDate(start),
    end:   isoDate(end),
  }
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

// ─── Period breakdown labels ──────────────────────────────────────────────────

function getPeriodBuckets(type: ReportType, start: Date, end: Date): Array<{ label: string; start: Date; end: Date }> {
  if (type === 'weekly') {
    // 7 daily buckets
    const buckets = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const dayEnd = new Date(d)
      dayEnd.setHours(23,59,59)
      buckets.push({ label: WEEKDAYS_SHORT[d.getDay()], start: d, end: dayEnd })
    }
    return buckets
  }

  if (type === 'monthly') {
    // Weekly buckets (split month into 4-5 week ranges)
    const buckets: Array<{ label: string; start: Date; end: Date }> = []
    let cur = new Date(start)
    let weekNum = 1
    while (cur <= end) {
      const wStart = new Date(cur)
      const wEnd   = new Date(cur)
      wEnd.setDate(wEnd.getDate() + 6)
      if (wEnd > end) wEnd.setTime(end.getTime())
      buckets.push({ label: `Sem ${weekNum}`, start: wStart, end: wEnd })
      cur.setDate(cur.getDate() + 7)
      weekNum++
    }
    return buckets
  }

  // quarterly / annual → monthly buckets
  const buckets: Array<{ label: string; start: Date; end: Date }> = []
  let cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur <= end) {
    const mStart = new Date(cur)
    const mEnd   = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    buckets.push({ label: MONTHS_SHORT[cur.getMonth()], start: mStart, end: mEnd })
    cur.setMonth(cur.getMonth() + 1)
  }
  return buckets
}

// ─── Main compute function ────────────────────────────────────────────────────

export async function computeExecutiveReport(
  supabase: SupabaseClient,
  dealId: string,
  type: ReportType,
): Promise<ExecutiveReportData> {

  const period = getPeriodDates(type)
  const { start: pStart, end: pEnd } = period

  // ── Parallel queries ───────────────────────────────────────────────────────
  const [
    { data: dealershipData },
    { data: soldRaw },
    { data: inventoryRaw },
    { data: acquiredRaw },
    { data: expensesRaw },
    { data: salesRaw },
  ] = await Promise.all([
    // Dealership info
    supabase.from('users').select('dealership_id, dealerships!inner(name, address, city, state)')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .single(),

    // Vehicles sold in period
    supabase.from('vehicles')
      .select('id,brand,model,plate,year_fab,year_model,purchase_price,sale_price,purchase_date,sale_date,days_in_stock,expenses:expenses(id,category,description,amount,date)')
      .eq('dealership_id', dealId)
      .eq('status', 'sold')
      .gte('sale_date', pStart)
      .lte('sale_date', pEnd),

    // Current inventory (available + reserved)
    supabase.from('vehicles')
      .select('id,brand,model,plate,year_fab,year_model,purchase_price,sale_price,days_in_stock')
      .eq('dealership_id', dealId)
      .in('status', ['available', 'reserved']),

    // Vehicles acquired in period
    supabase.from('vehicles')
      .select('id,brand,model,purchase_date,purchase_price')
      .eq('dealership_id', dealId)
      .gte('purchase_date', pStart)
      .lte('purchase_date', pEnd),

    // All expenses in period (fleet-wide)
    supabase.from('expenses')
      .select('id,category,description,amount,date,vehicle_id,vehicles!left(brand,model)')
      .eq('dealership_id', dealId)
      .gte('date', pStart)
      .lte('date', pEnd),

    // Sales records (for financing overview)
    supabase.from('sales')
      .select('id,sale_price,purchase_price,total_expenses,payment_method,financing_bank,down_payment')
      .eq('dealership_id', dealId)
      .gte('sale_date', pStart)
      .lte('sale_date', pEnd),
  ])

  const sold      = (soldRaw      || []) as any[]
  const inventory = (inventoryRaw || []) as any[]
  const acquired  = (acquiredRaw  || []) as any[]
  const expenses  = (expensesRaw  || []) as any[]
  const salesList = (salesRaw     || []) as any[]

  const dealership = (dealershipData as any)?.dealerships as any
  const dealershipName    = dealership?.name ?? 'Revenda'
  const dealershipAddress = dealership?.city && dealership?.state
    ? `${dealership.city}, ${dealership.state}`
    : null

  // ── Enrich sold vehicles with their expense totals ─────────────────────────
  const soldEnriched: SaleVehicleRow[] = sold.map(v => {
    const expTotal = fromCents(
      (v.expenses || []).reduce((s: number, e: any) => s + toCents(e.amount), 0)
    )
    const profit  = fromCents(toCents(v.sale_price || 0) - toCents(v.purchase_price) - toCents(expTotal))
    const margin  = v.sale_price ? (profit / v.sale_price) * 100 : 0
    return {
      id:            v.id,
      name:          `${v.brand} ${v.model} ${v.year_model}`,
      plate:         v.plate,
      purchasePrice: v.purchase_price,
      salePrice:     v.sale_price || 0,
      totalExpenses: expTotal,
      profit,
      margin,
      daysToSell:    v.days_in_stock ?? 0,
      saleDate:      v.sale_date,
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 4.2 FINANCIAL OVERVIEW
  // ─────────────────────────────────────────────────────────────────────────

  const totalRevenue    = fromCents(sold.reduce((s, v) => s + toCents(v.sale_price || 0), 0))
  const totalProfit     = fromCents(soldEnriched.reduce((s, v) => s + toCents(v.profit), 0))
  const totalExpenses   = fromCents(expenses.reduce((s, e: any) => s + toCents(e.amount), 0))
  const avgMargin       = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const totalPurchase   = fromCents(sold.reduce((s, v) => s + toCents(v.purchase_price), 0))
  const roi             = totalPurchase > 0 ? (totalProfit / totalPurchase) * 100 : 0

  const startDate = new Date(pStart)
  const endDate   = new Date(pEnd)
  const buckets   = getPeriodBuckets(type, startDate, endDate)

  const chartData: TimeSeriesPoint[] = buckets.map(b => {
    const bSold = sold.filter(v => {
      const d = new Date(v.sale_date)
      return d >= b.start && d <= b.end
    })
    const bExp = expenses.filter(e => {
      const d = new Date(e.date)
      return d >= b.start && d <= b.end
    })
    const bEnriched: SaleVehicleRow[] = soldEnriched.filter(v =>
      bSold.some(s => s.id === v.id)
    )
    const rev  = fromCents(bSold.reduce((s, v) => s + toCents(v.sale_price || 0), 0))
    const exp  = fromCents(bExp.reduce((s, e: any) => s + toCents(e.amount), 0))
    const prof = fromCents(bEnriched.reduce((s, v) => s + toCents(v.profit), 0))
    return {
      label:    b.label,
      revenue:  rev,
      profit:   prof,
      expenses: exp,
      margin:   rev > 0 ? (prof / rev) * 100 : 0,
      units:    bSold.length,
    }
  })

  const marginTrend = chartData.map(d => ({ label: d.label, margin: d.margin }))

  const financial: FinancialOverview = {
    totalRevenue, totalProfit, totalExpenses, avgMargin, roi,
    chartData, marginTrend,
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4.3 SALES PERFORMANCE
  // ─────────────────────────────────────────────────────────────────────────

  const avgDaysToSell = soldEnriched.length
    ? Math.round(soldEnriched.reduce((s, v) => s + v.daysToSell, 0) / soldEnriched.length)
    : 0

  const sortedByDays = [...soldEnriched].sort((a, b) => a.daysToSell - b.daysToSell)
  const fastestSale = sortedByDays[0]
    ? { name: sortedByDays[0].name, plate: sortedByDays[0].plate, days: sortedByDays[0].daysToSell }
    : null
  const slowestSale = sortedByDays[sortedByDays.length - 1]
    ? { name: sortedByDays[sortedByDays.length - 1].name, plate: sortedByDays[sortedByDays.length - 1].plate, days: sortedByDays[sortedByDays.length - 1].daysToSell }
    : null

  const topProfitable = [...soldEnriched].sort((a, b) => b.profit - a.profit).slice(0, 5)
  const bottomMargin  = [...soldEnriched]
    .filter(v => v.salePrice > 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 5)

  const unitsByPeriod = chartData.map(d => ({ label: d.label, units: d.units }))

  const sales: SalesPerformance = {
    totalSold: sold.length, avgDaysToSell, fastestSale, slowestSale,
    topProfitable, bottomMargin, unitsByPeriod,
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4.4 INVENTORY HEALTH
  // ─────────────────────────────────────────────────────────────────────────

  const totalInStock   = inventory.length
  const avgDaysInStock = inventory.length
    ? Math.round(inventory.reduce((s: number, v: any) => s + (v.days_in_stock ?? 0), 0) / inventory.length)
    : 0

  const toInvRow = (v: any): InventoryVehicleRow => ({
    id:            v.id,
    name:          `${v.brand} ${v.model} ${v.year_model}`,
    plate:         v.plate,
    daysInStock:   v.days_in_stock ?? 0,
    salePrice:     v.sale_price,
    purchasePrice: v.purchase_price,
  })

  const attentionVehicles  = inventory.filter((v: any) => v.days_in_stock >= 30 && v.days_in_stock <= 60).map(toInvRow)
  const criticalVehicles   = inventory.filter((v: any) => v.days_in_stock > 60).map(toInvRow)
  const missingPriceVehicles = inventory.filter((v: any) => !v.sale_price || v.sale_price === 0).map(toInvRow)

  const agingDistribution: AgingBucket[] = [
    { label: '0–15d',  count: inventory.filter((v: any) => v.days_in_stock >= 0  && v.days_in_stock <= 15).length, color: '#00E676' },
    { label: '16–30d', count: inventory.filter((v: any) => v.days_in_stock >= 16 && v.days_in_stock <= 30).length, color: '#00D9FF' },
    { label: '31–60d', count: inventory.filter((v: any) => v.days_in_stock >= 31 && v.days_in_stock <= 60).length, color: '#FFB800' },
    { label: '>60d',   count: inventory.filter((v: any) => v.days_in_stock > 60).length,                           color: '#FF5252' },
  ]

  const inventoryHealth: InventoryHealth = {
    totalInStock, avgDaysInStock, attentionVehicles, criticalVehicles,
    missingPriceVehicles, agingDistribution,
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4.5 EXPENSE BREAKDOWN
  // ─────────────────────────────────────────────────────────────────────────

  const catMap: Record<string, { total: number; count: number }> = {}
  for (const e of expenses) {
    const cat = (e.category || 'OUTROS').toUpperCase()
    if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 }
    catMap[cat].total = fromCents(toCents(catMap[cat].total) + toCents(e.amount))
    catMap[cat].count++
  }
  const byCategory: ExpenseCategoryRow[] = Object.entries(catMap)
    .map(([category, { total, count }]) => ({
      category, total, count,
      percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  const avgPerVehicleSold = sold.length > 0
    ? fromCents(Math.round(toCents(totalExpenses) / sold.length))
    : 0

  const largestExp = [...expenses].sort((a: any, b: any) => b.amount - a.amount)[0]
  const largestItem = largestExp
    ? {
        description:  largestExp.description || largestExp.category,
        category:     largestExp.category,
        amount:       largestExp.amount,
        vehicleName:  largestExp.vehicles ? `${largestExp.vehicles.brand} ${largestExp.vehicles.model}` : null,
      }
    : null

  const expenseBreakdown: ExpenseBreakdown = {
    totalExpenses, byCategory, avgPerVehicleSold, largestItem,
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4.6 FINANCING OVERVIEW
  // ─────────────────────────────────────────────────────────────────────────

  const financed  = salesList.filter(s => {
    const pm = (s.payment_method || '').toLowerCase()
    return pm.includes('financiamento') || pm.includes('banco') || pm.includes('financi')
  })
  const cashSales = salesList.filter(s => !financed.some(f => f.id === s.id))

  const bankMap: Record<string, { count: number; total: number }> = {}
  for (const s of financed) {
    const bank = s.financing_bank || 'Não informado'
    if (!bankMap[bank]) bankMap[bank] = { count: 0, total: 0 }
    bankMap[bank].count++
    bankMap[bank].total = fromCents(toCents(bankMap[bank].total) + toCents(s.sale_price || 0))
  }
  const byBank: FinancingByBank[] = Object.entries(bankMap)
    .map(([bank, { count, total }]) => ({ bank, count, totalAmount: total }))
    .sort((a, b) => b.count - a.count)

  const totalFinancedAmount = fromCents(financed.reduce((s, f) => s + toCents(f.sale_price || 0), 0))
  const cashAmount = fromCents(cashSales.reduce((s, c) => s + toCents(c.sale_price || 0), 0))
  const missingDataContracts = financed.filter(s => !s.financing_bank || s.sale_price === 0).length

  const financing: FinancingOverview = {
    totalContracts: financed.length,
    totalFinancedAmount,
    cashCount: cashSales.length,
    cashAmount,
    byBank,
    missingDataContracts,
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4.7 OPERATIONAL METRICS
  // ─────────────────────────────────────────────────────────────────────────

  const avgInventory = (totalInStock + sold.length) / 2 || 1
  const turnoverRate = fromCents(Math.round((toCents(sold.length) / toCents(avgInventory)) * 10000)) / 100

  const bestPeriodBucket = chartData.reduce(
    (best, d) => (d.units > best.units ? d : best),
    { label: '—', units: 0 }
  )
  const bestPeriod = { label: bestPeriodBucket.label, units: bestPeriodBucket.units }

  const inflow: InflowOutflowPoint[] = buckets.map((b, i) => {
    const acq = acquired.filter(v => {
      const d = new Date(v.purchase_date)
      return d >= b.start && d <= b.end
    }).length
    return { label: b.label, acquired: acq, sold: chartData[i]?.units ?? 0 }
  })

  const operational: OperationalMetrics = { turnoverRate, bestPeriod, inflow }

  // ─────────────────────────────────────────────────────────────────────────
  // 4.8 ALERTS & RECOMMENDATIONS
  // ─────────────────────────────────────────────────────────────────────────

  const alerts: AlertRecommendation[] = []

  // Critical inventory
  if (criticalVehicles.length > 0) {
    alerts.push({
      level: 'red', icon: '🔴',
      message: `${criticalVehicles.length} veículo${criticalVehicles.length > 1 ? 's' : ''} há mais de 60 dias em estoque`,
      recommendation: 'Considere revisão de preço ou ação promocional para esses veículos.',
    })
  }

  // Low margin vehicles
  const lowMarginSold = soldEnriched.filter(v => v.salePrice > 0 && v.margin < 10)
  if (lowMarginSold.length > 0) {
    alerts.push({
      level: 'yellow', icon: '🟡',
      message: `${lowMarginSold.length} veículo${lowMarginSold.length > 1 ? 's vendidos com' : ' vendido com'} margem abaixo de 10%`,
      recommendation: 'Revise a estratégia de custo de aquisição.',
    })
  }

  // High expense ratio
  if (totalRevenue > 0 && totalExpenses / totalRevenue > 0.05) {
    const pct = ((totalExpenses / totalRevenue) * 100).toFixed(1)
    alerts.push({
      level: 'yellow', icon: '🟡',
      message: `Taxa de despesas em ${pct}% da receita — acima da meta de 5%`,
      recommendation: 'Revise os custos operacionais e de manutenção.',
    })
  }

  // Excellent turnover
  if (avgDaysToSell > 0 && avgDaysToSell < 15) {
    alerts.push({
      level: 'green', icon: '🟢',
      message: `Excelente giro de estoque — tempo médio de venda: ${avgDaysToSell} dias`,
      recommendation: 'Mantenha o ritmo de aquisição para aproveitar a demanda.',
    })
  }

  // Strong margin
  if (avgMargin > 25) {
    alerts.push({
      level: 'green', icon: '🟢',
      message: `Margem média de ${avgMargin.toFixed(1)}% — desempenho acima do target`,
      recommendation: 'Estratégia de precificação bem calibrada. Continue monitorando.',
    })
  }

  // Attention vehicles
  if (attentionVehicles.length > 3) {
    alerts.push({
      level: 'yellow', icon: '🟡',
      message: `${attentionVehicles.length} veículos na zona de atenção (30–60 dias)`,
      recommendation: 'Avalie ações de marketing direcionado para acelerar a venda.',
    })
  }

  // Missing price
  if (missingPriceVehicles.length > 0) {
    alerts.push({
      level: 'red', icon: '🔴',
      message: `${missingPriceVehicles.length} veículo${missingPriceVehicles.length > 1 ? 's' : ''} sem preço de venda definido`,
      recommendation: 'Anúncios incompletos reduzem a visibilidade. Cadastre o preço.',
    })
  }

  // Sort: red first, then yellow, then green
  const ORDER = { red: 0, yellow: 1, green: 2 }
  alerts.sort((a, b) => ORDER[a.level] - ORDER[b.level])

  // ─────────────────────────────────────────────────────────────────────────
  // Executive Summary
  // ─────────────────────────────────────────────────────────────────────────

  const profitSign = totalProfit >= 0 ? 'lucro bruto' : 'prejuízo bruto'
  const marginStatus =
    avgMargin > 20 ? 'acima do target'
    : avgMargin > 10 ? 'dentro do esperado'
    : 'abaixo do target'

  const executiveSummary =
    `No período de ${period.label}, ${dealershipName} registrou receita total de ${formatCurrency(totalRevenue)}, ` +
    `com ${profitSign} de ${formatCurrency(Math.abs(totalProfit))} e margem média de ${avgMargin.toFixed(1)}%, ${marginStatus}. ` +
    `Foram vendidos ${sold.length} veículo${sold.length !== 1 ? 's' : ''} com tempo médio de ${avgDaysToSell} dias, ` +
    `e o estoque atual conta com ${totalInStock} unidade${totalInStock !== 1 ? 's' : ''} disponíve${totalInStock !== 1 ? 'is' : 'l'}.`

  return {
    dealershipName,
    dealershipAddress,
    period,
    executiveSummary,
    financial,
    sales,
    inventory: inventoryHealth,
    expenses: expenseBreakdown,
    financing,
    operational,
    alerts,
    generatedAt: new Date().toISOString(),
  }
}
