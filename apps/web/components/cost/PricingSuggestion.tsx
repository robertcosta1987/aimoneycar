/**
 * components/cost/PricingSuggestion.tsx
 *
 * Shows smart pricing intelligence for a vehicle based on this dealership's
 * own historical sales of the same brand + model.
 *
 * Fetches from GET /api/vehicles/[id]/pricing-suggestion on mount.
 * Renders a compact card with:
 *  - Avg price, range, and avg days-to-sell of comparable sold vehicles
 *  - A clear verdict: aligned / above / below / missing
 *  - A specific suggested price if current is misaligned
 */

'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, CheckCircle2, Lightbulb, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface PricingSuggestionData {
  hasEnoughData: boolean
  count: number
  avgSalePrice?: number
  medianSalePrice?: number
  minPrice?: number
  maxPrice?: number
  avgDaysToSell?: number | null
  suggestion?: 'aligned' | 'above' | 'below' | 'missing'
  currentPrice?: number | null
}

interface PricingSuggestionProps {
  vehicleId: string
  brand: string
  model: string
}

export function PricingSuggestion({ vehicleId, brand, model }: PricingSuggestionProps) {
  const [data, setData] = useState<PricingSuggestionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)

    fetch(`/api/vehicles/${vehicleId}/pricing-suggestion`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setData(json) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [vehicleId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-foreground-muted text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Buscando dados de mercado...
      </div>
    )
  }

  if (!data || !data.hasEnoughData) {
    return (
      <div className="rounded-xl border border-border/50 bg-background-elevated/30 p-3 text-xs text-foreground-muted">
        💡 Ainda não há vendas suficientes de <strong>{brand} {model}</strong> nesta revenda para gerar uma sugestão de preço.
        {data && data.count > 0 && ` (${data.count} venda${data.count > 1 ? 's' : ''} encontrada${data.count > 1 ? 's' : ''}, mínimo 3)`}
      </div>
    )
  }

  const { avgSalePrice, medianSalePrice, minPrice, maxPrice, avgDaysToSell, suggestion, count } = data

  const config = {
    aligned: {
      icon: CheckCircle2,
      color: 'text-success',
      bg:   'bg-success/10 border-success/30',
      title: 'Preço alinhado com o histórico',
      detail: `Veículos similares venderam em média em ${avgDaysToSell ?? '—'} dias.`,
    },
    above: {
      icon: TrendingUp,
      color: 'text-warning',
      bg:   'bg-warning/10 border-warning/30',
      title: 'Preço acima da média histórica',
      detail: `Preços acima de ${formatCurrency(avgSalePrice! * 1.12)} tendem a ficar mais tempo em estoque.`,
    },
    below: {
      icon: TrendingDown,
      color: 'text-secondary',
      bg:   'bg-secondary/10 border-secondary/30',
      title: 'Preço abaixo da média histórica',
      detail: `Pode estar deixando margem na mesa. A média desta revenda é ${formatCurrency(avgSalePrice!)}.`,
    },
    missing: {
      icon: Lightbulb,
      color: 'text-primary',
      bg:   'bg-primary/10 border-primary/30',
      title: 'Sugestão de preço de venda',
      detail: `Baseado em ${count} venda${count !== 1 ? 's' : ''} similares nesta revenda.`,
    },
  }

  const c = config[suggestion!]
  const Icon = c.icon

  return (
    <div className={cn('rounded-xl border p-4 space-y-3', c.bg)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon className={cn('w-4 h-4 flex-shrink-0', c.color)} />
        <p className={cn('text-xs font-semibold', c.color)}>{c.title}</p>
      </div>

      {/* Suggested price (missing) or avg price highlight */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-2xl font-bold text-foreground font-mono">
          {formatCurrency(medianSalePrice!)}
        </p>
        <p className="text-xs text-foreground-muted">mediana · {count} venda{count !== 1 ? 's' : ''}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background-paper/60 p-2">
          <p className="text-xs text-foreground-muted">Mínimo</p>
          <p className="text-xs font-semibold text-foreground font-mono">{formatCurrency(minPrice!)}</p>
        </div>
        <div className="rounded-lg bg-background-paper/60 p-2">
          <p className="text-xs text-foreground-muted">Média</p>
          <p className="text-xs font-semibold text-foreground font-mono">{formatCurrency(avgSalePrice!)}</p>
        </div>
        <div className="rounded-lg bg-background-paper/60 p-2">
          <p className="text-xs text-foreground-muted">Máximo</p>
          <p className="text-xs font-semibold text-foreground font-mono">{formatCurrency(maxPrice!)}</p>
        </div>
      </div>

      {/* Days to sell */}
      {avgDaysToSell && (
        <p className="text-xs text-foreground-muted">
          ⏱ Tempo médio de venda de similares: <strong className="text-foreground">{avgDaysToSell} dias</strong>
        </p>
      )}

      <p className="text-xs text-foreground-muted">{c.detail}</p>
    </div>
  )
}
