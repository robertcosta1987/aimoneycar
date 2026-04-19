/**
 * components/cost/FleetCostAnalysis.tsx
 *
 * Full fleet-wide cost analysis report page component.
 *
 * Sections:
 *  1. KPI Cards row (5 cards)
 *  2. Charts grid:
 *     - Expense by Category (donut)
 *     - Margin Distribution histogram
 *     - True Cost vs Sale Price (bar chart, sold vehicles)
 *     - Top 5 Most Expensive to Hold
 *  3. Sortable, filterable vehicle table with CSV export
 *
 * Inputs:
 *   vehicles  – VehicleForCost[] with expenses loaded (all statuses)
 *   onEditCosts(vehicleId) – opens CostEditModal
 */

'use client'
import { useState, useMemo, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts'
import {
  ArrowUpDown, Download, Search, Filter, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { buildCostSummary, checkMarginAlerts } from '@/utils/vehicleCost'
import { formatCurrency, formatPercent } from '@/lib/utils'
import {
  CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, getMarginDisplay,
} from '@/types/cost'
import type { VehicleForCost, VehicleCostSummary, MarginBracket } from '@/types/cost'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey =
  | 'name' | 'status' | 'purchase_price' | 'total_expenses'
  | 'true_cost' | 'sale_price' | 'gross_profit' | 'gross_margin' | 'quality'
type SortDir = 'asc' | 'desc'

interface RowData {
  vehicle: VehicleForCost
  summary: VehicleCostSummary
  alertCount: number
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FleetCostAnalysisProps {
  vehicles: VehicleForCost[]
}

export function FleetCostAnalysis({ vehicles }: FleetCostAnalysisProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [marginFilter, setMarginFilter] = useState<string>('all')
  const [qualityFilter, setQualityFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('gross_margin')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // ── Pre-compute all summaries ──────────────────────────────────────────────
  const rows: RowData[] = useMemo(
    () =>
      vehicles.map(v => {
        const summary = buildCostSummary(v)
        const alertCount = checkMarginAlerts(summary).length
        return { vehicle: v, summary, alertCount }
      }),
    [vehicles]
  )

  // ── Fleet-level KPIs ───────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalAcquisition = rows.reduce((s, r) => s + r.summary.purchasePrice, 0)
    const totalExpenses = rows.reduce((s, r) => s + r.summary.totalExpenses, 0)
    const totalTrueCost = rows.reduce((s, r) => s + r.summary.trueCost, 0)

    const soldValid = rows.filter(
      r => r.vehicle.status === 'sold' && !r.summary.hasMissingCost && r.summary.salePrice > 0
    )
    const avgMargin =
      soldValid.length > 0
        ? soldValid.reduce((s, r) => s + r.summary.grossMargin, 0) / soldValid.length
        : null

    const missingCount = rows.filter(r => r.summary.hasMissingCost).length
    const missingPct = rows.length > 0 ? (missingCount / rows.length) * 100 : 0

    return { totalAcquisition, totalExpenses, totalTrueCost, avgMargin, missingCount, missingPct }
  }, [rows])

  // ── Chart data ─────────────────────────────────────────────────────────────
  const { categoryDonut, marginHistogram, costVsSale, top5Expensive } = useMemo(() => {
    // Category donut
    const catTotals: Record<string, number> = {}
    for (const { vehicle } of rows) {
      for (const e of vehicle.expenses) {
        catTotals[e.category] = (catTotals[e.category] ?? 0) + e.amount
      }
    }
    const categoryDonut = Object.entries(catTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // Margin histogram (buckets: <0, 0-5, 5-10, 10-15, 15-20, >20)
    const BUCKETS = [
      { label: '< 0%', min: -Infinity, max: 0 },
      { label: '0–5%', min: 0, max: 5 },
      { label: '5–10%', min: 5, max: 10 },
      { label: '10–15%', min: 10, max: 15 },
      { label: '15–20%', min: 15, max: 20 },
      { label: '> 20%', min: 20, max: Infinity },
    ]
    const marginHistogram = BUCKETS.map(b => ({
      label: b.label,
      count: rows.filter(r => {
        if (r.summary.hasMissingCost || r.summary.salePrice === 0) return false
        return r.summary.grossMargin >= b.min && r.summary.grossMargin < b.max
      }).length,
      color:
        b.max <= 0 ? '#EF4444' :
        b.max <= 15 ? '#EAB308' : '#22C55E',
    }))

    // True Cost vs Sale Price (sold vehicles with data)
    const costVsSale = rows
      .filter(r => r.vehicle.status === 'sold' && !r.summary.hasMissingCost && r.summary.salePrice > 0)
      .slice(-10) // last 10 sold
      .map(r => ({
        name: `${r.vehicle.brand} ${r.vehicle.model}`.slice(0, 14),
        trueCost: r.summary.trueCost,
        salePrice: r.summary.salePrice,
      }))

    // Top 5 most expensive to hold
    const top5Expensive = [...rows]
      .filter(r => r.vehicle.status === 'available')
      .sort((a, b) => b.summary.totalExpenses - a.summary.totalExpenses)
      .slice(0, 5)
      .map(r => ({
        name: `${r.vehicle.brand} ${r.vehicle.model}`.slice(0, 16),
        expenses: r.summary.totalExpenses,
      }))

    return { categoryDonut, marginHistogram, costVsSale, top5Expensive }
  }, [rows])

  // ── Filtered + sorted table rows ──────────────────────────────────────────
  const tableRows = useMemo(() => {
    let filtered = rows

    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(r =>
        `${r.vehicle.brand} ${r.vehicle.model}`.toLowerCase().includes(q) ||
        (r.vehicle.plate ?? '').toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.vehicle.status === statusFilter)
    }

    if (marginFilter !== 'all') {
      filtered = filtered.filter(r => {
        const d = getMarginDisplay(r.summary)
        return d.bracket === marginFilter
      })
    }

    if (qualityFilter !== 'all') {
      filtered = filtered.filter(r => r.summary.dataQuality.level === qualityFilter)
    }

    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'name':
          return dir * `${a.vehicle.brand} ${a.vehicle.model}`.localeCompare(
            `${b.vehicle.brand} ${b.vehicle.model}`
          )
        case 'status': return dir * a.vehicle.status.localeCompare(b.vehicle.status)
        case 'purchase_price': return dir * (a.summary.purchasePrice - b.summary.purchasePrice)
        case 'total_expenses': return dir * (a.summary.totalExpenses - b.summary.totalExpenses)
        case 'true_cost': return dir * (a.summary.trueCost - b.summary.trueCost)
        case 'sale_price': return dir * (a.summary.salePrice - b.summary.salePrice)
        case 'gross_profit': return dir * (a.summary.grossProfit - b.summary.grossProfit)
        case 'gross_margin': return dir * (a.summary.grossMargin - b.summary.grossMargin)
        case 'quality': return dir * (a.summary.dataQuality.score - b.summary.dataQuality.score)
        default: return 0
      }
    })
  }, [rows, search, statusFilter, marginFilter, qualityFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    const headers = [
      'Veículo', 'Placa', 'Status', 'Preço Compra', 'Despesas',
      'Custo Real', 'Preço Venda', 'Lucro Bruto', 'Margem %',
      'Qualidade', 'Alertas',
    ]
    const rowData = tableRows.map(r => [
      `${r.vehicle.brand} ${r.vehicle.model}`,
      r.vehicle.plate ?? '',
      r.vehicle.status,
      r.summary.purchasePrice,
      r.summary.totalExpenses,
      r.summary.trueCost,
      r.summary.salePrice,
      r.summary.grossProfit,
      r.summary.hasMissingCost ? 'N/A' : r.summary.grossMargin.toFixed(1) + '%',
      r.summary.dataQuality.level,
      r.alertCount,
    ])

    const csv = [headers, ...rowData]
      .map(row => row.map(c => `"${c}"`).join(';'))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analise-custos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [tableRows])

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── 1. KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Custo de Aquisição"
          value={formatCurrency(kpis.totalAcquisition)}
          sub="Total compras"
          color="text-primary"
        />
        <KpiCard
          label="Total Despesas"
          value={formatCurrency(kpis.totalExpenses)}
          sub="Todos os veículos"
          color="text-warning"
        />
        <KpiCard
          label="Custo Real Total"
          value={formatCurrency(kpis.totalTrueCost)}
          sub="Aquisição + despesas"
          color="text-secondary"
          bold
        />
        <KpiCard
          label="Margem Média"
          value={kpis.avgMargin === null ? '—' : formatPercent(kpis.avgMargin)}
          sub="Veículos vendidos"
          color={
            kpis.avgMargin === null ? 'text-foreground-muted' :
            kpis.avgMargin < 0 ? 'text-danger' :
            kpis.avgMargin < 5 ? 'text-warning' :
            kpis.avgMargin < 15 ? 'text-secondary' : 'text-success'
          }
        />
        <KpiCard
          label="Custo Ausente"
          value={`${kpis.missingCount} (${kpis.missingPct.toFixed(0)}%)`}
          sub="Veículos sem preço de compra"
          color={kpis.missingCount === 0 ? 'text-success' : 'text-danger'}
          warn={kpis.missingCount > 0}
        />
      </div>

      {/* ── 2. Charts grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Donut — expense by category */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Despesas por Categoria (Frota)</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryDonut.length === 0 ? (
              <p className="text-center text-foreground-muted text-sm py-8">Sem despesas</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={categoryDonut} cx="50%" cy="50%" innerRadius={40} outerRadius={72} dataKey="value" strokeWidth={0}>
                      {categoryDonut.map(entry => (
                        <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? DEFAULT_CATEGORY_COLOR} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 8, fontSize: 10, color: '#FFFFFF', fontWeight: 700 }}
                      formatter={(v: number) => [formatCurrency(v), '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1 min-w-0">
                  {categoryDonut.map(entry => (
                    <div key={entry.name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: CATEGORY_COLORS[entry.name] ?? DEFAULT_CATEGORY_COLOR }}
                        />
                        <span className="text-xs text-foreground-muted truncate">{entry.name}</span>
                      </div>
                      <span className="text-xs font-mono text-foreground flex-shrink-0">
                        {formatCurrency(entry.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histogram — margin distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Distribuição de Margens</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={marginHistogram} barSize={32} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#8B9EB3' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#8B9EB3' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 8, fontSize: 11, color: '#FFFFFF', fontWeight: 700 }}
                  formatter={(v: number) => [`${v} veículo${v !== 1 ? 's' : ''}`, '']}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {marginHistogram.map(b => <Cell key={b.label} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* True cost vs sale price (sold) */}
        {costVsSale.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Custo Real vs. Preço de Venda</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={costVsSale} barSize={20} margin={{ top: 4, right: 8, left: -16, bottom: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 8, fill: '#8B9EB3' }}
                    axisLine={false}
                    tickLine={false}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 8, fill: '#8B9EB3' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${(v as number / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 8, fontSize: 10, color: '#FFFFFF', fontWeight: 700 }}
                    formatter={(v: number, name: string) => [
                      formatCurrency(v),
                      name === 'trueCost' ? 'Custo Real' : 'Preço Venda',
                    ]}
                  />
                  <Legend
                    formatter={v => v === 'trueCost' ? 'Custo Real' : 'Preço Venda'}
                    wrapperStyle={{ fontSize: 10 }}
                  />
                  <Bar dataKey="trueCost" fill="#EF4444" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="salePrice" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top 5 most expensive to hold */}
        {top5Expensive.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Top 5 — Mais Caro de Manter</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={top5Expensive}
                  layout="vertical"
                  barSize={20}
                  margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 8, fill: '#8B9EB3' }}
                    tickFormatter={v => formatCurrency(v as number)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 9, fill: '#8B9EB3' }}
                    width={120}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ background: '#2563EB', border: 'none', borderRadius: 8, fontSize: 10, color: '#FFFFFF', fontWeight: 700 }}
                    formatter={(v: number) => [formatCurrency(v), 'Despesas']}
                  />
                  <Bar dataKey="expenses" fill="#FFB800" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── 3. Sortable table ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">
              Todos os Veículos — {tableRows.length} resultado{tableRows.length !== 1 ? 's' : ''}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-subtle" />
              <Input
                placeholder="Buscar marca, modelo, placa..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 text-xs h-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36 h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="returned">Devolvido</SelectItem>
                <SelectItem value="sold">Vendido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={marginFilter} onValueChange={setMarginFilter}>
              <SelectTrigger className="w-full sm:w-36 h-8 text-xs">
                <SelectValue placeholder="Margem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Margens</SelectItem>
                <SelectItem value="good">🟢 &gt; 15%</SelectItem>
                <SelectItem value="low">🟡 5–15%</SelectItem>
                <SelectItem value="very_low">🟡 0–5%</SelectItem>
                <SelectItem value="negative">🔴 Negativa</SelectItem>
                <SelectItem value="incomplete">⚫ Incompleto</SelectItem>
              </SelectContent>
            </Select>
            <Select value={qualityFilter} onValueChange={setQualityFilter}>
              <SelectTrigger className="w-full sm:w-36 h-8 text-xs">
                <SelectValue placeholder="Qualidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda Qualidade</SelectItem>
                <SelectItem value="complete">🟢 Completo</SelectItem>
                <SelectItem value="partial">🟡 Parcial</SelectItem>
                <SelectItem value="incomplete">🔴 Incompleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {tableRows.length === 0 ? (
            <p className="text-center text-foreground-muted text-sm py-12">
              Nenhum veículo encontrado com os filtros atuais
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {([
                      ['name', 'Veículo'],
                      ['status', 'Status'],
                      ['purchase_price', 'Compra'],
                      ['total_expenses', 'Despesas'],
                      ['true_cost', 'Custo Real'],
                      ['sale_price', 'Venda'],
                      ['gross_profit', 'Lucro'],
                      ['gross_margin', 'Margem'],
                      ['quality', 'Qualidade'],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th key={key} className="text-left px-4 py-3 text-xs text-foreground-muted font-medium whitespace-nowrap">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => toggleSort(key)}
                        >
                          {label}
                          <ArrowUpDown className={cn('w-3 h-3', sortKey === key && 'text-primary')} />
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(({ vehicle: v, summary: s, alertCount }) => {
                    const marginDisp = getMarginDisplay(s)
                    return (
                      <tr
                        key={v.id}
                        className={cn(
                          'border-b border-border last:border-0 hover:bg-background-elevated/50 transition-colors',
                          s.grossProfit < 0 && !s.hasMissingCost && s.salePrice > 0 && 'bg-danger/5'
                        )}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground text-sm">{v.brand} {v.model}</p>
                          {v.plate && <p className="text-xs text-foreground-muted">{v.plate}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={v.status} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {s.hasMissingCost
                            ? <span className="text-danger font-bold">R$ 0 ⚠️</span>
                            : formatCurrency(s.purchasePrice)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-warning">
                          {formatCurrency(s.totalExpenses)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                          {formatCurrency(s.trueCost)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {s.salePrice > 0 ? formatCurrency(s.salePrice) : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {s.hasMissingCost || s.salePrice === 0
                            ? <span className="text-foreground-muted">—</span>
                            : (
                              <span className={s.grossProfit >= 0 ? 'text-success font-semibold' : 'text-danger font-bold'}>
                                {formatCurrency(s.grossProfit)}
                              </span>
                            )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'text-xs font-mono font-semibold px-1.5 py-0.5 rounded',
                            marginDisp.textClass, marginDisp.bgClass
                          )}>
                            {marginDisp.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <QualityPill level={s.dataQuality.level} score={s.dataQuality.score} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {alertCount > 0 && (
                              <span title={`${alertCount} alerta${alertCount > 1 ? 's' : ''}`}>
                                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => v.external_id && window.open(`https://www.moneycarweb.com.br/VeiculoGeral.aspx?id=${v.external_id}`, '_blank')}
                              disabled={!v.external_id}
                              className="h-7 text-xs"
                            >
                              Editar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, bold, warn,
}: {
  label: string
  value: string
  sub: string
  color: string
  bold?: boolean
  warn?: boolean
}) {
  return (
    <Card className={warn ? 'border-danger/30' : ''}>
      <CardContent className="p-4">
        <p className="text-xs text-foreground-muted font-medium">{label}</p>
        <p className={cn('font-bold mt-1 font-mono', bold ? 'text-xl' : 'text-lg', color)}>
          {value}
        </p>
        <p className="text-xs text-foreground-subtle mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' | 'default' }> = {
    available: { label: 'Disponível', variant: 'success' },
    returned: { label: 'Devolvido', variant: 'warning' },
    sold: { label: 'Vendido', variant: 'secondary' },
    consigned: { label: 'Consignado', variant: 'default' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'default' }
  return <Badge variant={variant as any} className="text-xs">{label}</Badge>
}

function QualityPill({ level, score }: { level: string; score: number }) {
  return (
    <span className={cn(
      'text-xs font-mono px-1.5 py-0.5 rounded',
      level === 'complete' ? 'bg-success/20 text-success' :
      level === 'partial' ? 'bg-warning/20 text-warning' :
      'bg-danger/20 text-danger'
    )}>
      {level === 'complete' ? '🟢' : level === 'partial' ? '🟡' : '🔴'} {score}
    </span>
  )
}
