/**
 * __tests__/aging.test.ts
 * Unit tests for the Inventory Aging Alert System utility functions.
 * Run with: npx jest  (requires jest + ts-jest setup, or npx vitest)
 *
 * Covers all threshold boundary days: 29, 30, 44, 45, 59, 60.
 */

import { calculateAging, getAgingStatus, generateSuggestions, DEFAULT_THRESHOLDS } from '../lib/aging'

// ── calculateAging ────────────────────────────────────────────────────────────

describe('calculateAging', () => {
  it('returns 0 for today', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(calculateAging(today)).toBe(0)
  })

  it('returns correct day count for a past date', () => {
    const past = new Date()
    past.setDate(past.getDate() - 45)
    const result = calculateAging(past.toISOString().split('T')[0])
    expect(result).toBe(45)
  })

  it('never returns negative', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    expect(calculateAging(future.toISOString().split('T')[0])).toBe(0)
  })

  it('ignores time component', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    // Different time on same calendar day should still be 1
    const isoWithTime = yesterday.toISOString().replace('T00', 'T23')
    expect(calculateAging(isoWithTime)).toBe(1)
  })
})

// ── getAgingStatus ────────────────────────────────────────────────────────────

describe('getAgingStatus (default thresholds: 30 attention / 60 critical)', () => {
  it('29 days → ok', () => {
    expect(getAgingStatus(29).level).toBe('ok')
  })

  it('30 days → attention', () => {
    expect(getAgingStatus(30).level).toBe('attention')
  })

  it('44 days → attention', () => {
    expect(getAgingStatus(44).level).toBe('attention')
  })

  it('45 days → attention', () => {
    expect(getAgingStatus(45).level).toBe('attention')
  })

  it('59 days → attention', () => {
    expect(getAgingStatus(59).level).toBe('attention')
  })

  it('60 days → critical', () => {
    expect(getAgingStatus(60).level).toBe('critical')
  })

  it('90 days → critical', () => {
    expect(getAgingStatus(90).level).toBe('critical')
  })

  it('returns correct badge variants', () => {
    expect(getAgingStatus(10).badgeVariant).toBe('success')
    expect(getAgingStatus(35).badgeVariant).toBe('warning')
    expect(getAgingStatus(65).badgeVariant).toBe('destructive')
  })

  it('respects custom thresholds', () => {
    const custom = { attention: 15, critical: 30 }
    expect(getAgingStatus(14, custom).level).toBe('ok')
    expect(getAgingStatus(15, custom).level).toBe('attention')
    expect(getAgingStatus(29, custom).level).toBe('attention')
    expect(getAgingStatus(30, custom).level).toBe('critical')
  })
})

// ── generateSuggestions ───────────────────────────────────────────────────────

const baseVehicle = {
  id: 'v1',
  purchase_price: 30000,
  sale_price: 45000,
  totalExpenses: 2000,
}

describe('generateSuggestions', () => {
  it('returns empty array for < 30 days', () => {
    expect(generateSuggestions(baseVehicle, 29)).toHaveLength(0)
  })

  it('returns 3 suggestions at exactly 30 days', () => {
    const s = generateSuggestions(baseVehicle, 30)
    expect(s.length).toBe(3)
    expect(s.every(s => s.priority === 'medium')).toBe(true)
  })

  it('returns 3 suggestions at 44 days', () => {
    expect(generateSuggestions(baseVehicle, 44)).toHaveLength(3)
  })

  it('returns 6 suggestions at 45 days (adds late-attention tier)', () => {
    const s = generateSuggestions(baseVehicle, 45)
    expect(s.length).toBe(6)
    const hasHighPriority = s.some(s => s.priority === 'high')
    expect(hasHighPriority).toBe(true)
  })

  it('returns 6 suggestions at 59 days', () => {
    expect(generateSuggestions(baseVehicle, 59)).toHaveLength(6)
  })

  it('returns 10 suggestions at 60 days (adds critical tier)', () => {
    const s = generateSuggestions(baseVehicle, 60)
    expect(s.length).toBe(10)
    const hasUrgent = s.some(s => s.priority === 'urgent')
    expect(hasUrgent).toBe(true)
  })

  it('includes daily cost when expenses exist', () => {
    const s = generateSuggestions(baseVehicle, 60)
    const daily = s.find(s => s.id === 'v1-daily')
    expect(daily).toBeDefined()
    expect(daily?.text).toContain('/dia')
  })

  it('uses fallback daily cost message when expenses = 0', () => {
    const noExp = { ...baseVehicle, totalExpenses: 0 }
    const s = generateSuggestions(noExp, 60)
    const dailyWarn = s.find(s => s.id === 'v1-daily-warn')
    expect(dailyWarn).toBeDefined()
  })

  it('calculates 5% price reduction correctly at 45d', () => {
    const s = generateSuggestions(baseVehicle, 45) // sale_price = 45000
    const priceS = s.find(s => s.id === 'v1-price5')
    expect(priceS?.text).toContain('2.250') // 5% of 45000 = 2250
  })

  it('calculates 10% aggressive discount at 60d', () => {
    const s = generateSuggestions(baseVehicle, 60)
    const priceS = s.find(s => s.id === 'v1-price10')
    expect(priceS?.text).toContain('4.500') // 10% of 45000 = 4500
  })

  it('all suggestions have unique ids', () => {
    const s = generateSuggestions(baseVehicle, 60)
    const ids = s.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── DEFAULT_THRESHOLDS ────────────────────────────────────────────────────────

describe('DEFAULT_THRESHOLDS', () => {
  it('has attention = 30 and critical = 60', () => {
    expect(DEFAULT_THRESHOLDS.attention).toBe(30)
    expect(DEFAULT_THRESHOLDS.critical).toBe(60)
  })
})
