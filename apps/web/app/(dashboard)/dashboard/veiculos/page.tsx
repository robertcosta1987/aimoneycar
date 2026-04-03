'use client'
import { useState, useEffect } from 'react'
import { Search, Car, Plus, AlertTriangle, Clock, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, getStockStatusColor } from '@/lib/utils'

export default function VeiculosPage() {
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('available')
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.from('users').select('dealership_id').single()

      let query = supabase
        .from('vehicles')
        .select('*, expenses:expenses(amount)')
        .eq('dealership_id', userData?.dealership_id)

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      if (search) {
        query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%,plate.ilike.%${search}%`)
      }

      const { data } = await query.order('days_in_stock', { ascending: false })

      const enriched = (data || []).map((v: any) => ({
        ...v,
        totalExpenses: (v.expenses || []).reduce((sum: number, e: any) => sum + e.amount, 0),
        margin: (v.sale_price || 0) - v.purchase_price - (v.expenses || []).reduce((sum: number, e: any) => sum + e.amount, 0),
      }))

      setVehicles(enriched)
      setLoading(false)
    }
    load()
  }, [search, statusFilter])

  const stats = {
    total: vehicles.length,
    critical: vehicles.filter(v => v.days_in_stock > 60).length,
    warning: vehicles.filter(v => v.days_in_stock > 30 && v.days_in_stock <= 60).length,
    avgDays: vehicles.length ? Math.round(vehicles.reduce((s, v) => s + v.days_in_stock, 0) / vehicles.length) : 0,
    totalValue: vehicles.reduce((s, v) => s + (v.sale_price || 0), 0),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Veículos</h1>
          <p className="text-foreground-muted text-sm mt-1">
            {stats.total} veículos · {stats.critical} críticos · {stats.avgDays} dias médios
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar
        </Button>
      </div>

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
              <p className="text-xs text-foreground-muted mt-0.5">Críticos +60d</p>
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
            <SelectItem value="reserved">Reservado</SelectItem>
            <SelectItem value="sold">Vendido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Vehicle grid */}
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
              {statusFilter !== 'all' ? 'Tente mudar o filtro de status.' : 'Importe seus dados ou adicione um veículo.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehicles.map((v) => {
            const statusColor = getStockStatusColor(v.days_in_stock)
            const badgeVar = statusColor === 'success' ? 'success' : statusColor === 'warning' ? 'warning' : 'destructive'
            const marginColor = v.margin > 0 ? 'text-success' : v.margin < 0 ? 'text-danger' : 'text-foreground-muted'
            const stockIcon = v.days_in_stock > 60 ? AlertTriangle : v.days_in_stock > 30 ? Clock : TrendingUp

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
                    <Badge variant={badgeVar as any} className="ml-2 flex-shrink-0 gap-1">
                      {v.days_in_stock}d
                    </Badge>
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
                      <p className="text-xs text-foreground-subtle">Cor</p>
                      <p className="font-medium text-foreground">{v.color || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Combustível</p>
                      <p className="font-medium text-foreground">{v.fuel || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Compra</p>
                      <p className="font-medium text-foreground">{formatCurrency(v.purchase_price)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Venda</p>
                      <p className="font-medium text-foreground">{v.sale_price ? formatCurrency(v.sale_price) : '—'}</p>
                    </div>
                  </div>

                  {/* Bottom row */}
                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <div>
                      <p className="text-xs text-foreground-subtle">Despesas</p>
                      <p className="text-sm font-medium text-warning">{formatCurrency(v.totalExpenses)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-foreground-subtle">Margem</p>
                      <p className={`text-sm font-semibold ${marginColor}`}>
                        {v.sale_price ? formatCurrency(v.margin) : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
