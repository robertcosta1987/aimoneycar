/**
 * utils/vehicleCost.ts
 *
 * Core calculation engine for the True Total Cost per Vehicle feature.
 *
 * All monetary arithmetic is performed in centavos (integer) to avoid
 * floating-point rounding errors. Values are converted back to reais (float)
 * only when building the result objects.
 *
 * Key business rules:
 * - purchase_price === 0  → hasMissingCost: true; margin MUST NOT be displayed
 * - Negative profit        → grossMargin is negative; UI shows alarming red
 * - profitPerDay is null   → vehicle is not sold yet, or days === 0
 * - Data quality score     → 100 pts base; deductions for missing fields
 *
 * Inputs:  VehicleForCost (Vehicle + expenses[])
 * Outputs: VehicleCostSummary, DataQualityScore, MarginAlert[]
 */

import type { Expense } from '@/types/index'
import type {
  VehicleForCost,
  VehicleCostSummary,
  DataQualityScore,
  DataQualityIssue,
  MarginAlert,
} from '@/types/cost'
import { formatCurrency } from '@/lib/utils'

// ─── Internal centavos helpers ────────────────────────────────────────────────

function toCentavos(value: number): number {
  return Math.round(value * 100)
}

function fromCentavos(centavos: number): number {
  return centavos / 100
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the sum of all expense amounts for a vehicle.
 * Uses centavos arithmetic to prevent accumulation errors.
 */
export function calculateTotalExpenses(expenses: Expense[]): number {
  const totalCentavos = expenses.reduce(
    (sum, e) => sum + toCentavos(e.amount),
    0
  )
  return fromCentavos(totalCentavos)
}

/**
 * Returns the true total cost: purchase_price + all expenses.
 */
export function calculateTrueCost(vehicle: VehicleForCost): number {
  const purchaseCentavos = toCentavos(vehicle.purchase_price)
  const expensesCentavos = toCentavos(calculateTotalExpenses(vehicle.expenses))
  return fromCentavos(purchaseCentavos + expensesCentavos)
}

/**
 * Returns gross profit: sale_price - true_total_cost.
 * Returns 0 when sale_price is null or 0.
 */
export function calculateGrossProfit(vehicle: VehicleForCost): number {
  const salePrice = vehicle.sale_price ?? 0
  if (salePrice === 0) return 0
  const saleCentavos = toCentavos(salePrice)
  const costCentavos = toCentavos(calculateTrueCost(vehicle))
  return fromCentavos(saleCentavos - costCentavos)
}

/**
 * Returns gross margin as a percentage: (gross_profit / sale_price) * 100.
 * Returns 0 when sale_price is null, 0, or the vehicle has no sale price set.
 */
export function calculateGrossMargin(vehicle: VehicleForCost): number {
  const salePrice = vehicle.sale_price ?? 0
  if (salePrice === 0) return 0
  const profit = calculateGrossProfit(vehicle)
  // Avoid floating-point division issues: work in centavos ratio
  return (toCentavos(profit) / toCentavos(salePrice)) * 100
}

/**
 * Returns profit per day held in stock.
 * Only meaningful for sold vehicles; returns null otherwise.
 * When days_in_stock === 0 (sold on entry day), returns total profit.
 */
export function calculateProfitPerDay(vehicle: VehicleForCost): number | null {
  if (vehicle.status !== 'sold') return null
  const profit = calculateGrossProfit(vehicle)
  if (vehicle.days_in_stock === 0) return profit
  return fromCentavos(
    Math.round(toCentavos(profit) / vehicle.days_in_stock)
  )
}

/**
 * Calculates a data-quality score for a vehicle (0–100).
 *
 * Deductions:
 *  -40 pts (error)   → purchase_price === 0
 *  -20 pts (warning) → no expenses recorded
 *  -20 pts (warning) → sale_price is null/0 on an available/reserved vehicle
 *  -20 pts (warning) → no purchase_date (entry_date) set
 *
 * Levels: complete (80–100), partial (50–79), incomplete (0–49)
 */
export function calculateDataQualityScore(vehicle: VehicleForCost): DataQualityScore {
  const issues: DataQualityIssue[] = []
  let score = 100

  if (vehicle.purchase_price === 0) {
    const deduction = 40
    score -= deduction
    issues.push({
      field: 'purchase_price',
      severity: 'error',
      message: 'Preço de compra não informado (R$ 0) — margem não pode ser calculada',
      deduction,
    })
  }

  if (!vehicle.expenses || vehicle.expenses.length === 0) {
    const deduction = 20
    score -= deduction
    issues.push({
      field: 'expenses',
      severity: 'warning',
      message: 'Nenhuma despesa registrada para este veículo',
      deduction,
    })
  }

  if (
    (vehicle.status === 'available' || vehicle.status === 'reserved') &&
    (!vehicle.sale_price || vehicle.sale_price === 0)
  ) {
    const deduction = 20
    score -= deduction
    issues.push({
      field: 'sale_price',
      severity: 'warning',
      message: 'Veículo disponível sem preço de venda definido',
      deduction,
    })
  }

  if (!vehicle.purchase_date) {
    const deduction = 20
    score -= deduction
    issues.push({
      field: 'purchase_date',
      severity: 'warning',
      message: 'Data de entrada no estoque não informada',
      deduction,
    })
  }

  const finalScore = Math.max(0, score)
  const level =
    finalScore >= 80 ? 'complete' : finalScore >= 50 ? 'partial' : 'incomplete'

  return { score: finalScore, level, issues }
}

/**
 * Builds a complete VehicleCostSummary for a vehicle.
 * This is the primary function to call when you need all cost data.
 */
export function buildCostSummary(vehicle: VehicleForCost): VehicleCostSummary {
  const totalExpenses = calculateTotalExpenses(vehicle.expenses)
  const trueCost = calculateTrueCost(vehicle)
  const salePrice = vehicle.sale_price ?? 0
  const grossProfit = calculateGrossProfit(vehicle)
  const grossMargin = calculateGrossMargin(vehicle)
  const profitPerDay = calculateProfitPerDay(vehicle)
  const dataQuality = calculateDataQualityScore(vehicle)
  const hasMissingCost = vehicle.purchase_price === 0

  // Aggregate expenses by category using centavos to avoid drift
  const byCategoryCentavos: Record<string, number> = {}
  for (const expense of vehicle.expenses) {
    const key = expense.category
    byCategoryCentavos[key] = (byCategoryCentavos[key] ?? 0) + toCentavos(expense.amount)
  }
  const expensesByCategory: Record<string, number> = {}
  for (const [cat, cents] of Object.entries(byCategoryCentavos)) {
    expensesByCategory[cat] = fromCentavos(cents)
  }

  return {
    vehicleId: vehicle.id,
    purchasePrice: vehicle.purchase_price,
    totalExpenses,
    expensesByCategory,
    trueCost,
    salePrice,
    grossProfit,
    grossMargin,
    profitPerDay,
    daysInStock: vehicle.days_in_stock,
    dataQuality,
    hasMissingCost,
  }
}

/**
 * Evaluates a cost summary and returns applicable margin alerts.
 * Rules:
 *  - missing_cost:    purchase_price === 0 → error
 *  - negative_margin: gross profit < 0 → error
 *  - very_low_margin: 0 ≤ margin < 5% → warning
 *  - below_fipe:      expenses > 15% of sale price → warning
 *
 * When purchase_price is missing, only the missing_cost alert is returned
 * (further margin math is meaningless).
 */
export function checkMarginAlerts(summary: VehicleCostSummary): MarginAlert[] {
  const alerts: MarginAlert[] = []

  if (summary.hasMissingCost) {
    alerts.push({
      type: 'missing_cost',
      severity: 'error',
      message: 'Margem real não pode ser calculada — preço de compra é R$ 0. Atualize os dados de custo.',
      suggestedAction: 'Informe o preço de compra deste veículo.',
    })
    return alerts
  }

  if (summary.salePrice > 0 && summary.grossProfit < 0) {
    const gap = Math.abs(summary.grossProfit)
    alerts.push({
      type: 'negative_margin',
      severity: 'error',
      message: `Este veículo está precificado ABAIXO do custo real. Aumente o preço em pelo menos ${formatCurrency(gap)} para atingir o break-even.`,
      suggestedAction: `Defina o preço de venda para pelo menos ${formatCurrency(summary.trueCost)}.`,
    })
  } else if (
    summary.salePrice > 0 &&
    summary.grossMargin >= 0 &&
    summary.grossMargin < 5
  ) {
    alerts.push({
      type: 'very_low_margin',
      severity: 'warning',
      message: `Margem de ${summary.grossMargin.toFixed(1)}% pode não cobrir custos operacionais. Considere revisar o preço.`,
      suggestedAction: 'Revise o preço de venda ou reduza as despesas.',
    })
  }

  if (summary.salePrice > 0 && summary.totalExpenses / summary.salePrice > 0.15) {
    const ratio = ((summary.totalExpenses / summary.salePrice) * 100).toFixed(1)
    alerts.push({
      type: 'below_fipe',
      severity: 'warning',
      message: `Despesas representam ${ratio}% do preço de venda — acima do usual. Revise a eficiência dos custos.`,
      suggestedAction: 'Audite as despesas deste veículo.',
    })
  }

  return alerts
}

/**
 * Convenience: builds a summary and checks alerts in one call.
 */
export function analyseVehicle(vehicle: VehicleForCost): {
  summary: VehicleCostSummary
  alerts: MarginAlert[]
} {
  const summary = buildCostSummary(vehicle)
  const alerts = checkMarginAlerts(summary)
  return { summary, alerts }
}
