/**
 * components/cost/CostBadge.tsx
 *
 * Compact inline badge for vehicle lists/tables displaying:
 *  - True cost vs sale price
 *  - Gross margin % with colour coding:
 *      ⚫ Data incomplete  (purchase_price === 0)
 *      🔴 < 0%  negative margin
 *      🔴 < 5%  very low margin
 *      🟡 5–15% low margin
 *      🟢 > 15% healthy margin
 *
 * On hover: Radix Tooltip shows purchase price, total expenses, true cost, profit.
 *
 * Inputs:  VehicleCostSummary (from buildCostSummary)
 *          size?: 'sm' | 'md' (defaults to 'sm')
 */

'use client'
import { useMemo } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatCurrency } from '@/lib/utils'
import { getMarginDisplay } from '@/types/cost'
import type { VehicleCostSummary } from '@/types/cost'
import { cn } from '@/lib/utils'

interface CostBadgeProps {
  summary: VehicleCostSummary
  size?: 'sm' | 'md'
  showTooltip?: boolean
}

export function CostBadge({ summary, size = 'sm', showTooltip = true }: CostBadgeProps) {
  const display = useMemo(() => getMarginDisplay(summary), [summary])

  const badge = (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-mono font-semibold cursor-default select-none',
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1',
        display.textClass,
        display.bgClass,
        // Negative margin gets alarming red background
        display.bracket === 'negative' && 'ring-1 ring-danger/50'
      )}
      aria-label={`Margem: ${display.label}`}
    >
      {display.bracket === 'incomplete' ? '⚫' :
       display.bracket === 'negative' ? '🔴' :
       display.bracket === 'very_low' ? '🔴' :
       display.bracket === 'low' ? '🟡' : '🟢'}{' '}
      {display.label}
    </span>
  )

  if (!showTooltip) return badge

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-background-elevated border border-border p-3 rounded-xl shadow-lg space-y-1.5"
        >
          <p className="text-xs font-semibold text-foreground mb-1">Custo Real</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-foreground-muted">Compra</span>
            <span className="text-right font-mono text-foreground">
              {summary.hasMissingCost
                ? <span className="text-danger">R$ 0 ⚠️</span>
                : formatCurrency(summary.purchasePrice)}
            </span>
            <span className="text-foreground-muted">Despesas</span>
            <span className="text-right font-mono text-foreground">
              {formatCurrency(summary.totalExpenses)}
            </span>
            <span className="text-foreground-muted font-semibold">Custo Real</span>
            <span className="text-right font-mono font-semibold text-foreground">
              {formatCurrency(summary.trueCost)}
            </span>
            {summary.salePrice > 0 && (
              <>
                <span className="text-foreground-muted">Preço Venda</span>
                <span className="text-right font-mono text-foreground">
                  {formatCurrency(summary.salePrice)}
                </span>
                <span className="text-foreground-muted font-semibold">Lucro Bruto</span>
                <span className={cn(
                  'text-right font-mono font-semibold',
                  summary.grossProfit >= 0 ? 'text-success' : 'text-danger'
                )}>
                  {formatCurrency(summary.grossProfit)}
                </span>
              </>
            )}
          </div>
          {summary.hasMissingCost && (
            <p className="text-xs text-danger mt-1">
              ⚠️ Preço de compra ausente — margem inválida
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
