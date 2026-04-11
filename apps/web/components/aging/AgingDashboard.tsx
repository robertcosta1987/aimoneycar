/**
 * components/aging/AgingDashboard.tsx
 * Main feature panel for the Inventory Aging Alert System.
 * Header KPIs + filterable/sortable vehicle table with expandable suggestion rows.
 */

'use client'
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgingBadge } from '@/components/aging/AgingBadge'
import { generateSuggestions, getAgingStatus } from '@/lib/aging'
import { formatCurrency } from '@/lib/utils'
import { useAgingThresholds } from '@/hooks/use-aging-thresholds'
import type { AgingVehicle } from '@/types/aging'

type Filter = 'all' | 'ok' | 'attention' | 'critical'
type SortKey = 'days_in_stock' | 'sale_price' | 'brand'
type SortDir = 'asc' | 'desc'

interface AgingDashboardProps {
  vehicles: AgingVehicle[]
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'text-danger',
  high: 'text-warning',
  medium: 'text-primary',
  low: 'text-foreground-muted',
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '🚨 Urgente',
  high: '⚠️ Alta',
  medium: '📌 Média',
  low: '💡 Baixa',
}

export function AgingDashboard({ vehicles }: AgingDashboardProps) {
  const { thresholds, loaded } = useAgingThresholds()
  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('days_in_stock')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const stats = useMemo(() => {
    if (!loaded) return { total: 0, attention: 0, critical: 0, atRisk: 0 }
    const attention = vehicles.filter(v => getAgingStatus(v.days_in_stock, thresholds).level === 'attention')
    const critical = vehicles.filter(v => getAgingStatus(v.days_in_stock, thresholds).level === 'critical')
    const atRisk = [...attention, ...critical].reduce((s, v) => s + (v.sale_price ?? 0), 0)
    return { total: vehicles.length, attention: attention.length, critical: critical.length, atRisk }
  }, [vehicles, thresholds, loaded])

  const filtered = useMemo(() => {
    if (!loaded) return []
    let list = vehicles
    if (filter !== 'all') {
      list = list.filter(v => getAgingStatus(v.days_in_stock, thresholds).level === filter)
    }
    return [...list].sort((a, b) => {
      let aVal: number | string = a[sortKey] ?? 0
      let bVal: number | string = b[sortKey] ?? 0
      if (sortKey === 'brand') {
        aVal = `${a.brand} ${a.model}`.toLowerCase()
        bVal = `${b.brand} ${b.model}`.toLowerCase()
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [vehicles, filter, sortKey, sortDir, thresholds, loaded])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  if (!loaded) return null

  const kpiCards = [
    {
      label: 'Total em Estoque',
      value: stats.total,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Atenção',
      value: stats.attention,
      color: 'text-warning',
      bg: 'bg-warning/10',
      sub: `≥ ${thresholds.attention}d`,
    },
    {
      label: 'Críticos',
      value: stats.critical,
      color: 'text-danger',
      bg: 'bg-danger/10',
      sub: `≥ ${thresholds.critical}d`,
    },
    {
      label: 'Receita em Risco',
      value: formatCurrency(stats.atRisk),
      color: 'text-secondary',
      bg: 'bg-secondary/10',
      sub: 'Atenção + Crítico',
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-foreground-muted font-medium">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
              {k.sub && <p className="text-xs text-foreground-subtle mt-0.5">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'ok', 'attention', 'critical'] as Filter[]).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setFilter(f)}
          >
            {f === 'all' && `Todos (${stats.total})`}
            {f === 'ok' && `🟢 OK (${stats.total - stats.attention - stats.critical})`}
            {f === 'attention' && `⚠️ Atenção (${stats.attention})`}
            {f === 'critical' && `🔴 Críticos (${stats.critical})`}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} veículo{filtered.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-foreground-muted text-sm">Nenhum veículo encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs text-foreground-muted font-medium">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => toggleSort('brand')}
                      >
                        Veículo <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-foreground-muted font-medium hidden sm:table-cell">
                      Ano
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-foreground-muted font-medium">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => toggleSort('days_in_stock')}
                      >
                        Dias <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-foreground-muted font-medium hidden md:table-cell">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => toggleSort('sale_price')}
                      >
                        Preço <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-foreground-muted font-medium hidden lg:table-cell">
                      Sugestões
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => {
                    const suggestions = generateSuggestions(
                      { id: v.id, purchase_price: v.purchase_price, sale_price: v.sale_price, totalExpenses: v.totalExpenses },
                      v.days_in_stock
                    )
                    const isOpen = expandedId === v.id

                    return (
                      <>
                        <tr
                          key={v.id}
                          className="border-b border-border last:border-0 hover:bg-background-elevated/50 transition-colors cursor-pointer"
                          onClick={() => suggestions.length > 0 && toggleExpand(v.id)}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{v.brand} {v.model}</p>
                            <p className="text-xs text-foreground-muted">{v.plate || '—'}</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-foreground-muted">
                            {v.year_model}
                          </td>
                          <td className="px-4 py-3">
                            <AgingBadge
                              daysInStock={v.days_in_stock}
                              vehicle={{ id: v.id, purchase_price: v.purchase_price, sale_price: v.sale_price, totalExpenses: v.totalExpenses }}
                              thresholds={thresholds}
                              showTooltip={false}
                            />
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-foreground">
                            {v.sale_price ? formatCurrency(v.sale_price) : '—'}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {suggestions.length > 0 ? (
                              <Badge variant="outline" className="text-xs">
                                {suggestions.length} ação{suggestions.length !== 1 ? 'ões' : ''}
                              </Badge>
                            ) : (
                              <span className="text-xs text-foreground-subtle">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {suggestions.length > 0 && (
                              <button className="text-foreground-muted hover:text-foreground transition-colors p-1">
                                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${v.id}-expanded`} className="bg-background-elevated/30">
                            <td colSpan={6} className="px-4 py-4">
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-foreground-muted mb-3">
                                  Sugestões para {v.brand} {v.model} — {v.days_in_stock} dias em estoque
                                </p>
                                {suggestions.map(s => (
                                  <div
                                    key={s.id}
                                    className="flex items-start justify-between gap-3 p-3 rounded-xl bg-background-paper border border-border"
                                  >
                                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                      <span className="text-base flex-shrink-0 mt-0.5">{s.icon}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground">{s.text}</p>
                                        <p className={`text-xs mt-1 font-medium ${PRIORITY_COLORS[s.priority]}`}>
                                          {PRIORITY_LABELS[s.priority]}
                                        </p>
                                      </div>
                                    </div>
                                    {s.actionLabel && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs flex-shrink-0"
                                      >
                                        {s.actionLabel}
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
