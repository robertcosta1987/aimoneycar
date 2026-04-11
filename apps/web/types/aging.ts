/**
 * types/aging.ts
 * Type definitions for the Inventory Aging Alert System.
 * Covers aging status levels, actionable suggestions, thresholds and enriched vehicle shape.
 */

export type AgingLevel = 'ok' | 'attention' | 'critical'

export interface AgingStatus {
  level: AgingLevel
  label: string       // e.g. "OK", "⚠️ ATENÇÃO", "🔴 CRÍTICO"
  color: string       // hex color matching the project palette
  badgeVariant: 'success' | 'warning' | 'destructive'
  days: number
}

export interface AgingThresholds {
  attention: number   // default 30 days
  critical: number    // default 60 days
}

export type SuggestionPriority = 'low' | 'medium' | 'high' | 'urgent'
export type SuggestionActionType = 'price_edit' | 'open_link' | 'open_crm' | 'notify_team'

export interface Suggestion {
  id: string
  icon: string
  text: string
  priority: SuggestionPriority
  actionLabel?: string
  actionType?: SuggestionActionType
}

/** Vehicle shape enriched with aging data — used by all aging components */
export interface AgingVehicle {
  id: string
  brand: string
  model: string
  version: string | null
  plate: string | null
  year_fab: number
  year_model: number
  purchase_price: number
  sale_price: number | null
  days_in_stock: number
  purchase_date: string
  status: string
  totalExpenses: number
  agingStatus: AgingStatus
  suggestions: Suggestion[]
  missingPurchasePrice: boolean
}
