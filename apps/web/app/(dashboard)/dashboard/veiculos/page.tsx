'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search, Car, LayoutGrid, List, ArrowUpDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, cn } from '@/lib/utils'
import { AgingBadge } from '@/components/aging/AgingBadge'
import { useAgingThresholds } from '@/hooks/use-aging-thresholds'
import { MissingCostBanner } from '@/components/cost/MissingCostBanner'
import { CostBadge } from '@/components/cost/CostBadge'
import { VehicleCostPanelDialog } from '@/components/cost/VehicleCostPanel'
import { buildCostSummary } from '@/utils/vehicleCost'
import type { VehicleForCost } from '@/types/cost'
import type { Expense } from '@/types/index'

type ListSortKey = 'name' | 'plate' | 'purchase_price' | 'sale_price' | 'true_cost' | 'days_in_stock'

function openEdit(externalId: string | null | undefined) {
  if (externalId) window.open(`https://www.moneycarweb.com.br/VeiculoGeral.aspx?id=${externalId}`, '_blank')
}

export default function VeiculosPage() {
  const [vehicles, setVehicles] = useState<VehicleForCost[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('available')
  const [viewMode, setViewMode] = useState<'tiles' | 'list'>('tiles')
  const [sortKey, setSortKey] = useState<ListSortKey>('days_in_stock')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [panelVehicleId, setPanelVehicleId] = useState<string | null>(null)
  const supabase = createClient()
  const { thresholds } = useAgingThresholds()

  const panelVehicle = vehicles.find(v => v.id === panelVehicleId) ?? null

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.from('users').select('dealership_id').single()

      let query = supabase
        .from('vehicles')
        .select('*, expenses:expenses(id, dealership_id, vehicle_id, category, description, amount, date, vendor_name, payment_method, receipt_url, created_by, external_id, created_at, updated_at)')
        .eq('dealership_id', userData?.dealership_id)

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (search) {
        query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%,plate.ilike.%${search}%`)
      }

      const data = await fetchAll(query.order('days_in_stock', { ascending: false }))

      const enriched: VehicleForCost[] = data.map((v: any) => ({
        ...v,
        purchase_price: v.purchase_price ?? 0,
        sale_price: v.sale_price ?? null,
        days_in_stock: v.days_in_stock ?? 0,
        purchase_date: v.purchase_date ?? '',
        photos: v.photos ?? [],
        expenses: (v.expenses || []) as Expense[],
      }))

      setVehicles(enriched)
      setLoading(false)
    }
    load()
  }, [search, statusFilter])

  const sortedVehicles = useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'name': return dir * `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`)
        case 'plate': return dir * (a.plate || '').localeCompare(b.plate || '')
        case 'purchase_price': return dir * (a.purchase_price - b.purchase_price)
        case 'sale_price': return dir * ((a.sale_price ?? 0) - (b.sale_price ?? 0))
        case 'true_cost': return dir * (buildCostSummary(a).trueCost - buildCostSummary(b).trueCost)
        case 'days_in_stock': return dir * (a.days_in_stock - b.days_in_stock)
        default: return 0
      }
    })
  }, [vehicles, sortKey, sortDir])

  function toggleSort(key: ListSortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const stats = useMemo(() => ({
    total: vehicles.length,
    critical: vehicles.filter(v => v.days_in_stock > 90).length,
    avgDays: vehicles.length ? Math.round(vehicles.reduce((s, v) => s + v.days_in_stock, 0) / vehicles.length) : 0,
    totalValue: vehicles.reduce((s, v) => s + (v.sale_price ?? 0), 0),
  }), [vehicles])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visão Geral</h1>
          <p className="text-foreground-muted text-sm mt-1">
            {stats.total} veículos · {stats.critical} críticos · {stats.avgDays} dias médios
          </p>
        </div>
        {/* View toggle */}
        <div className="flex gap-1 bg-background-elevated rounded-lg p-1">
          <button
            onClick={() => setViewMode('tiles')}
            className={cn('p-1.5 rounded-md transition-all', viewMode === 'tiles' ? 'bg-background-paper text-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground')}
            title="Visualização em cards"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn('p-1.5 rounded-md transition-all', viewMode === 'list' ? 'bg-background-paper text-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground')}
            title="Visualização em lista"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Missing cost banner */}
      {!loading && (
        <MissingCostBanner
          vehicles={vehicles.map(v => ({
            id: v.id,
            brand: v.brand,
            model: v.model,
            plate: v.plate,
            purchase_price: v.purchase_price,
          }))}
          onFixVehicle={id => openEdit(vehicles.find(v => v.id === id)?.external_id)}
        />
      )}

      {/* Summary cards */}
      {vehicles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-primary">{stats.total}</p>
              <p className="text-xs text-foreground-muted mt-0.5">Em Estoque</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-warning">{stats.avgDays}d</p>
              <p className="text-xs text-foreground-muted mt-0.5">Média Estoque</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-danger">{stats.critical}</p>
              <p className="text-xs text-foreground-muted mt-0.5">Críticos +90d</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-success">{formatCurrency(stats.totalValue)}</p>
              <p className="text-xs text-foreground-muted mt-0.5">Valor Total</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" />
          <Input placeholder="Buscar marca, modelo, placa..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="available">Disponível</SelectItem>
            <SelectItem value="returned">Devolvido</SelectItem>
            <SelectItem value="sold">Vendido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Vehicle grid / list */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 rounded-2xl bg-background-elevated animate-pulse" />
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Car className="w-10 h-10 text-foreground-subtle mx-auto mb-3" />
            <p className="text-foreground-muted font-medium">Nenhum veículo encontrado</p>
            <p className="text-xs text-foreground-subtle mt-1">
              {statusFilter !== 'all' ? 'Tente mudar o filtro de status.' : 'Importe seus dados para visualizar veículos.'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'tiles' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehicles.map((v) => {
            const summary = buildCostSummary(v)

            return (
              <Card key={v.id} className="hover:border-border-hover transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <CardContent className="p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{v.brand} {v.model}</p>
                      <p className="text-xs text-foreground-muted">
                        {v.version ? `${v.version} · ` : ''}{v.year_model}/{v.year_fab}
                      </p>
                    </div>
                    <div className="ml-2 flex-shrink-0 flex flex-col items-end gap-1">
                      <AgingBadge
                        daysInStock={v.days_in_stock}
                        vehicle={{ id: v.id, purchase_price: v.purchase_price, sale_price: v.sale_price, totalExpenses: summary.totalExpenses }}
                        thresholds={thresholds}
                      />
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-3">
                    <div>
                      <p className="text-xs text-foreground-subtle">Placa</p>
                      <p className="font-medium text-foreground">{v.plate || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">KM</p>
                      <p className="font-medium text-foreground">{v.mileage?.toLocaleString('pt-BR') ?? '—'} km</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Compra</p>
                      <p className={`font-medium ${v.purchase_price === 0 ? 'text-danger' : 'text-foreground'}`}>
                        {v.purchase_price === 0 ? '⚠️ R$ 0' : formatCurrency(v.purchase_price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Venda</p>
                      <p className="font-medium text-foreground">{v.sale_price ? formatCurrency(v.sale_price) : '—'}</p>
                    </div>
                  </div>

                  {/* Cost row */}
                  <div className="py-2.5 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-foreground-subtle">Despesas</p>
                        <p className="text-sm font-medium text-warning">{formatCurrency(summary.totalExpenses)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-foreground-subtle">Custo Real</p>
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(summary.trueCost)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <CostBadge summary={summary} />
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => setPanelVehicleId(v.id)}
                        >
                          Custos
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => openEdit(v.external_id)}
                          disabled={!v.external_id}
                        >
                          Editar
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        /* List view */
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_130px] px-4 py-2 bg-background-elevated border-b border-border">
            {([
              ['name',           'Veículo'    ],
              ['plate',          'Placa / KM' ],
              ['purchase_price', 'Compra'     ],
              ['sale_price',     'Venda'      ],
              ['true_cost',      'Custo Real' ],
              ['days_in_stock',  'Estoque'    ],
            ] as [ListSortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => toggleSort(key)}
                className="flex items-center gap-1 text-xs font-semibold text-foreground-subtle uppercase tracking-wide hover:text-foreground transition-colors text-left"
              >
                {label}
                <ArrowUpDown className={cn('w-3 h-3 flex-shrink-0', sortKey === key && 'text-primary')} />
              </button>
            ))}
            <span />
          </div>
          {sortedVehicles.map((v) => {
            const summary = buildCostSummary(v)
            return (
              <div
                key={v.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_130px] px-4 py-3 items-center border-b border-border last:border-0 hover:bg-background-elevated transition-colors"
              >
                <div className="min-w-0 pr-2">
                  <p className="font-semibold text-sm text-foreground truncate">{v.brand} {v.model}</p>
                  <p className="text-xs text-foreground-muted">{v.version ? `${v.version} · ` : ''}{v.year_model}/{v.year_fab}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{v.plate || '—'}</p>
                  <p className="text-xs text-foreground-subtle">{v.mileage?.toLocaleString('pt-BR') ?? '—'} km</p>
                </div>
                <p className={cn('text-sm font-medium', v.purchase_price === 0 ? 'text-danger' : 'text-foreground')}>
                  {v.purchase_price === 0 ? '⚠️ R$ 0' : formatCurrency(v.purchase_price)}
                </p>
                <p className="text-sm font-medium text-foreground">{v.sale_price ? formatCurrency(v.sale_price) : '—'}</p>
                <div>
                  <p className="text-sm font-semibold text-foreground">{formatCurrency(summary.trueCost)}</p>
                  <CostBadge summary={summary} />
                </div>
                <AgingBadge
                  daysInStock={v.days_in_stock}
                  vehicle={{ id: v.id, purchase_price: v.purchase_price, sale_price: v.sale_price, totalExpenses: summary.totalExpenses }}
                  thresholds={thresholds}
                />
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setPanelVehicleId(v.id)}>
                    Custos
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => openEdit(v.external_id)} disabled={!v.external_id}>
                    Editar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <VehicleCostPanelDialog
        vehicle={panelVehicle}
        open={panelVehicleId !== null}
        onClose={() => setPanelVehicleId(null)}
      />
    </div>
  )
}
