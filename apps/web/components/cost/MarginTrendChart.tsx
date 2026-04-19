/**
 * components/cost/MarginTrendChart.tsx
 *
 * Historical gross margin % trend for sold vehicles, ordered by sale date.
 *
 * Chart elements:
 *  - Bar chart: gross margin % per vehicle sold
 *  - Line overlay: 5-sale moving average
 *  - Reference line: fleet average margin (dashed)
 *  - Reference line: 15% target (green dashed)
 *  - Tooltip: vehicle name, sale date, margin %, gross profit amount
 *
 * Inputs:
 *   vehicles  – VehicleForCost[] (only 'sold' vehicles are used)
 */

'use client'
import { useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'
import { buildCostSummary } from '@/utils/vehicleCost'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'
import type { VehicleForCost } from '@/types/cost'

interface MarginTrendChartProps {
  vehicles: VehicleForCost[]
}

interface DataPoint {
  label: string
  margin: number
  movingAvg: number | null
  grossProfit: number
  name: string
  saleDate: string
  hasMissingCost: boolean
}

export function MarginTrendChart({ vehicles }: MarginTrendChartProps) {
  const { dataPoints, avgMargin, hasData } = useMemo(() => {
    const sold = vehicles
      .filter(v => v.status === 'sold' && v.sale_date)
      .sort((a, b) => (a.sale_date ?? '').localeCompare(b.sale_date ?? ''))

    const points: DataPoint[] = sold.map((v, i) => {
      const summary = buildCostSummary(v)
      return {
        label: `${i + 1}. ${v.brand} ${v.model}`.slice(0, 18),
        name: `${v.brand} ${v.model}`,
        saleDate: v.sale_date ?? '',
        margin: summary.hasMissingCost ? 0 : summary.grossMargin,
        grossProfit: summary.grossProfit,
        movingAvg: null,
        hasMissingCost: summary.hasMissingCost,
      }
    })

    // Compute 5-sale moving average (centred on current sale)
    for (let i = 0; i < points.length; i++) {
      const windowSlice = points.slice(Math.max(0, i - 4), i + 1)
      const valid = windowSlice.filter(p => !p.hasMissingCost)
      if (valid.length > 0) {
        points[i].movingAvg =
          valid.reduce((sum, p) => sum + p.margin, 0) / valid.length
      }
    }

    const validPoints = points.filter(p => !p.hasMissingCost)
    const avgMargin =
      validPoints.length > 0
        ? validPoints.reduce((sum, p) => sum + p.margin, 0) / validPoints.length
        : null

    return { dataPoints: points, avgMargin, hasData: points.length > 0 }
  }, [vehicles])

  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Evolução da Margem — Vendas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-foreground-muted text-sm py-8">
            Nenhuma venda registrada ainda
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Evolução da Margem — Últimas {dataPoints.length} Vendas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={dataPoints}
            margin={{ top: 8, right: 16, left: -16, bottom: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#8B9EB3' }}
              axisLine={false}
              tickLine={false}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#8B9EB3' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${(v as number).toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                background: '#2563EB',
                border: 'none',
                borderRadius: 8,
                fontSize: 11,
              }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as DataPoint
                return (
                  <div className="bg-background-elevated border border-border rounded-xl p-3 text-xs space-y-1 min-w-[180px]">
                    <p className="font-semibold text-foreground">{p.name}</p>
                    {p.saleDate && (
                      <p className="text-foreground-muted">Vendido: {formatDate(p.saleDate)}</p>
                    )}
                    {p.hasMissingCost ? (
                      <p className="text-danger">⚠️ Custo de compra ausente</p>
                    ) : (
                      <>
                        <p className="text-foreground">
                          Margem:{' '}
                          <span className={p.margin >= 15 ? 'text-success' : p.margin >= 5 ? 'text-secondary' : p.margin >= 0 ? 'text-warning' : 'text-danger'}>
                            {formatPercent(p.margin)}
                          </span>
                        </p>
                        <p className="text-foreground">
                          Lucro:{' '}
                          <span className={p.grossProfit >= 0 ? 'text-success' : 'text-danger'}>
                            {formatCurrency(p.grossProfit)}
                          </span>
                        </p>
                      </>
                    )}
                    {p.movingAvg !== null && (
                      <p className="text-primary">Média móvel: {formatPercent(p.movingAvg)}</p>
                    )}
                  </div>
                )
              }}
            />

            {/* 15% target reference line */}
            <ReferenceLine
              y={15}
              stroke="#22C55E"
              strokeDasharray="6 3"
              strokeWidth={1}
              label={{ value: 'Meta 15%', position: 'right', fontSize: 9, fill: '#22C55E' }}
            />

            {/* Fleet average reference line */}
            {avgMargin !== null && (
              <ReferenceLine
                y={avgMargin}
                stroke="#3B82F6"
                strokeDasharray="4 2"
                strokeWidth={1}
                label={{
                  value: `Média ${avgMargin.toFixed(1)}%`,
                  position: 'right',
                  fontSize: 9,
                  fill: '#3B82F6',
                }}
              />
            )}

            {/* Margin bars — colour-coded per margin level */}
            <Bar dataKey="margin" name="Margem" barSize={24} radius={[3, 3, 0, 0]}>
              {dataPoints.map(p => (
                <Cell
                  key={p.label}
                  fill={
                    p.hasMissingCost ? '#374151' :
                    p.margin < 0 ? '#EF4444' :
                    p.margin < 5 ? '#EAB308' :
                    p.margin < 15 ? '#EAB308' : '#22C55E'
                  }
                />
              ))}
            </Bar>

            {/* Moving average line */}
            <Line
              type="monotone"
              dataKey="movingAvg"
              name="Média Móvel (5)"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-foreground-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#22C55E' }} />
            &gt; 15%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#EAB308' }} />
            0–15%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#EF4444' }} />
            Negativa
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-full inline-block" style={{ background: '#3B82F6' }} />
            Média Móvel
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
