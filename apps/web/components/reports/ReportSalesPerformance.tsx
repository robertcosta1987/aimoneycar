'use client'
import type { SalesPerformance, SaleVehicleRow } from '@/types/report.types'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Props { data: SalesPerformance }

function VehicleRow({ v, rank }: { v: SaleVehicleRow; rank?: number }) {
  const marginColor = v.margin >= 15 ? 'text-success' : v.margin >= 8 ? 'text-warning' : 'text-danger'
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      {rank !== undefined && (
        <span className="w-5 text-xs text-foreground-subtle text-right flex-shrink-0">{rank}.</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{v.name}</p>
        <p className="text-xs text-foreground-muted">{v.plate || '—'} · {v.saleDate ? new Date(v.saleDate).toLocaleDateString('pt-BR') : '—'} · {v.daysToSell}d</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-foreground">{formatCurrency(v.profit)}</p>
        <p className={`text-xs ${marginColor}`}>{v.margin.toFixed(1)}%</p>
      </div>
    </div>
  )
}

export function ReportSalesPerformance({ data }: Props) {
  const { totalSold, avgDaysToSell, fastestSale, slowestSale, topProfitable, bottomMargin, unitsByPeriod } = data

  return (
    <section className="space-y-4 print:break-inside-avoid">
      <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
        4.3 Performance de Vendas
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Veículos Vendidos', value: String(totalSold), color: 'text-primary' },
          { label: 'Tempo Médio', value: `${avgDaysToSell}d`, color: avgDaysToSell <= 30 ? 'text-success' : avgDaysToSell <= 60 ? 'text-warning' : 'text-danger' },
          { label: 'Venda Mais Rápida', value: fastestSale ? `${fastestSale.days}d` : '—', sub: fastestSale?.name, color: 'text-success' },
          { label: 'Venda Mais Lenta',  value: slowestSale ? `${slowestSale.days}d` : '—', sub: slowestSale?.name, color: 'text-warning' },
        ].map(m => (
          <div key={m.label} className="p-4 rounded-xl bg-background-elevated">
            <p className="text-xs text-foreground-muted mb-1">{m.label}</p>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
            {m.sub && <p className="text-xs text-foreground-subtle mt-0.5 truncate">{m.sub}</p>}
          </div>
        ))}
      </div>

      {unitsByPeriod.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Unidades Vendidas por Período</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={unitsByPeriod} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B9EB3' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8B9EB3' }} />
                <Tooltip contentStyle={{ background: '#111820', border: '1px solid #1E2A3A', borderRadius: 10, color: '#E2E8F0' }} labelStyle={{ color: '#E2E8F0' }} />
                <Bar dataKey="units" name="Veículos" fill="#3B82F6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topProfitable.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top 5 — Maior Lucro</CardTitle>
            </CardHeader>
            <CardContent>
              {topProfitable.map((v, i) => <VehicleRow key={v.id} v={v} rank={i + 1} />)}
            </CardContent>
          </Card>
        )}
        {bottomMargin.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top 5 — Menor Margem</CardTitle>
            </CardHeader>
            <CardContent>
              {bottomMargin.map((v, i) => <VehicleRow key={v.id} v={v} rank={i + 1} />)}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  )
}
