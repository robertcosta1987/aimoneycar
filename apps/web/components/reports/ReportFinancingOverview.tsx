'use client'
import type { FinancingOverview } from '@/types/report.types'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props { data: FinancingOverview }

export function ReportFinancingOverview({ data }: Props) {
  const {
    totalContracts, totalFinancedAmount, cashCount, cashAmount, byBank,
    missingDataContracts, avgInstallments, avgInstallmentAmount, avgInterestRate,
  } = data

  const paymentSplit = [
    { name: 'Financiado', value: totalContracts, color: '#00D9FF' },
    { name: 'À Vista',    value: cashCount,       color: '#00E676' },
  ].filter(d => d.value > 0)

  return (
    <section className="space-y-4 print:break-inside-avoid">
      <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
        4.6 Overview de Financiamentos
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Contratos', value: String(totalContracts), color: 'text-primary' },
          { label: 'Volume Financiado', value: formatCurrency(totalFinancedAmount), color: 'text-primary' },
          { label: 'Vendas à Vista', value: String(cashCount), color: 'text-success' },
          { label: 'Volume à Vista', value: formatCurrency(cashAmount), color: 'text-success' },
        ].map(m => (
          <div key={m.label} className="p-4 rounded-xl bg-background-elevated">
            <p className="text-xs text-foreground-muted mb-1">{m.label}</p>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {(avgInstallments != null || avgInstallmentAmount != null || avgInterestRate != null) && (
        <div className="grid grid-cols-3 gap-3">
          {avgInstallments != null && (
            <div className="p-4 rounded-xl bg-background-elevated">
              <p className="text-xs text-foreground-muted mb-1">Prazo Médio</p>
              <p className="text-xl font-bold text-foreground">{avgInstallments}x</p>
            </div>
          )}
          {avgInstallmentAmount != null && (
            <div className="p-4 rounded-xl bg-background-elevated">
              <p className="text-xs text-foreground-muted mb-1">Parcela Média</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(avgInstallmentAmount)}</p>
            </div>
          )}
          {avgInterestRate != null && (
            <div className="p-4 rounded-xl bg-background-elevated">
              <p className="text-xs text-foreground-muted mb-1">Taxa Média a.m.</p>
              <p className="text-xl font-bold text-foreground">{avgInterestRate}%</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paymentSplit.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Forma de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={paymentSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3}>
                    {paymentSplit.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#111820', border: '1px solid #1E2A3A', borderRadius: 10 }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-foreground-muted">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {byBank.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Por Banco Financiador</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byBank.map(b => (
                <div key={b.bank} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{b.bank}</span>
                  <div className="text-right">
                    <span className="font-medium text-foreground">{b.count} contrato{b.count !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-foreground-muted ml-2">{formatCurrency(b.totalAmount)}</span>
                  </div>
                </div>
              ))}
              {missingDataContracts > 0 && (
                <p className="text-xs text-warning mt-2">
                  {missingDataContracts} contrato{missingDataContracts !== 1 ? 's' : ''} sem dados completos
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  )
}
