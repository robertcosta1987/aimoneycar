'use client'
import type { ExpenseBreakdown } from '@/types/report.types'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props { data: ExpenseBreakdown }

const CATEGORY_COLORS = [
  '#3B82F6','#8B5CF6','#06B6D4','#F97316','#EC4899','#6366F1','#14B8A6',
]

export function ReportExpenseBreakdown({ data }: Props) {
  const { totalExpenses, byCategory, avgPerVehicleSold, largestItem } = data

  return (
    <section className="space-y-4 print:break-inside-avoid">
      <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
        4.5 Análise de Despesas
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-background-elevated">
          <p className="text-xs text-foreground-muted mb-1">Total de Despesas</p>
          <p className="text-xl font-bold text-warning">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="p-4 rounded-xl bg-background-elevated">
          <p className="text-xs text-foreground-muted mb-1">Média por Venda</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(avgPerVehicleSold)}</p>
        </div>
        {largestItem && (
          <div className="p-4 rounded-xl bg-background-elevated">
            <p className="text-xs text-foreground-muted mb-1">Maior Despesa</p>
            <p className="text-xl font-bold text-danger">{formatCurrency(largestItem.amount)}</p>
            <p className="text-xs text-foreground-subtle truncate mt-0.5">{largestItem.description}</p>
          </div>
        )}
      </div>

      {byCategory.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  layout="vertical"
                  data={byCategory.slice(0, 7)}
                  margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#8B9EB3' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: '#8B9EB3' }} width={80} />
                  <Tooltip
                    contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 10, color: '#FFFFFF', fontWeight: 700 }}
                    labelStyle={{ color: '#FFFFFF', fontWeight: 700 }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Bar dataKey="total" name="Total" radius={[0,4,4,0]}>
                    {byCategory.slice(0, 7).map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Detalhamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byCategory.map((cat, i) => (
                <div key={cat.category} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                    />
                    <span className="text-foreground truncate">{cat.category}</span>
                    <span className="text-foreground-subtle text-xs">({cat.count})</span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="font-medium text-foreground">{formatCurrency(cat.total)}</span>
                    <span className="text-foreground-muted text-xs ml-2">{cat.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
