import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import Link from 'next/link'
import {
  Car, TrendingUp, AlertTriangle, DollarSign, Clock,
  ArrowRight, ChevronRight, FileBarChart2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent, getStockStatusColor } from '@/lib/utils'
import { AgingWidget } from '@/components/aging/AgingWidget'
import { AgingNotifications } from '@/components/aging/AgingNotifications'
import { CostHealthWidget } from '@/components/cost/CostHealthWidget'
import type { VehicleForCost } from '@/types/cost'
import type { Expense } from '@/types/index'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('dealership_id')
    .eq('id', user.id)
    .single()

  const dealId = userData?.dealership_id

  const [
    { data: statsData },
    { data: vehicles },
    { data: alerts },
    { data: sales },
    costRaw,
  ] = await Promise.all([
    supabase.rpc('get_dashboard_stats', { d_id: dealId }),
    supabase.from('vehicles').select('id, brand, model, plate, sale_price, purchase_price, days_in_stock, status')
      .eq('dealership_id', dealId).eq('status', 'available')
      .order('days_in_stock', { ascending: false }).limit(10),
    supabase.from('ai_alerts').select('*')
      .eq('dealership_id', dealId).eq('is_dismissed', false).eq('is_read', false)
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('vehicles').select('id, brand, model, plate, purchase_price, sale_price, sale_date, expenses:expenses(amount)')
      .eq('dealership_id', dealId)
      .eq('status', 'sold')
      .order('sale_date', { ascending: false }).limit(5),
    // Lightweight fleet data for CostHealthWidget — paginated to bypass 1000-row cap
    fetchAll(supabase.from('vehicles')
      .select('id, status, purchase_price, sale_price, days_in_stock, purchase_date, sale_date, brand, model, plate, chassis, renavam, version, year_fab, year_model, color, mileage, fuel, transmission, fipe_price, min_price, supplier_name, customer_id, photos, notes, source, external_id, created_at, updated_at, dealership_id, expenses:expenses(id, dealership_id, vehicle_id, category, description, amount, date, vendor_name, payment_method, receipt_url, created_by, external_id, created_at, updated_at)')
      .eq('dealership_id', dealId)),
  ])

  const stats = statsData as any || {}

  const statCards = [
    {
      label: 'Veículos Disponíveis',
      value: stats.available_vehicles || 0,
      icon: Car,
      color: 'text-primary',
      bg: 'bg-primary/10',
      sub: `${stats.critical_vehicles || 0} críticos`,
      subColor: 'text-danger',
    },
    {
      label: 'Dias Médios em Estoque',
      value: Math.round(stats.avg_days_in_stock || 0),
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning/10',
      sub: 'Meta: 30 dias',
      subColor: 'text-foreground-muted',
    },
    {
      label: 'Vendas (30 dias)',
      value: stats.monthly_sales || 0,
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10',
      sub: formatCurrency(stats.monthly_revenue || 0),
      subColor: 'text-foreground-muted',
    },
    {
      label: 'Lucro (30 dias)',
      value: formatCurrency(stats.monthly_profit || 0),
      icon: DollarSign,
      color: 'text-secondary',
      bg: 'bg-secondary/10',
      sub: 'Resultado líquido',
      subColor: 'text-foreground-muted',
    },
  ]

  const alertColors: Record<string, string> = {
    critical: 'text-danger',
    warning: 'text-warning',
    info: 'text-primary',
    success: 'text-success',
  }
  const alertBg: Record<string, string> = {
    critical: 'bg-danger/10 border-danger/20',
    warning: 'bg-warning/10 border-warning/20',
    info: 'bg-primary/10 border-primary/20',
    success: 'bg-success/10 border-success/20',
  }

  const agingWidgetVehicles = (vehicles || []).map((v: any) => ({
    id: v.id,
    days_in_stock: v.days_in_stock ?? 0,
    sale_price: v.sale_price ?? null,
  }))

  const costVehicles: VehicleForCost[] = costRaw.map((v: any) => ({
    ...v,
    purchase_price: v.purchase_price ?? 0,
    sale_price: v.sale_price ?? null,
    days_in_stock: v.days_in_stock ?? 0,
    purchase_date: v.purchase_date ?? '',
    photos: v.photos ?? [],
    expenses: (v.expenses || []) as Expense[],
  }))

  return (
    <div className="space-y-6">
      <AgingNotifications vehicles={(vehicles || []).map((v: any) => ({ id: v.id, days_in_stock: v.days_in_stock ?? 0 }))} />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-foreground-muted text-sm mt-1">Visão geral da sua revenda</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="hover:border-border-hover transition-colors">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-foreground-muted font-medium">{s.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
                  <p className={`text-xs mt-1 ${s.subColor}`}>{s.sub}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Aging Widget */}
      <AgingWidget vehicles={agingWidgetVehicles} />

      {/* Cost Health Widget */}
      {costVehicles.length > 0 && (
        <CostHealthWidget vehicles={costVehicles} />
      )}

      {/* Executive Report CTA */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <FileBarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Relatório Executivo</p>
            <p className="text-xs text-foreground-muted">Análise completa: financeiro, vendas, estoque e alertas</p>
          </div>
        </div>
        <Link href="/dashboard/relatorios-executivos">
          <Button size="sm" className="gap-2 flex-shrink-0">
            <FileBarChart2 className="w-4 h-4" />
            <span className="hidden sm:inline">Ver Relatórios</span>
            <ChevronRight className="w-4 h-4 sm:hidden" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Alertas IA
              </CardTitle>
              <Link href="/dashboard/alertas">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  Ver todos <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!alerts || alerts.length === 0 ? (
              <div className="text-center py-6 text-foreground-muted text-sm">
                ✅ Nenhum alerta pendente
              </div>
            ) : (
              alerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl border text-sm ${alertBg[alert.type] || alertBg.info}`}
                >
                  <p className={`font-medium text-xs ${alertColors[alert.type]}`}>{alert.title}</p>
                  <p className="text-foreground-muted text-xs mt-1 line-clamp-2">{alert.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Vehicles in stock */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="w-4 h-4 text-primary" />
                Veículos em Estoque
              </CardTitle>
              <Link href="/dashboard/veiculos">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  Ver todos <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {!vehicles || vehicles.length === 0 ? (
                <p className="text-center py-6 text-foreground-muted text-sm">Nenhum veículo disponível</p>
              ) : (
                vehicles.slice(0, 6).map((v) => {
                  const statusColor = getStockStatusColor(v.days_in_stock)
                  const badgeVar = statusColor === 'success' ? 'success' : statusColor === 'warning' ? 'warning' : 'destructive'
                  return (
                    <div key={v.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{v.brand} {v.model}</p>
                        <p className="text-xs text-foreground-muted">{v.plate}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(v.sale_price || 0)}</span>
                        <Badge variant={badgeVar as any} className="text-xs">
                          {v.days_in_stock}d
                        </Badge>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent sales */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-success" />
            Últimas Vendas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!sales || sales.length === 0 ? (
            <p className="text-center py-6 text-foreground-muted text-sm">Nenhuma venda registrada</p>
          ) : (
            <div className="space-y-3">
              {(sales as any[]).map((v) => {
                const totalExp = (v.expenses || []).reduce((s: number, e: any) => s + e.amount, 0)
                const profit = (v.sale_price || 0) - v.purchase_price - totalExp
                return (
                  <div key={v.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{v.brand} {v.model}</p>
                      <p className="text-xs text-foreground-muted">{v.plate || '—'} · {v.sale_date ? new Date(v.sale_date).toLocaleDateString('pt-BR') : '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(v.sale_price || 0)}</p>
                      {profit > 0 && (
                        <p className="text-xs text-success">+{formatCurrency(profit)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
