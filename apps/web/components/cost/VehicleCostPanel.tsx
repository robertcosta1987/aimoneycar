/**
 * components/cost/VehicleCostPanel.tsx
 *
 * Detailed cost breakdown panel for a single vehicle.
 * Designed to be rendered inside a Dialog (triggered from VehicleCostPanelDialog).
 *
 * Section 1 — Cost Summary (always visible)
 *   Purchase Price | Total Expenses | True Cost | Sale Price |
 *   Gross Profit | Gross Margin | Days in Stock | Profit/Day
 *
 * Section 2 — Expense Breakdown (collapsible)
 *   Horizontal bar chart (by category, sorted desc)
 *   Expenses table (date | category | description | amount)
 *   "Add Expense" button → opens CostEditModal
 *
 * Section 3 — Data Quality (collapsible)
 *   Score gauge + issues list + "Fix Issues" button
 *
 * Inputs:
 *   vehicle       – VehicleForCost with expenses loaded
 *   onEditCosts   – opens CostEditModal for this vehicle
 */

'use client'
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, AlertCircle, Pencil, Lightbulb } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buildCostSummary, checkMarginAlerts } from '@/utils/vehicleCost'
import { PricingSuggestion } from '@/components/cost/PricingSuggestion'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, getMarginDisplay } from '@/types/cost'
import type { VehicleForCost } from '@/types/cost'
import { cn } from '@/lib/utils'

interface VehicleCostPanelProps {
  vehicle: VehicleForCost
  onEditCosts: () => void
}

export function VehicleCostPanel({ vehicle, onEditCosts }: VehicleCostPanelProps) {
  const [showExpenses, setShowExpenses] = useState(false)
  const [showQuality, setShowQuality] = useState(false)
  const [showPricing, setShowPricing] = useState(true)

  const summary = useMemo(() => buildCostSummary(vehicle), [vehicle])
  const alerts = useMemo(() => checkMarginAlerts(summary), [summary])
  const marginDisplay = useMemo(() => getMarginDisplay(summary), [summary])

  // Chart data: expenses by category sorted desc
  const chartData = useMemo(
    () =>
      Object.entries(summary.expensesByCategory)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    [summary.expensesByCategory]
  )

  return (
    <div className="space-y-4">
      {/* Margin alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-xl border text-sm',
                alert.severity === 'error'
                  ? 'bg-danger/10 border-danger/30'
                  : 'bg-warning/10 border-warning/30'
              )}
            >
              <AlertTriangle
                className={cn('w-4 h-4 flex-shrink-0 mt-0.5',
                  alert.severity === 'error' ? 'text-danger' : 'text-warning')}
              />
              <div className="flex-1">
                <p className={cn(
                  'text-xs font-semibold',
                  alert.severity === 'error' ? 'text-danger' : 'text-warning'
                )}>
                  {alert.message}
                </p>
                <p className="text-xs text-foreground-muted mt-0.5">{alert.suggestedAction}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Section 1: Cost Summary ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Resumo de Custo</CardTitle>
            <Button variant="outline" size="sm" onClick={onEditCosts} className="h-7 text-xs gap-1">
              <Pencil className="w-3 h-3" />
              Editar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            <CostRow
              label="Preço de Compra"
              value={
                summary.hasMissingCost
                  ? <span className="text-danger font-bold">R$ 0 ⚠️</span>
                  : formatCurrency(summary.purchasePrice)
              }
            />
            <CostRow label="Total Despesas" value={formatCurrency(summary.totalExpenses)} />
            <CostRow
              label="Custo Real Total"
              value={formatCurrency(summary.trueCost)}
              bold
            />
            <CostRow
              label="Preço de Venda"
              value={summary.salePrice > 0 ? formatCurrency(summary.salePrice) : '—'}
            />
            <CostRow
              label="Lucro Bruto"
              value={
                summary.hasMissingCost || summary.salePrice === 0
                  ? <span className="text-foreground-muted text-xs">⚠️ Dados incompletos</span>
                  : (
                    <span className={summary.grossProfit >= 0 ? 'text-success' : 'text-danger'}>
                      {formatCurrency(summary.grossProfit)}
                    </span>
                  )
              }
              highlighted={summary.grossProfit < 0 && !summary.hasMissingCost}
            />
            <CostRow
              label="Margem Bruta"
              value={
                <span className={marginDisplay.textClass}>
                  {marginDisplay.label}
                </span>
              }
            />
            <CostRow
              label="Dias em Estoque"
              value={`${summary.daysInStock} dias`}
            />
            {summary.profitPerDay !== null && (
              <CostRow
                label="Lucro por Dia"
                value={
                  <span className={summary.profitPerDay >= 0 ? 'text-success' : 'text-danger'}>
                    {formatCurrency(summary.profitPerDay)}/dia
                  </span>
                }
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Pricing Intelligence ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <button
            onClick={() => setShowPricing(s => !s)}
            className="flex items-center justify-between w-full text-left"
            aria-expanded={showPricing}
          >
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              Sugestão de Preço
            </CardTitle>
            {showPricing
              ? <ChevronUp className="w-4 h-4 text-foreground-muted" />
              : <ChevronDown className="w-4 h-4 text-foreground-muted" />}
          </button>
        </CardHeader>
        {showPricing && (
          <CardContent>
            <PricingSuggestion
              vehicleId={vehicle.id}
              brand={vehicle.brand}
              model={vehicle.model}
            />
          </CardContent>
        )}
      </Card>

      {/* ── Section 4: Expense Breakdown ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <button
            onClick={() => setShowExpenses(s => !s)}
            className="flex items-center justify-between w-full text-left"
            aria-expanded={showExpenses}
          >
            <CardTitle className="text-sm font-semibold text-foreground">
              Detalhamento de Despesas
              {vehicle.expenses.length > 0 && (
                <span className="ml-2 text-xs font-normal text-foreground-muted">
                  {vehicle.expenses.length} item{vehicle.expenses.length !== 1 ? 's' : ''}
                </span>
              )}
            </CardTitle>
            {showExpenses
              ? <ChevronUp className="w-4 h-4 text-foreground-muted" />
              : <ChevronDown className="w-4 h-4 text-foreground-muted" />}
          </button>
        </CardHeader>

        {showExpenses && (
          <CardContent className="space-y-5">
            {chartData.length === 0 ? (
              <p className="text-sm text-foreground-muted text-center py-4">
                Nenhuma despesa registrada
              </p>
            ) : (
              <>
                {/* Horizontal bar chart */}
                <div aria-label="Despesas por categoria">
                  <ResponsiveContainer width="100%" height={Math.max(80, chartData.length * 36)}>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      barSize={20}
                      margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fontSize: 9, fill: '#8B9EB3' }}
                        tickFormatter={v => formatCurrency(v as number)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="category"
                        tick={{ fontSize: 9, fill: '#8B9EB3' }}
                        width={160}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RTooltip
                        contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 8, fontSize: 11, color: '#FFFFFF', fontWeight: 700 }}
                        formatter={(value: number) => [formatCurrency(value), 'Valor']}
                      />
                      <Bar dataKey="amount" radius={[0, 3, 3, 0]}>
                        {chartData.map(entry => (
                          <Cell
                            key={entry.category}
                            fill={CATEGORY_COLORS[entry.category] ?? DEFAULT_CATEGORY_COLOR}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Expense table */}
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-3 py-2 text-xs text-foreground-muted font-medium">Data</th>
                        <th className="text-left px-3 py-2 text-xs text-foreground-muted font-medium">Categoria</th>
                        <th className="text-left px-3 py-2 text-xs text-foreground-muted font-medium hidden sm:table-cell">Descrição</th>
                        <th className="text-right px-3 py-2 text-xs text-foreground-muted font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicle.expenses
                        .slice()
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(e => (
                          <tr key={e.id} className="border-b border-border last:border-0 hover:bg-background-elevated/40">
                            <td className="px-3 py-2 text-xs text-foreground-muted font-mono">
                              {formatDate(e.date)}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="secondary" className="text-xs font-normal">
                                {e.category}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-foreground-muted hidden sm:table-cell">
                              {e.description || '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-warning text-xs">
                              {formatCurrency(e.amount)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-foreground-muted">
                          Total
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-warning text-sm">
                          {formatCurrency(summary.totalExpenses)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

            <Button variant="outline" size="sm" onClick={onEditCosts} className="gap-1.5 text-xs w-full">
              <span>+ Adicionar Despesa</span>
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ── Section 5: Data Quality ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <button
            onClick={() => setShowQuality(s => !s)}
            className="flex items-center justify-between w-full text-left"
            aria-expanded={showQuality}
          >
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              Qualidade dos Dados
              <DataQualityPill score={summary.dataQuality.score} level={summary.dataQuality.level} />
            </CardTitle>
            {showQuality
              ? <ChevronUp className="w-4 h-4 text-foreground-muted" />
              : <ChevronDown className="w-4 h-4 text-foreground-muted" />}
          </button>
        </CardHeader>

        {showQuality && (
          <CardContent className="space-y-4">
            {/* Score gauge */}
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#1E2A3A" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14" fill="none"
                    stroke={summary.dataQuality.level === 'complete' ? '#22C55E' :
                            summary.dataQuality.level === 'partial' ? '#EAB308' : '#EF4444'}
                    strokeWidth="3"
                    strokeDasharray={`${(summary.dataQuality.score / 100) * 87.96} 87.96`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
                  {summary.dataQuality.score}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {summary.dataQuality.level === 'complete' ? '✅ Completo' :
                   summary.dataQuality.level === 'partial' ? '🟡 Parcial' : '🔴 Incompleto'}
                </p>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Pontuação de qualidade dos dados
                </p>
              </div>
            </div>

            {summary.dataQuality.issues.length === 0 ? (
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Todos os dados estão preenchidos corretamente
              </div>
            ) : (
              <div className="space-y-2">
                {summary.dataQuality.issues.map(issue => (
                  <div key={issue.field} className="flex items-start gap-2 text-sm">
                    <AlertCircle
                      className={cn('w-4 h-4 flex-shrink-0 mt-0.5',
                        issue.severity === 'error' ? 'text-danger' : 'text-warning')}
                    />
                    <div>
                      <p className={cn('text-xs font-medium',
                        issue.severity === 'error' ? 'text-danger' : 'text-warning'
                      )}>
                        {issue.message}
                      </p>
                      <p className="text-xs text-foreground-subtle">
                        -{issue.deduction} pts · Campo: {issue.field}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {summary.dataQuality.issues.length > 0 && (
              <Button variant="outline" size="sm" onClick={onEditCosts} className="gap-1.5 text-xs">
                Corrigir Problemas
              </Button>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CostRowProps {
  label: string
  value: React.ReactNode
  bold?: boolean
  highlighted?: boolean
}

function CostRow({ label, value, bold, highlighted }: CostRowProps) {
  return (
    <div className={cn(
      'flex items-center justify-between py-2.5 px-0',
      highlighted && 'bg-danger/10 rounded-lg px-2 -mx-2'
    )}>
      <span className={cn('text-sm text-foreground-muted', bold && 'font-semibold text-foreground')}>
        {label}
      </span>
      <span className={cn('text-sm font-mono', bold && 'font-bold text-foreground')}>
        {value}
      </span>
    </div>
  )
}

function DataQualityPill({ score, level }: { score: number; level: string }) {
  return (
    <span className={cn(
      'text-xs font-mono px-1.5 py-0.5 rounded-md',
      level === 'complete' ? 'bg-success/20 text-success' :
      level === 'partial'  ? 'bg-warning/20 text-warning' :
                             'bg-danger/20 text-danger'
    )}>
      {score}/100
    </span>
  )
}

// ─── Dialog Wrapper ───────────────────────────────────────────────────────────

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface VehicleCostPanelDialogProps {
  vehicle: VehicleForCost | null
  open: boolean
  onClose: () => void
  onEditCosts: (vehicleId: string) => void
}

export function VehicleCostPanelDialog({
  vehicle, open, onClose, onEditCosts,
}: VehicleCostPanelDialogProps) {
  if (!vehicle) return null

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-background-paper border border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {vehicle.brand} {vehicle.model}
            {vehicle.plate && (
              <span className="text-foreground-muted font-normal ml-2 text-sm">{vehicle.plate}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <VehicleCostPanel
          vehicle={vehicle}
          onEditCosts={() => onEditCosts(vehicle.id)}
        />
      </DialogContent>
    </Dialog>
  )
}
