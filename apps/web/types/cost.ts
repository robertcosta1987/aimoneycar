/**
 * types/cost.ts
 *
 * TypeScript type definitions for the True Total Cost per Vehicle feature.
 *
 * Extends the core domain types (Vehicle, Expense) with cost-analysis shapes:
 * data quality scoring, cost summaries, and margin alerts.
 *
 * Business rules encoded here:
 * - A vehicle with purchase_price === 0 NEVER shows a valid margin.
 * - Data quality score ranges: complete (80–100), partial (50–79), incomplete (0–49).
 * - All monetary values are stored as floats (R$); centavos arithmetic is done
 *   inside vehicleCost.ts — only display values leave that module.
 */

import type { Vehicle, Expense } from '@/types/index'

// ─── Extended Vehicle Shape ───────────────────────────────────────────────────

/**
 * Vehicle enriched with its full expense list.
 * Used as the primary input for all cost-calculation functions.
 */
export interface VehicleForCost extends Vehicle {
  expenses: Expense[]
}

// ─── Data Quality ─────────────────────────────────────────────────────────────

export type DataQualityLevel = 'complete' | 'partial' | 'incomplete'

export interface DataQualityIssue {
  /** The field that has a problem */
  field: string
  severity: 'error' | 'warning'
  message: string
  /** Point deduction applied to the score */
  deduction: number
}

export interface DataQualityScore {
  /** 0–100 integer */
  score: number
  level: DataQualityLevel
  issues: DataQualityIssue[]
}

// ─── Cost Summary ─────────────────────────────────────────────────────────────

export interface VehicleCostSummary {
  vehicleId: string
  /** Original purchase_price from the vehicle record */
  purchasePrice: number
  /** Sum of all linked expense amounts */
  totalExpenses: number
  /** Expense amounts keyed by category string */
  expensesByCategory: Record<string, number>
  /** purchasePrice + totalExpenses */
  trueCost: number
  /** sale_price (0 if null) */
  salePrice: number
  /** salePrice - trueCost */
  grossProfit: number
  /** (grossProfit / salePrice) * 100; 0 when salePrice === 0 */
  grossMargin: number
  /** grossProfit / daysInStock; null for non-sold vehicles or when days === 0 */
  profitPerDay: number | null
  daysInStock: number
  dataQuality: DataQualityScore
  /** true when purchase_price === 0 — margin display must be suppressed */
  hasMissingCost: boolean
}

// ─── Margin Alerts ────────────────────────────────────────────────────────────

export type MarginAlertType =
  | 'negative_margin'
  | 'very_low_margin'
  | 'missing_cost'
  | 'below_fipe'

export interface MarginAlert {
  type: MarginAlertType
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestedAction: string
}

// ─── Expense Categories ───────────────────────────────────────────────────────

/** Predefined expense categories used throughout the dealership */
export const EXPENSE_CATEGORIES = [
  'MANUTENÇÕES (SERVIÇOS)',
  'MANUTENÇÕES (PEÇAS)',
  'IPVA',
  'LAVAGEM/PREPARAÇÃO',
  'COMBUSTÍVEL',
  'LAUDO/PERÍCIA',
  'GUINCHO/TRANSPORTE/LOGÍSTICA',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

// ─── Category Colours ─────────────────────────────────────────────────────────

/** Recharts-safe hex colours, one per expense category */
export const CATEGORY_COLORS: Record<string, string> = {
  'MANUTENÇÕES (SERVIÇOS)': '#00D9FF',
  'MANUTENÇÕES (PEÇAS)': '#FFB800',
  'IPVA': '#00E676',
  'LAVAGEM/PREPARAÇÃO': '#7C3AED',
  'COMBUSTÍVEL': '#FF9100',
  'LAUDO/PERÍCIA': '#FF5252',
  'GUINCHO/TRANSPORTE/LOGÍSTICA': '#00B0FF',
}

/** Fallback colour for unknown / unlisted categories */
export const DEFAULT_CATEGORY_COLOR = '#6B7280'

// ─── Margin Bracket Helpers ───────────────────────────────────────────────────

export type MarginBracket = 'negative' | 'very_low' | 'low' | 'good' | 'incomplete'

export interface MarginDisplay {
  bracket: MarginBracket
  label: string
  /** Tailwind text colour class */
  textClass: string
  /** Tailwind background colour class */
  bgClass: string
  /** Hex colour for charts */
  color: string
}

export function getMarginDisplay(summary: VehicleCostSummary): MarginDisplay {
  if (summary.hasMissingCost || summary.salePrice === 0) {
    return {
      bracket: 'incomplete',
      label: '⚠️ Dados incompletos',
      textClass: 'text-foreground-muted',
      bgClass: 'bg-foreground-subtle/20',
      color: '#6B7280',
    }
  }
  if (summary.grossMargin < 0) {
    return {
      bracket: 'negative',
      label: `${summary.grossMargin.toFixed(1)}%`,
      textClass: 'text-danger',
      bgClass: 'bg-danger/20',
      color: '#FF5252',
    }
  }
  if (summary.grossMargin < 5) {
    return {
      bracket: 'very_low',
      label: `${summary.grossMargin.toFixed(1)}%`,
      textClass: 'text-warning',
      bgClass: 'bg-warning/20',
      color: '#FF9100',
    }
  }
  if (summary.grossMargin < 15) {
    return {
      bracket: 'low',
      label: `${summary.grossMargin.toFixed(1)}%`,
      textClass: 'text-secondary',
      bgClass: 'bg-secondary/20',
      color: '#FFB800',
    }
  }
  return {
    bracket: 'good',
    label: `${summary.grossMargin.toFixed(1)}%`,
    textClass: 'text-success',
    bgClass: 'bg-success/20',
    color: '#00E676',
  }
}
