'use client'
import type { InventoryHealth, InventoryVehicleRow } from '@/types/report.types'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props { data: InventoryHealth }

function VehicleList({ vehicles, emptyMsg }: { vehicles: InventoryVehicleRow[]; emptyMsg: string }) {
  if (!vehicles.length) return <p className="text-xs text-foreground-muted py-3">{emptyMsg}</p>
  return (
    <div className="space-y-2">
      {vehicles.map(v => (
        <div key={v.id} className="flex items-center justify-between text-sm">
          <div>
            <span className="font-medium text-foreground">{v.name}</span>
            {v.plate && <span className="text-foreground-muted ml-2">({v.plate})</span>}
          </div>
          <div className="text-right flex-shrink-0 ml-4">
            <span className="font-semibold text-warning">{v.daysInStock}d</span>
            {v.salePrice ? (
              <span className="text-xs text-foreground-muted ml-2">{formatCurrency(v.salePrice)}</span>
            ) : (
              <span className="text-xs text-danger ml-2">sem preço</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReportInventoryHealth({ data }: Props) {
  const { totalInStock, avgDaysInStock, attentionVehicles, criticalVehicles, missingPriceVehicles, agingDistribution } = data

  return (
    <section className="space-y-4 print:break-inside-avoid">
      <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
        4.4 Saúde do Estoque
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total em Estoque', value: String(totalInStock), color: 'text-primary' },
          { label: 'Dias Médios', value: `${avgDaysInStock}d`, color: avgDaysInStock <= 45 ? 'text-success' : avgDaysInStock <= 90 ? 'text-warning' : 'text-danger' },
          { label: 'Zona de Atenção', value: String(attentionVehicles.length), color: 'text-warning' },
          { label: 'Situação Crítica', value: String(criticalVehicles.length), color: criticalVehicles.length > 0 ? 'text-danger' : 'text-success' },
        ].map(m => (
          <div key={m.label} className="p-4 rounded-xl bg-background-elevated">
            <p className="text-xs text-foreground-muted mb-1">{m.label}</p>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agingDistribution.some(b => b.count > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Distribuição por Envelhecimento</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={agingDistribution}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {agingDistribution.map((b, i) => (
                      <Cell key={i} fill={b.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 10, color: '#FFFFFF', fontWeight: 700 }} labelStyle={{ color: '#FFFFFF', fontWeight: 700 }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-foreground-muted">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-warning">Atenção (46–90 dias)</CardTitle>
            </CardHeader>
            <CardContent>
              <VehicleList vehicles={attentionVehicles} emptyMsg="Nenhum veículo na zona de atenção" />
            </CardContent>
          </Card>

          {missingPriceVehicles.length > 0 && (
            <Card className="border-danger/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-danger">Sem Preço Definido</CardTitle>
              </CardHeader>
              <CardContent>
                <VehicleList vehicles={missingPriceVehicles} emptyMsg="" />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {criticalVehicles.length > 0 && (
        <Card className="border-danger/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-danger">Críticos (&gt;90 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <VehicleList vehicles={criticalVehicles} emptyMsg="" />
          </CardContent>
        </Card>
      )}
    </section>
  )
}
