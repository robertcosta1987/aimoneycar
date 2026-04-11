/**
 * components/aging/AgingBadge.tsx
 * Compact inline badge displaying days in stock + aging level.
 * On hover shows a tooltip with the top 2 actionable suggestions.
 * Designed to slot into any vehicle card or list row without layout disruption.
 */

'use client'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getAgingStatus, generateSuggestions } from '@/lib/aging'
import type { AgingThresholds } from '@/types/aging'
import { DEFAULT_THRESHOLDS } from '@/lib/aging'

interface AgingBadgeProps {
  daysInStock: number
  vehicle: {
    id: string
    purchase_price: number
    sale_price: number | null
    totalExpenses: number
  }
  thresholds?: AgingThresholds
  showTooltip?: boolean
}

export function AgingBadge({
  daysInStock,
  vehicle,
  thresholds = DEFAULT_THRESHOLDS,
  showTooltip = true,
}: AgingBadgeProps) {
  const status = useMemo(
    () => getAgingStatus(daysInStock, thresholds),
    [daysInStock, thresholds]
  )

  const topSuggestions = useMemo(
    () => generateSuggestions(vehicle, daysInStock).slice(0, 2),
    [vehicle, daysInStock]
  )

  const badge = (
    <Badge
      variant={status.badgeVariant as any}
      className="gap-1 font-mono text-xs tabular-nums cursor-default"
      aria-label={`${daysInStock} dias em estoque — ${status.label}`}
    >
      {status.level === 'critical' ? '🔴' : status.level === 'attention' ? '🟡' : '🟢'}
      {daysInStock}d
    </Badge>
  )

  if (!showTooltip || topSuggestions.length === 0) return badge

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-background-elevated border border-border p-3 rounded-xl shadow-lg"
        >
          <p className="text-xs font-semibold mb-2" style={{ color: status.color }}>
            {status.label} — {daysInStock} dias em estoque
          </p>
          <ul className="space-y-1">
            {topSuggestions.map(s => (
              <li key={s.id} className="text-xs text-foreground-muted flex gap-1.5">
                <span>{s.icon}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
