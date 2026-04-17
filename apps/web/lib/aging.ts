/**
 * lib/aging.ts
 * Core engine for the Inventory Aging Alert System.
 * Provides: calculateAging, getAgingStatus, generateSuggestions, and threshold helpers.
 * All monetary values are formatted as Brazilian Real (R$ 1.234).
 */

import type { AgingStatus, AgingThresholds, Suggestion } from '@/types/aging'

export const DEFAULT_THRESHOLDS: AgingThresholds = {
  attention: 45,
  critical: 90,
}

const THRESHOLDS_KEY = 'moneycar_aging_thresholds'

/** Persist thresholds to localStorage */
export function saveThresholds(t: AgingThresholds): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t))
}

/** Load thresholds from localStorage, falling back to defaults */
export function loadThresholds(): AgingThresholds {
  if (typeof window === 'undefined') return DEFAULT_THRESHOLDS
  try {
    const raw = localStorage.getItem(THRESHOLDS_KEY)
    if (!raw) return DEFAULT_THRESHOLDS
    const parsed = JSON.parse(raw) as AgingThresholds
    if (
      typeof parsed.attention === 'number' &&
      typeof parsed.critical === 'number' &&
      parsed.attention < parsed.critical
    ) {
      return parsed
    }
  } catch {
    // ignore
  }
  return DEFAULT_THRESHOLDS
}

/**
 * calculateAging
 * Returns the number of calendar days a vehicle has been in inventory.
 * Uses start-of-day comparison — ignores time component.
 */
export function calculateAging(entryDate: string): number {
  const entry = new Date(entryDate)
  const today = new Date()
  const entryDay = new Date(entry.getFullYear(), entry.getMonth(), entry.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.max(0, Math.floor((todayDay.getTime() - entryDay.getTime()) / msPerDay))
}

/**
 * getAgingStatus
 * Maps a day count to a structured AgingStatus object.
 * Thresholds default to 30 (attention) and 60 (critical).
 */
export function getAgingStatus(
  days: number,
  thresholds: AgingThresholds = DEFAULT_THRESHOLDS
): AgingStatus {
  if (days >= thresholds.critical) {
    return { level: 'critical', label: '🔴 CRÍTICO', color: '#EF4444', badgeVariant: 'destructive', days }
  }
  if (days >= thresholds.attention) {
    return { level: 'attention', label: '⚠️ ATENÇÃO', color: '#EAB308', badgeVariant: 'warning', days }
  }
  return { level: 'ok', label: 'OK', color: '#22C55E', badgeVariant: 'success', days }
}

/** Internal BRL formatter without the R$ symbol (used inside suggestion strings) */
function brl(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/**
 * generateSuggestions
 * Returns a prioritised list of actionable suggestions based on aging days.
 *
 * Tiers:
 *   45–89d  → Early/Late Attention (suggestions)
 *   45–89d  → Late Attention  (above + 3 more)
 *   90d+    → Critical        (above + 4 more)
 */
export function generateSuggestions(
  vehicle: {
    id: string
    purchase_price: number
    sale_price: number | null
    totalExpenses: number
  },
  agingDays: number
): Suggestion[] {
  if (agingDays < 45) return []

  const salePrice = vehicle.sale_price ?? 0
  const totalExpenses = vehicle.totalExpenses ?? 0
  const dailyCost = agingDays > 0 && totalExpenses > 0
    ? Math.round(totalExpenses / agingDays)
    : 0

  const suggestions: Suggestion[] = [
    // ── 45-89d Attention ─────────────────────────────────────────────────────
    {
      id: `${vehicle.id}-photos`,
      icon: '📸',
      text: 'Atualize as fotos do anúncio e a descrição em todos os marketplaces',
      priority: 'medium',
      actionLabel: 'Ver Anúncios',
      actionType: 'open_link',
    },
    {
      id: `${vehicle.id}-boost`,
      icon: '📣',
      text: 'Impulsione o anúncio deste veículo no OLX, Webmotors ou Instagram',
      priority: 'medium',
      actionLabel: 'Impulsionar',
      actionType: 'open_link',
    },
    {
      id: `${vehicle.id}-leads`,
      icon: '💬',
      text: 'Entre em contato com leads que demonstraram interesse em veículos similares',
      priority: 'medium',
      actionLabel: 'Ver CRM',
      actionType: 'open_crm',
    },
  ]

  if (agingDays >= 45) {
    // ── 45-89d Late Attention ────────────────────────────────────────────────
    const suggested5pct = salePrice > 0 ? Math.round(salePrice * 0.05) : 0
    suggestions.push(
      {
        id: `${vehicle.id}-price5`,
        icon: '💰',
        text: `Considere reduzir o preço em R$ ${brl(suggested5pct)} para se aproximar do valor de mercado FIPE`,
        priority: 'high',
        actionLabel: 'Editar Preço',
        actionType: 'price_edit',
      },
      {
        id: `${vehicle.id}-tradeoff`,
        icon: '🔁',
        text: 'Avalie este veículo para um negócio de troca ou consignação',
        priority: 'high',
        actionLabel: 'Avaliar Troca',
        actionType: 'open_crm',
      },
      {
        id: `${vehicle.id}-holdcost`,
        icon: '📊',
        text: `Revise o custo total de manutenção: compra + R$ ${brl(Math.round(totalExpenses))} em despesas acumuladas`,
        priority: 'high',
      }
    )
  }

  if (agingDays >= 90) {
    // ── 90d+ Critical ────────────────────────────────────────────────────────
    const suggested10pct = salePrice > 0 ? Math.round(salePrice * 0.10) : 0
    suggestions.push(
      {
        id: `${vehicle.id}-urgent`,
        icon: '🚨',
        text: `URGENTE: Este veículo está há ${agingDays} dias em estoque. Ação imediata necessária.`,
        priority: 'urgent',
        actionLabel: 'Notificar Equipe',
        actionType: 'notify_team',
      },
      {
        id: `${vehicle.id}-price10`,
        icon: '🏷️',
        text: `Aplique um desconto agressivo de R$ ${brl(suggested10pct)} — 10% sobre o preço atual`,
        priority: 'urgent',
        actionLabel: 'Editar Preço',
        actionType: 'price_edit',
      },
      {
        id: `${vehicle.id}-wholesale`,
        icon: '🤝',
        text: 'Considere venda no atacado ou leilão como estratégia de saída',
        priority: 'urgent',
        actionLabel: 'Avaliar Leilão',
        actionType: 'open_crm',
      },
      dailyCost > 0
        ? {
            id: `${vehicle.id}-daily`,
            icon: '📉',
            text: `Manter este veículo custa aproximadamente R$ ${brl(dailyCost)}/dia em custo de oportunidade`,
            priority: 'urgent',
          }
        : {
            id: `${vehicle.id}-daily-warn`,
            icon: '📉',
            text: 'Capital imobilizado sem retorno. Custos de oportunidade significativos — considere liquidar este ativo.',
            priority: 'urgent',
          }
    )
  }

  return suggestions
}
