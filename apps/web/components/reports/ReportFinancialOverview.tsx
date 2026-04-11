'use client'
import type { FinancialOverview } from '@/types/report.types'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

interface Props {
  data: FinancialOverview
}

function Metric({ label, value, sub, color = 'text-foreground' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="p-4 rounded-xl bg-background-elevated">
      <p className="text-xs text-foreground-muted mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-foreground-subtle mt-0.5">{sub}</p>}
    </div>
  )
}

export function ReportFinancialOverview({ data }: Props) {
  const { totalRevenue, totalProfit, totalExpenses, avgMargin, roi, chartData } = data

  return (
    <section className="space-y-4 print:break-inside-avoid">
      <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
        4.2 Visão Financeira
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Metric label="Receita Total"   value={formatCurrency(totalRevenue)} color="text-primary" />
        <Metric label="Lucro Bruto"     value={formatCurrency(totalProfit)}  color={totalProfit >= 0 ? 'text-success' : 'text-danger'} />
        <Metric label="Total Despesas"  value={formatCurrency(totalExpenses)} color="text-warning" />
        <Metric label="Margem Média"    value={`${avgMargin.toFixed(1)}%`}   color={avgMargin >= 15 ? 'text-success' : avgMargin >= 8 ? 'text-warning' : 'text-danger'} />
        <Metric label="ROI"             value={`${roi.toFixed(1)}%`}         color={roi >= 15 ? 'text-success' : 'text-warning'} sub="lucro / custo" />
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Receita, Lucro e Despesas por Período</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B9EB3' }} />
                <YAxis yAxisId="money" tick={{ fontSize: 10, fill: '#8B9EB3' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#8B9EB3' }} tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#111820', border: '1px solid #1E2A3A', borderRadius: 10 }}
                  formatter={(v: number, name: string) =>
                    name === 'Margem' ? [`${v.toFixed(1)}%`, name] : [formatCurrency(v), name]
                  }
                />
                <Bar yAxisId="money" dataKey="revenue"  name="Receita"   fill="#00D9FF" radius={[4,4,0,0]} opacity={0.8} />
                <Bar yAxisId="money" dataKey="profit"   name="Lucro"     fill="#00E676" radius={[4,4,0,0]} opacity={0.8} />
                <Bar yAxisId="money" dataKey="expenses" name="Despesas"  fill="#FF9100" radius={[4,4,0,0]} opacity={0.6} />
                <Line yAxisId="pct"  dataKey="margin"   name="Margem"    stroke="#FF5252" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
