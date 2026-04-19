'use client'
import type { OperationalMetrics } from '@/types/report.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props { data: OperationalMetrics }

export function ReportOperationalMetrics({ data }: Props) {
  const { turnoverRate, bestPeriod, inflow } = data

  return (
    <section className="space-y-4 print:break-inside-avoid">
      <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
        4.7 Métricas Operacionais
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-background-elevated">
          <p className="text-xs text-foreground-muted mb-1">Taxa de Giro</p>
          <p className={`text-xl font-bold ${turnoverRate >= 1 ? 'text-success' : 'text-warning'}`}>
            {turnoverRate.toFixed(2)}x
          </p>
          <p className="text-xs text-foreground-subtle mt-0.5">vendidos / estoque médio</p>
        </div>
        <div className="p-4 rounded-xl bg-background-elevated">
          <p className="text-xs text-foreground-muted mb-1">Melhor Período</p>
          <p className="text-xl font-bold text-primary">{bestPeriod.units} un.</p>
          <p className="text-xs text-foreground-subtle mt-0.5">{bestPeriod.label}</p>
        </div>
        <div className="p-4 rounded-xl bg-background-elevated">
          <p className="text-xs text-foreground-muted mb-1">Total Entradas</p>
          <p className="text-xl font-bold text-foreground">
            {inflow.reduce((s, d) => s + d.acquired, 0)} un.
          </p>
          <p className="text-xs text-foreground-subtle mt-0.5">adquiridos no período</p>
        </div>
      </div>

      {inflow.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Fluxo de Entrada e Saída</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={inflow} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B9EB3' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8B9EB3' }} />
                <Tooltip contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 10, color: '#FFFFFF', fontWeight: 700 }} labelStyle={{ color: '#FFFFFF', fontWeight: 700 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-foreground-muted">{v}</span>} />
                <Bar dataKey="acquired" name="Adquiridos" fill="#3B82F6" radius={[4,4,0,0]} opacity={0.85} />
                <Bar dataKey="sold"     name="Vendidos"   fill="#22C55E" radius={[4,4,0,0]} opacity={0.85} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
