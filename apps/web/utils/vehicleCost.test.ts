/**
 * utils/vehicleCost.test.ts
 *
 * Comprehensive unit tests for the vehicleCost calculation engine.
 * Run with: npx vitest (requires vitest devDependency — see vitest.config.ts)
 *
 * Covers:
 *  - Vehicle with all data complete
 *  - Vehicle with purchase_price = 0
 *  - Vehicle with no expenses
 *  - Vehicle with sale_price = 0 (available, no price set)
 *  - Vehicle sold on the same day it entered (0 days in stock)
 *  - Negative margin edge case (sold below cost)
 *  - checkMarginAlerts rule coverage
 */

import { describe, it, expect } from 'vitest'
import {
  calculateTotalExpenses,
  calculateTrueCost,
  calculateGrossProfit,
  calculateGrossMargin,
  calculateProfitPerDay,
  calculateDataQualityScore,
  buildCostSummary,
  checkMarginAlerts,
} from './vehicleCost'
import type { VehicleForCost } from '@/types/cost'
import type { Expense } from '@/types/index'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    dealership_id: 'deal-1',
    vehicle_id: 'veh-1',
    category: 'MANUTENÇÕES (SERVIÇOS)',
    description: 'Revisão geral',
    amount: 500,
    date: '2024-01-15',
    vendor_name: null,
    payment_method: null,
    receipt_url: null,
    created_by: null,
    external_id: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

function makeVehicle(overrides: Partial<VehicleForCost> = {}): VehicleForCost {
  return {
    id: 'veh-1',
    dealership_id: 'deal-1',
    plate: 'ABC-1234',
    chassis: null,
    renavam: null,
    brand: 'FORD',
    model: 'KA SE 1.0',
    version: null,
    year_fab: 2020,
    year_model: 2021,
    color: 'Branco',
    mileage: 35000,
    fuel: 'Flex',
    transmission: 'Manual',
    purchase_price: 30000,
    sale_price: 40000,
    fipe_price: null,
    min_price: null,
    status: 'available',
    purchase_date: '2024-01-01',
    sale_date: null,
    days_in_stock: 60,
    supplier_name: null,
    customer_id: null,
    photos: [],
    notes: null,
    source: null,
    external_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    expenses: [
      makeExpense({ id: 'e1', amount: 500 }),
      makeExpense({ id: 'e2', category: 'IPVA', description: 'IPVA 2024', amount: 800 }),
    ],
    ...overrides,
  }
}

// ─── calculateTotalExpenses ───────────────────────────────────────────────────

describe('calculateTotalExpenses', () => {
  it('sums all expense amounts', () => {
    const expenses = [makeExpense({ amount: 500 }), makeExpense({ amount: 800 })]
    expect(calculateTotalExpenses(expenses)).toBe(1300)
  })

  it('returns 0 for empty array', () => {
    expect(calculateTotalExpenses([])).toBe(0)
  })

  it('handles floating-point amounts without drift', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in raw JS — centavos arithmetic prevents this
    const expenses = [
      makeExpense({ amount: 0.10 }),
      makeExpense({ amount: 0.20 }),
    ]
    expect(calculateTotalExpenses(expenses)).toBe(0.30)
  })

  it('handles single expense', () => {
    expect(calculateTotalExpenses([makeExpense({ amount: 1234.56 })])).toBe(1234.56)
  })
})

// ─── calculateTrueCost ────────────────────────────────────────────────────────

describe('calculateTrueCost', () => {
  it('adds purchase_price and all expenses', () => {
    const v = makeVehicle({ purchase_price: 30000, expenses: [makeExpense({ amount: 500 }), makeExpense({ amount: 800 })] })
    expect(calculateTrueCost(v)).toBe(31300)
  })

  it('equals purchase_price when no expenses', () => {
    const v = makeVehicle({ purchase_price: 30000, expenses: [] })
    expect(calculateTrueCost(v)).toBe(30000)
  })

  it('returns 0 + expenses when purchase_price is 0', () => {
    const v = makeVehicle({ purchase_price: 0, expenses: [makeExpense({ amount: 200 })] })
    expect(calculateTrueCost(v)).toBe(200)
  })
})

// ─── calculateGrossProfit ─────────────────────────────────────────────────────

describe('calculateGrossProfit', () => {
  it('calculates positive profit correctly', () => {
    // purchase 30000 + expenses 1300 = trueCost 31300; sale 40000 → profit 8700
    const v = makeVehicle({ purchase_price: 30000, sale_price: 40000 })
    expect(calculateGrossProfit(v)).toBe(8700)
  })

  it('returns 0 when sale_price is null', () => {
    const v = makeVehicle({ sale_price: null })
    expect(calculateGrossProfit(v)).toBe(0)
  })

  it('returns 0 when sale_price is 0', () => {
    const v = makeVehicle({ sale_price: 0 })
    expect(calculateGrossProfit(v)).toBe(0)
  })

  it('returns negative profit when sold below true cost', () => {
    // trueCost = 30000 + 1300 = 31300; sale 28000 → profit -3300
    const v = makeVehicle({ purchase_price: 30000, sale_price: 28000 })
    expect(calculateGrossProfit(v)).toBe(-3300)
  })
})

// ─── calculateGrossMargin ─────────────────────────────────────────────────────

describe('calculateGrossMargin', () => {
  it('calculates correct margin percentage', () => {
    // profit 8700, sale 40000 → 21.75%
    const v = makeVehicle({ purchase_price: 30000, sale_price: 40000 })
    const margin = calculateGrossMargin(v)
    expect(margin).toBeCloseTo(21.75, 1)
  })

  it('returns 0 when sale_price is 0', () => {
    const v = makeVehicle({ sale_price: 0 })
    expect(calculateGrossMargin(v)).toBe(0)
  })

  it('returns 0 when sale_price is null', () => {
    const v = makeVehicle({ sale_price: null })
    expect(calculateGrossMargin(v)).toBe(0)
  })

  it('returns negative margin when sold below cost', () => {
    // profit -3300, sale 28000 → ≈ -11.79%
    const v = makeVehicle({ purchase_price: 30000, sale_price: 28000 })
    const margin = calculateGrossMargin(v)
    expect(margin).toBeLessThan(0)
    expect(margin).toBeCloseTo(-11.79, 1)
  })

  it('returns 0 margin when break-even (profit = 0)', () => {
    // trueCost = 31300, sale = 31300 → 0%
    const v = makeVehicle({ purchase_price: 30000, sale_price: 31300 })
    expect(calculateGrossMargin(v)).toBeCloseTo(0, 1)
  })
})

// ─── calculateProfitPerDay ────────────────────────────────────────────────────

describe('calculateProfitPerDay', () => {
  it('returns null for available vehicle', () => {
    const v = makeVehicle({ status: 'available' })
    expect(calculateProfitPerDay(v)).toBeNull()
  })

  it('returns null for reserved vehicle', () => {
    const v = makeVehicle({ status: 'reserved' })
    expect(calculateProfitPerDay(v)).toBeNull()
  })

  it('calculates profit per day for sold vehicle', () => {
    // profit 8700 / 60 days = 145/day
    const v = makeVehicle({ status: 'sold', purchase_price: 30000, sale_price: 40000, days_in_stock: 60 })
    expect(calculateProfitPerDay(v)).toBeCloseTo(145, 0)
  })

  it('returns total profit when sold on entry day (0 days)', () => {
    const v = makeVehicle({ status: 'sold', purchase_price: 30000, sale_price: 40000, days_in_stock: 0 })
    expect(calculateProfitPerDay(v)).toBe(8700)
  })

  it('returns negative value when sold at a loss', () => {
    const v = makeVehicle({ status: 'sold', purchase_price: 30000, sale_price: 28000, days_in_stock: 30 })
    const ppd = calculateProfitPerDay(v)
    expect(ppd).toBeLessThan(0)
  })
})

// ─── calculateDataQualityScore ────────────────────────────────────────────────

describe('calculateDataQualityScore', () => {
  it('returns score 100 / complete for a fully populated vehicle', () => {
    const v = makeVehicle({
      purchase_price: 30000,
      sale_price: 40000,
      purchase_date: '2024-01-01',
      expenses: [makeExpense()],
    })
    const dq = calculateDataQualityScore(v)
    expect(dq.score).toBe(100)
    expect(dq.level).toBe('complete')
    expect(dq.issues).toHaveLength(0)
  })

  it('deducts 40 pts for purchase_price = 0 and marks as error', () => {
    const v = makeVehicle({ purchase_price: 0 })
    const dq = calculateDataQualityScore(v)
    expect(dq.score).toBe(60)
    expect(dq.level).toBe('partial')
    const issue = dq.issues.find(i => i.field === 'purchase_price')
    expect(issue?.severity).toBe('error')
    expect(issue?.deduction).toBe(40)
  })

  it('deducts 20 pts for no expenses', () => {
    const v = makeVehicle({ expenses: [] })
    const dq = calculateDataQualityScore(v)
    expect(dq.score).toBe(80)
    expect(dq.level).toBe('complete')
    const issue = dq.issues.find(i => i.field === 'expenses')
    expect(issue?.severity).toBe('warning')
  })

  it('deducts 20 pts for missing sale_price on available vehicle', () => {
    const v = makeVehicle({ status: 'available', sale_price: null })
    const dq = calculateDataQualityScore(v)
    expect(dq.score).toBeLessThan(100)
    const issue = dq.issues.find(i => i.field === 'sale_price')
    expect(issue).toBeDefined()
  })

  it('does NOT deduct for missing sale_price on sold vehicle', () => {
    // sold vehicle with sale_price: once sold the price is already recorded
    const v = makeVehicle({ status: 'sold', sale_price: 40000 })
    const dq = calculateDataQualityScore(v)
    expect(dq.issues.find(i => i.field === 'sale_price')).toBeUndefined()
  })

  it('deducts 20 pts for missing purchase_date', () => {
    const v = makeVehicle({ purchase_date: '' })
    const dq = calculateDataQualityScore(v)
    const issue = dq.issues.find(i => i.field === 'purchase_date')
    expect(issue).toBeDefined()
    expect(issue?.deduction).toBe(20)
  })

  it('marks as incomplete when score < 50 (missing purchase_price + no expenses + missing sale_price)', () => {
    const v = makeVehicle({
      purchase_price: 0,
      expenses: [],
      sale_price: null,
      status: 'available',
    })
    const dq = calculateDataQualityScore(v)
    expect(dq.score).toBe(20) // 100 - 40 - 20 - 20 = 20
    expect(dq.level).toBe('incomplete')
  })

  it('score cannot go below 0', () => {
    const v = makeVehicle({
      purchase_price: 0,
      expenses: [],
      sale_price: null,
      status: 'available',
      purchase_date: '',
    })
    const dq = calculateDataQualityScore(v)
    expect(dq.score).toBeGreaterThanOrEqual(0)
  })
})

// ─── buildCostSummary ─────────────────────────────────────────────────────────

describe('buildCostSummary', () => {
  it('builds a complete summary for a fully-populated vehicle', () => {
    const v = makeVehicle({ status: 'sold', purchase_price: 30000, sale_price: 40000, days_in_stock: 60 })
    const s = buildCostSummary(v)

    expect(s.vehicleId).toBe('veh-1')
    expect(s.purchasePrice).toBe(30000)
    expect(s.totalExpenses).toBe(1300)
    expect(s.trueCost).toBe(31300)
    expect(s.salePrice).toBe(40000)
    expect(s.grossProfit).toBe(8700)
    expect(s.grossMargin).toBeCloseTo(21.75, 1)
    expect(s.profitPerDay).toBeCloseTo(145, 0)
    expect(s.daysInStock).toBe(60)
    expect(s.hasMissingCost).toBe(false)
    expect(s.dataQuality.level).toBe('complete')
  })

  it('aggregates expenses by category', () => {
    const expenses = [
      makeExpense({ id: 'e1', category: 'IPVA', amount: 600 }),
      makeExpense({ id: 'e2', category: 'IPVA', amount: 200 }),
      makeExpense({ id: 'e3', category: 'LAVAGEM/PREPARAÇÃO', amount: 300 }),
    ]
    const v = makeVehicle({ expenses })
    const s = buildCostSummary(v)
    expect(s.expensesByCategory['IPVA']).toBe(800)
    expect(s.expensesByCategory['LAVAGEM/PREPARAÇÃO']).toBe(300)
  })

  it('flags hasMissingCost when purchase_price is 0', () => {
    const v = makeVehicle({ purchase_price: 0 })
    const s = buildCostSummary(v)
    expect(s.hasMissingCost).toBe(true)
  })

  it('returns salePrice 0 when vehicle has no sale_price', () => {
    const v = makeVehicle({ sale_price: null })
    const s = buildCostSummary(v)
    expect(s.salePrice).toBe(0)
    expect(s.grossProfit).toBe(0)
    expect(s.grossMargin).toBe(0)
  })
})

// ─── checkMarginAlerts ────────────────────────────────────────────────────────

describe('checkMarginAlerts', () => {
  it('returns missing_cost alert and nothing else when purchase_price is 0', () => {
    const v = makeVehicle({ purchase_price: 0, sale_price: 40000 })
    const s = buildCostSummary(v)
    const alerts = checkMarginAlerts(s)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('missing_cost')
    expect(alerts[0].severity).toBe('error')
  })

  it('returns negative_margin error when sold below true cost', () => {
    // purchase 30000 + expenses 1300 = 31300; sale 28000 → loss
    const v = makeVehicle({ purchase_price: 30000, sale_price: 28000 })
    const s = buildCostSummary(v)
    const alerts = checkMarginAlerts(s)
    const neg = alerts.find(a => a.type === 'negative_margin')
    expect(neg?.severity).toBe('error')
    expect(neg?.message).toContain('ABAIXO do custo real')
  })

  it('returns very_low_margin warning when margin is 0–5%', () => {
    // trueCost ≈ 31300; for ~3% margin: sale ≈ 32268
    const v = makeVehicle({ purchase_price: 30000, sale_price: 32268, expenses: [makeExpense({ amount: 1300 })] })
    const s = buildCostSummary(v)
    const alerts = checkMarginAlerts(s)
    const low = alerts.find(a => a.type === 'very_low_margin')
    expect(low?.severity).toBe('warning')
  })

  it('returns below_fipe warning when expenses exceed 15% of sale price', () => {
    // expenses 7000 on sale 40000 = 17.5%
    const expenses = [makeExpense({ id: 'e1', amount: 7000 })]
    const v = makeVehicle({ purchase_price: 30000, sale_price: 40000, expenses })
    const s = buildCostSummary(v)
    const alerts = checkMarginAlerts(s)
    const ratio = alerts.find(a => a.type === 'below_fipe')
    expect(ratio?.severity).toBe('warning')
  })

  it('returns no alerts for a healthy margin vehicle', () => {
    // profit 8700 / sale 40000 = 21.75%; expenses 1300 / 40000 = 3.25%
    const v = makeVehicle({ purchase_price: 30000, sale_price: 40000 })
    const s = buildCostSummary(v)
    const alerts = checkMarginAlerts(s)
    expect(alerts).toHaveLength(0)
  })

  it('returns no alerts when sale_price is 0 (vehicle not priced)', () => {
    const v = makeVehicle({ sale_price: 0 })
    const s = buildCostSummary(v)
    const alerts = checkMarginAlerts(s)
    // missing cost not triggered (purchase_price > 0); no sale_price means no margin alerts
    expect(alerts.find(a => a.type === 'negative_margin')).toBeUndefined()
    expect(alerts.find(a => a.type === 'very_low_margin')).toBeUndefined()
  })
})
