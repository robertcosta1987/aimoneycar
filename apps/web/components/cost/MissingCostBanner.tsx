/**
 * components/cost/MissingCostBanner.tsx
 *
 * Dismissible warning banner shown on the inventory page when any available
 * vehicle has purchase_price === 0.
 *
 * Business rules:
 * - Cannot be permanently dismissed: uses sessionStorage so it reappears
 *   on the next browser session until all costs are filled in.
 * - Visual severity escalates with count:
 *     1–2 vehicles  → yellow (warning)
 *     3–5 vehicles  → orange
 *     6+ vehicles   → red (danger)
 * - Renders null when no vehicles have missing costs or banner is dismissed.
 *
 * Inputs:  vehicles[] with id, brand, model, purchase_price
 *          onFixVehicle(vehicleId) callback → opens CostEditModal for that vehicle
 */

'use client'
import { useState, useEffect } from 'react'
import { AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BannerVehicle {
  id: string
  brand: string
  model: string
  plate: string | null
  purchase_price: number
}

interface MissingCostBannerProps {
  vehicles: BannerVehicle[]
  onFixVehicle: (vehicleId: string) => void
}

const SESSION_KEY = 'moneycar_missing_cost_banner_dismissed'

function getSeverity(count: number): 'yellow' | 'orange' | 'red' {
  if (count >= 6) return 'red'
  if (count >= 3) return 'orange'
  return 'yellow'
}

const SEVERITY_STYLES = {
  yellow: {
    wrapper: 'bg-warning/10 border-warning/30',
    icon: 'text-warning',
    title: 'text-warning',
    badge: 'bg-warning/20 text-warning',
  },
  orange: {
    wrapper: 'bg-orange-500/10 border-orange-500/30',
    icon: 'text-orange-400',
    title: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-400',
  },
  red: {
    wrapper: 'bg-danger/10 border-danger/30',
    icon: 'text-danger',
    title: 'text-danger',
    badge: 'bg-danger/20 text-danger',
  },
}

export function MissingCostBanner({ vehicles, onFixVehicle }: MissingCostBannerProps) {
  const missing = vehicles.filter(v => v.purchase_price === 0)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    try {
      // Reload on each new session — sessionStorage cleared on tab close
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) setDismissed(true)
    } catch {
      // ignore
    }
  }, [])

  if (missing.length === 0 || dismissed) return null

  const severity = getSeverity(missing.length)
  const styles = SEVERITY_STYLES[severity]

  function handleDismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'rounded-xl border p-4 space-y-3 transition-all',
        styles.wrapper
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertTriangle className={cn('w-5 h-5 flex-shrink-0 mt-0.5', styles.icon)} />
          <div className="flex-1 min-w-0">
            <p className={cn('font-semibold text-sm', styles.title)}>
              ⚠️ {missing.length} veículo{missing.length !== 1 ? 's' : ''}{' '}
              {missing.length !== 1 ? 'estão' : 'está'} sem custo de compra — análise de margem imprecisa
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">
              O preço de compra é R$ 0 nestes veículos. A margem calculada está incorreta.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Ocultar' : 'Ver lista'}
          </Button>
          <button
            onClick={handleDismiss}
            aria-label="Fechar aviso"
            className="p-1 rounded-md text-foreground-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded vehicle list */}
      {expanded && (
        <div className="space-y-1.5 pl-8">
          {missing.map(v => (
            <div
              key={v.id}
              className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-background-paper/50 gap-2"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded', styles.badge)}>
                  R$ 0
                </span>
                <p className="text-sm text-foreground truncate">
                  {v.brand} {v.model}
                  {v.plate && (
                    <span className="text-foreground-muted ml-1.5 text-xs">{v.plate}</span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-shrink-0"
                onClick={() => onFixVehicle(v.id)}
              >
                Corrigir
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
