/**
 * components/cost/CostHealthWidget.tsx
 *
 * "Cost Health" mini-widget for the main dashboard.
 *
 * Displays:
 *  - Avg Fleet Margin KPI (sold vehicles, all-time)
 *  - Missing Cost Data KPI (red if > 0 vehicles affected)
 *  - Vehicles with Negative Margin KPI
 *  - Mini donut chart: top-4 expense categories + "Outros"
 *  - Link to full /dashboard/custos report page
 *
 * Inputs:  vehicles[] – VehicleForCost with expenses loaded
 */

'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowRight, TrendingUp, AlertTriangle, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { buildCostSummary } from '@/utils/vehicleCost'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from '@/types/cost'
import type { VehicleForCost } from '@/types/cost'
import { cn } from '@/lib/utils'

interface CostHealthWidgetProps {
  vehicles: VehicleForCost[]
}

export function CostHealthWidget({ vehicles }: CostHealthWidgetProps) {
  const { avgMargin, missingCount, negativeCount, donutData } = useMemo(() => {
    const summaries = vehicles.map(v => buildCostSummary(v))

    // Average margin: sold vehicles only, exclude missing cost
    const soldValid = summaries.filter(
      s => {
        const v = vehicles.find(v => v.id === s.vehicleId)
        return v?.status === 'sold' && !s.hasMissingCost && s.salePrice > 0
      }
    )
    const avgMargin = soldValid.length > 0
      ? soldValid.reduce((sum, s) => sum + s.grossMargin, 0) / soldValid.length
      : null

    const missingCount = summaries.filter(s => s.hasMissingCost).length
    const negativeCount = summaries.filter(
      s => !s.hasMissingCost && s.salePrice > 0 && s.grossProfit < 0
    ).length

    // Fleet-wide expense totals by category
    const catTotals: Record<string, number> = {}
    for (const v of vehicles) {
      for (const e of v.expenses) {
        catTotals[e.category] = (catTotals[e.category] ?? 0) + e.amount
      }
    }
    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1])
    const top4 = sorted.slice(0, 4)
    const othersTotal = sorted.slice(4).reduce((s, [, v]) => s + v, 0)
    const donutData = [
      ...top4.map(([name, value]) => ({ name, value })),
      ...(othersTotal > 0 ? [{ name: 'Outros', value: othersTotal }] : []),
    ]

    return { avgMargin, missingCount, negativeCount, donutData }
  }, [vehicles])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Saúde dos Custos
          </CardTitle>
          <Link href="/dashboard/custos">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              Ver análise <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3">
          {/* Avg margin */}
          <div className="text-center">
            <p className={cn(
              'text-lg font-bold font-mono',
              avgMargin === null ? 'text-foreground-muted' :
              avgMargin < 0 ? 'text-danger' :
              avgMargin < 5 ? 'text-warning' :
              avgMargin < 15 ? 'text-secondary' : 'text-success'
            )}>
              {avgMargin === null ? '—' : formatPercent(avgMargin)}
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">Margem Média</p>
          </div>

          {/* Missing cost */}
          <div className="text-center">
            <p className={cn(
              'text-lg font-bold font-mono',
              missingCount === 0 ? 'text-success' : 'text-danger'
            )}>
              {missingCount}
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">Custo Ausente</p>
            {missingCount > 0 && (
              <p className="text-xs text-danger mt-0.5">⚠️ Corrigir</p>
            )}
          </div>

          {/* Negative margin */}
          <div className="text-center">
            <p className={cn(
              'text-lg font-bold font-mono',
              negativeCount === 0 ? 'text-success' : 'text-danger'
            )}>
              {negativeCount}
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">Margem Negativa</p>
          </div>
        </div>

        {/* Mini donut chart */}
        {donutData.length > 0 && (
          <div>
            <p className="text-xs text-foreground-muted mb-2">Despesas por Categoria</p>
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={80} height={80}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={24}
                    outerRadius={36}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {donutData.map(entry => (
                      <Cell
                        key={entry.name}
                        fill={CATEGORY_COLORS[entry.name] ?? DEFAULT_CATEGORY_COLOR}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 8, fontSize: 10, color: '#FFFFFF', fontWeight: 700 }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 flex-1 min-w-0">
                {donutData.map(entry => (
                  <div key={entry.name} className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: CATEGORY_COLORS[entry.name] ?? DEFAULT_CATEGORY_COLOR }}
                    />
                    <span className="text-xs text-foreground-muted truncate">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
