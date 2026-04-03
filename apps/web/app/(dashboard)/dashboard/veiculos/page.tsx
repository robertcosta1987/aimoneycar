'use client'
import { useState, useEffect } from 'react'
import { Search, Filter, Car, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, getStockStatusColor, getStockStatusLabel } from '@/lib/utils'

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
    avgDays: vehicles.length ? Math.round(vehicles.reduce((s, v) => s + v.days_in_stock, 0) / vehicles.length) : 0,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Veículos</h1>
          <p className="text-foreground-muted text-sm mt-1">{stats.total} veículos · {stats.critical} críticos · {stats.avgDays} dias médios</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar
        </Button>
      </div>

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
            <div key={i} className="h-48 rounded-2xl bg-background-elevated animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehicles.map((v) => {
            const statusColor = getStockStatusColor(v.days_in_stock)
            const badgeVar = statusColor === 'success' ? 'success' : statusColor === 'warning' ? 'warning' : 'destructive'
            const marginColor = v.margin > 0 ? 'text-success' : 'text-danger'

            return (
              <Card key={v.id} className="hover:border-border-hover transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-foreground">{v.brand} {v.model}</p>
                      <p className="text-xs text-foreground-muted">{v.version} · {v.year_model}/{v.year_fab}</p>
                    </div>
                    <Badge variant={badgeVar as any}>
                      {v.days_in_stock}d
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-foreground-subtle">Placa</p>
                      <p className="font-medium text-foreground">{v.plate || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">KM</p>
                      <p className="font-medium text-foreground">{v.mileage?.toLocaleString('pt-BR')} km</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Compra</p>
                      <p className="font-medium text-foreground">{formatCurrency(v.purchase_price)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Venda</p>
                      <p className="font-medium text-foreground">{formatCurrency(v.sale_price || 0)}</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <div>
                      <p className="text-xs text-foreground-subtle">Despesas</p>
                      <p className="text-sm font-medium text-warning">{formatCurrency(v.totalExpenses)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-foreground-subtle">Margem</p>
                      <p className={`text-sm font-semibold ${marginColor}`}>{formatCurrency(v.margin)}</p>
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
