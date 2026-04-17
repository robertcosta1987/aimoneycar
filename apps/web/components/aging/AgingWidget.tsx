/**
 * components/aging/AgingWidget.tsx
 * Compact "Aging Overview" widget for the main dashboard.
 * Shows attention/critical KPI counts, a mini distribution bar chart,
 * and a "View All Alerts" link to the full aging panel.
 */

'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getAgingStatus } from '@/lib/aging'
import { formatCurrency } from '@/lib/utils'
import { useAgingThresholds } from '@/hooks/use-aging-thresholds'

interface WidgetVehicle {
  id: string
  days_in_stock: number
  sale_price: number | null
}

interface AgingWidgetProps {
  vehicles: WidgetVehicle[]
}

const LEVEL_BUCKETS = [
  { label: 'OK',      level: 'ok',        color: '#22C55E' },
  { label: 'Atenção', level: 'attention',  color: '#EAB308' },
  { label: 'Crítico', level: 'critical',   color: '#EF4444' },
] as const

export function AgingWidget({ vehicles }: AgingWidgetProps) {
  const { thresholds, loaded } = useAgingThresholds()

  const stats = useMemo(() => {
    const attention = vehicles.filter(v => getAgingStatus(v.days_in_stock, thresholds).level === 'attention')
    const critical = vehicles.filter(v => getAgingStatus(v.days_in_stock, thresholds).level === 'critical')
    const atRisk = [...attention, ...critical].reduce((s, v) => s + (v.sale_price ?? 0), 0)
    return { attention: attention.length, critical: critical.length, atRisk }
  }, [vehicles, thresholds])

  const chartData = useMemo(() =>
    LEVEL_BUCKETS.map(b => ({
      label: b.label,
      count: vehicles.filter(v => getAgingStatus(v.days_in_stock, thresholds).level === b.level).length,
      color: b.color,
    })),
    [vehicles, thresholds]
  )

  if (!loaded || vehicles.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Giro de Estoque
          </CardTitle>
          <Link href="/dashboard/envelhecimento">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              Ver Alertas <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Pills */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning" className="gap-1 text-xs">
            ⚠️ {stats.attention} em atenção
          </Badge>
          <Badge variant="destructive" className="gap-1 text-xs">
            🔴 {stats.critical} críticos
          </Badge>
          {stats.atRisk > 0 && (
            <Badge variant="outline" className="text-xs text-danger border-danger/30">
              {formatCurrency(stats.atRisk)} em risco
            </Badge>
          )}
        </div>

        {/* Mini bar chart */}
        <div aria-label="Distribuição do estoque por tempo">
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={chartData} barSize={28} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#8B9EB3' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#8B9EB3' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--bg-elevated))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 11, color: 'rgb(var(--fg))' }}
                formatter={(value: any) => [`${value} veículo${value !== 1 ? 's' : ''}`, '']}
                labelStyle={{ color: 'rgb(var(--fg-muted))' }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} style={{ fill: entry.color }} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
