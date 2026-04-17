'use client'
import { useState, useEffect, useRef } from 'react'
import { BarChart3, TrendingUp, DollarSign, Car, Receipt, Calendar, CalendarClock, ChevronLeft, Sparkles, Bell, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

type Mode = 'rolling' | 'month'
interface AvailableMonth { value: string; label: string; salesCount: number }

export default function RelatoriosPage() {
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiResult, setAiResult]         = useState<{ ok: boolean; msg: string } | null>(null)
  const aiTriggered = useRef(false)

  const generateAlerts = async () => {
    setAiGenerating(true)
    setAiResult(null)
    try {
      const res  = await fetch('/api/alerts/generate', { method: 'POST' })
      const raw  = await res.text()
      let json: any = {}
      try { json = JSON.parse(raw) } catch {
        setAiResult({ ok: false, msg: `Erro do servidor (HTTP ${res.status}): ${raw.slice(0, 150)}` })
        return
      }
      if (json.error) {
        setAiResult({ ok: false, msg: json.error })
      } else if (json.generated > 0) {
        setAiResult({ ok: true, msg: `${json.generated} alertas gerados com sucesso.` })
      } else {
        setAiResult({ ok: true, msg: json.message ?? 'Nenhuma situação de alerta encontrada.' })
      }
    } catch (err: any) {
      setAiResult({ ok: false, msg: err?.message ?? 'Erro desconhecido' })
    } finally {
      setAiGenerating(false)
    }
  }

  const [mode, setMode]                   = useState<Mode>('rolling')
  const [period, setPeriod]               = useState('30')
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([])
  const [sales, setSales]       = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const supabase = createClient()

  // ── load available months once ──────────────────────────────────────────────
  useEffect(() => {
    const loadMonths = async () => {
      const { data: userData } = await supabase.from('users').select('dealership_id').single()
      const did = userData?.dealership_id
      if (!did) return

      const data = await fetchAll(supabase
        .from('vehicles')
        .select('sale_date')
        .eq('dealership_id', did)
        .eq('status', 'sold')
        .not('sale_date', 'is', null))

      if (!data.length) return

      const monthMap = new Map<string, number>()
      for (const v of data) {
        if (!v.sale_date) continue
        const d   = new Date(v.sale_date + 'T00:00:00')
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        monthMap.set(key, (monthMap.get(key) || 0) + 1)
      }

      // Fill last 24 calendar months even if empty
      const now = new Date()
      for (let i = 0; i < 24; i++) {
        const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        if (!monthMap.has(key)) monthMap.set(key, 0)
      }

      const months = Array.from(monthMap.entries())
        .map(([value, salesCount]) => {
          const d     = new Date(value + 'T00:00:00')
          const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
          return { value, label: label.charAt(0).toUpperCase() + label.slice(1), salesCount }
        })
        .sort((a, b) => b.value.localeCompare(a.value))

      setAvailableMonths(months)
      // pre-select most recent month with data, or latest calendar month
      const withData = months.find(m => m.salesCount > 0)
      setSelectedMonth(withData?.value ?? months[0]?.value ?? '')
    }
    loadMonths()
  }, [])

  // ── load report data ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.from('users').select('dealership_id').single()
      const did = userData?.dealership_id

      // compute date range
      let dateStart: string
      let dateEnd: string | null = null

      if (mode === 'month' && selectedMonth) {
        dateStart = selectedMonth
        const d = new Date(selectedMonth + 'T00:00:00')
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        dateEnd = `${selectedMonth.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
      } else {
        dateStart = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0]
      }

      let salesQ = supabase
        .from('vehicles')
        .select('id, brand, model, plate, year_fab, year_model, purchase_price, sale_price, purchase_date, sale_date, days_in_stock, expenses:expenses(amount)')
        .eq('dealership_id', did)
        .eq('status', 'sold')
        .gte('sale_date', dateStart)
        .order('sale_date', { ascending: true })
      if (dateEnd) salesQ = salesQ.lte('sale_date', dateEnd)

      let expQ = supabase
        .from('expenses')
        .select('category, amount, date')
        .eq('dealership_id', did)
        .gte('date', dateStart)
      if (dateEnd) expQ = expQ.lte('date', dateEnd)

      const [salesData, vehiclesData, expensesData] = await Promise.all([
        fetchAll(salesQ),
        fetchAll(supabase
          .from('vehicles')
          .select('id, brand, model, plate, year_fab, year_model, color, mileage, fuel, purchase_price, sale_price, days_in_stock, status, purchase_date')
          .eq('dealership_id', did)
          .neq('status', 'sold')
          .order('days_in_stock', { ascending: false })),
        fetchAll(expQ),
      ])

      setSales(salesData)
      setVehicles(vehiclesData)
      setExpenses(expensesData)
      setLoading(false)
    }
    if (mode === 'rolling' || (mode === 'month' && selectedMonth)) load()
  }, [mode, period, selectedMonth])

  // ── Vendas ───────────────────────────────────────────────────────────────────
  const salesEnriched = sales.map((v: any) => {
    const totalExp  = (v.expenses || []).reduce((s: number, e: any) => s + e.amount, 0)
    const profit    = (v.sale_price || 0) - v.purchase_price - totalExp
    const profitPct = v.sale_price > 0 ? (profit / v.sale_price) * 100 : 0
    return { ...v, totalExp, profit, profitPct }
  })

  const salesTotals = {
    revenue:   salesEnriched.reduce((s, x) => s + (x.sale_price || 0), 0),
    profit:    salesEnriched.reduce((s, x) => s + x.profit, 0),
    count:     salesEnriched.length,
    avgMargin: salesEnriched.length
      ? salesEnriched.reduce((s, x) => s + x.profitPct, 0) / salesEnriched.length
      : 0,
  }

  const salesByDay = salesEnriched.reduce((acc: Record<string, { revenue: number; profit: number }>, s) => {
    const day = s.sale_date?.slice(5) ?? ''
    if (!acc[day]) acc[day] = { revenue: 0, profit: 0 }
    acc[day].revenue += s.sale_price || 0
    acc[day].profit  += s.profit
    return acc
  }, {})
  const salesChartData = Object.entries(salesByDay).map(([day, d]) => ({ day, ...d }))

  // ── Estoque ──────────────────────────────────────────────────────────────────
  const available    = vehicles.filter(v => v.status === 'available')
  const stockBuckets = [
    { range: '0-15 dias',  count: available.filter(v => v.days_in_stock <= 15).length, color: '#00E676' },
    { range: '16-30 dias', count: available.filter(v => v.days_in_stock > 15 && v.days_in_stock <= 30).length, color: '#00D9FF' },
    { range: '31-60 dias', count: available.filter(v => v.days_in_stock > 30 && v.days_in_stock <= 60).length, color: '#FFB800' },
    { range: '+60 dias',   count: available.filter(v => v.days_in_stock > 60).length, color: '#FF5252' },
  ]
  const healthy  = available.filter(v => v.days_in_stock <= 30).length
  const warning  = available.filter(v => v.days_in_stock > 30 && v.days_in_stock <= 60).length
  const critical = available.filter(v => v.days_in_stock > 60).length
  const avgDays  = available.length
    ? Math.round(available.reduce((s, v) => s + v.days_in_stock, 0) / available.length)
    : 0

  // ── Despesas ─────────────────────────────────────────────────────────────────
  const expTotal      = expenses.reduce((s, e) => s + e.amount, 0)
  const expByCategory = Object.entries(
    expenses.reduce((acc: Record<string, { total: number; count: number }>, e) => {
      const cat = e.category || 'Outros'
      if (!acc[cat]) acc[cat] = { total: 0, count: 0 }
      acc[cat].total += e.amount
      acc[cat].count += 1
      return acc
    }, {})
  )
    .map(([cat, d]) => ({ cat, ...d, pct: expTotal > 0 ? Math.round((d.total / expTotal) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)

  const currentMonthLabel = availableMonths.find(m => m.value === selectedMonth)?.label ?? ''

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-background-elevated animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-24 bg-background-elevated animate-pulse rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ROI Report CTA */}
      <Link href="/dashboard/relatorios/roi-valor-agregado">
        <div className="flex items-center justify-between rounded-2xl bg-foreground text-background px-5 py-4 cursor-pointer hover:opacity-90 transition-opacity">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <p className="font-bold text-sm">ROI e Valor Agregado</p>
              <p className="text-xs text-white/60 mt-0.5">Relatório completo das funcionalidades com retorno estimado e impacto operacional</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-white/70 hidden sm:block">Ver relatório →</span>
        </div>
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-foreground-muted text-sm mt-1">
            {mode === 'month' && currentMonthLabel
              ? `Mês selecionado: ${currentMonthLabel}`
              : 'Análise de performance da revenda'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border">
            <button
              onClick={() => setMode('rolling')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'rolling'
                  ? 'bg-primary/20 text-primary'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              Período
            </button>
            <button
              onClick={() => setMode('month')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                mode === 'month'
                  ? 'bg-primary/20 text-primary'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Selecionar Mês
            </button>
          </div>

          {/* Rolling period selector */}
          {mode === 'rolling' && (
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="365">1 ano</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Month selector */}
          {mode === 'month' && availableMonths.length > 0 && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Selecione o mês" />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    <span className="flex items-center gap-2">
                      {m.label}
                      {m.salesCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                          {m.salesCount} venda{m.salesCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Link href="/dashboard/relatorios/agendar">
            <Button variant="outline" className="gap-2">
              <CalendarClock className="w-4 h-4" /> Agendar Envio
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Faturamento',         value: formatCurrency(salesTotals.revenue), icon: DollarSign, color: 'text-success' },
          { label: 'Lucro Líquido',        value: formatCurrency(salesTotals.profit), icon: TrendingUp, color: 'text-secondary' },
          { label: 'Veículos Vendidos',    value: salesTotals.count,                  icon: Car,        color: 'text-primary' },
          { label: 'Tempo Médio Estoque',  value: `${avgDays} dias`,                  icon: BarChart3,  color: 'text-warning' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-foreground-muted">{s.label}</p>
                  <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <s.icon className={`w-4 h-4 ${s.color} opacity-60 mt-1`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="estoque" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* ── VENDAS ── */}
        <TabsContent value="vendas" className="mt-6 space-y-6">
          {salesChartData.length > 0 ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Faturamento por Dia</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={salesChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8B9EB3' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#8B9EB3' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: '#111820', border: '1px solid #1E2A3A', borderRadius: 12 }}
                      formatter={(v: any) => formatCurrency(v)}
                    />
                    <Bar dataKey="revenue" fill="#00D9FF" name="Receita" radius={[4,4,0,0]} />
                    <Bar dataKey="profit"  fill="#00E676" name="Lucro"   radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-foreground-muted text-sm">
                Nenhuma venda registrada no período
                {mode === 'month' && availableMonths.some(m => m.salesCount > 0) && (
                  <p className="mt-2 text-xs">
                    Tente selecionar outro mês — há dados em outros períodos.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {salesEnriched.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Vendas do Período</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {salesEnriched.slice().reverse().map(sale => (
                    <div key={sale.id} className="flex items-center justify-between p-3 rounded-xl bg-background-elevated">
                      <div>
                        <p className="font-medium text-sm text-foreground">{sale.brand} {sale.model}</p>
                        <p className="text-xs text-foreground-muted">
                          {sale.plate || '—'} · {sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('pt-BR') : '—'} · {sale.days_in_stock}d em estoque
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm text-foreground">{formatCurrency(sale.sale_price)}</p>
                        {sale.profit > 0 && (
                          <p className="text-xs text-success">+{formatCurrency(sale.profit)} ({formatPercent(sale.profitPct)})</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── ESTOQUE ── */}
        <TabsContent value="estoque" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Distribuição por Tempo em Estoque</CardTitle></CardHeader>
            <CardContent>
              {available.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stockBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#8B9EB3' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#8B9EB3' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#111820', border: '1px solid #1E2A3A', borderRadius: 12 }}
                    />
                    <Bar dataKey="count" name="Veículos" radius={[4,4,0,0]}>
                      {stockBuckets.map((b, i) => (
                        <Cell key={i} fill={b.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-8 text-foreground-muted text-sm">Nenhum veículo disponível</p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <Card className="border-success/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-success">{healthy}</p>
                <p className="text-sm text-foreground-muted mt-1">Saudável</p>
                <p className="text-xs text-foreground-subtle">0–30 dias</p>
              </CardContent>
            </Card>
            <Card className="border-warning/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-warning">{warning}</p>
                <p className="text-sm text-foreground-muted mt-1">Atenção</p>
                <p className="text-xs text-foreground-subtle">31–60 dias</p>
              </CardContent>
            </Card>
            <Card className="border-danger/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-danger">{critical}</p>
                <p className="text-sm text-foreground-muted mt-1">Crítico</p>
                <p className="text-xs text-foreground-subtle">+60 dias</p>
              </CardContent>
            </Card>
          </div>

          {available.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Veículos com Maior Tempo em Estoque</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {available.slice(0, 8).map(v => {
                    const pct   = Math.min(100, Math.round((v.days_in_stock / 90) * 100))
                    const color = v.days_in_stock > 60 ? 'text-danger' : v.days_in_stock > 30 ? 'text-warning' : 'text-success'
                    return (
                      <div key={v.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-foreground">{v.brand} {v.model}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-foreground-muted">{v.plate || '—'}</span>
                            <span className={`font-semibold ${color}`}>{v.days_in_stock}d</span>
                          </div>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <p className="text-xs text-foreground-subtle">
                          {v.year_model}/{v.year_fab} · {v.color || '—'} · {formatCurrency(v.sale_price || 0)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── DESPESAS ── */}
        <TabsContent value="despesas" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" />Por Categoria</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {expByCategory.length > 0 ? expByCategory.map(({ cat, total, count, pct }) => (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-foreground">{cat}</span>
                      <span className="text-foreground-muted">{formatCurrency(total)} ({pct}%)</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <p className="text-xs text-foreground-subtle mt-0.5">{count} lançamento{count !== 1 ? 's' : ''}</p>
                  </div>
                )) : (
                  <p className="text-sm text-foreground-muted py-4 text-center">Sem despesas no período</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted">Total de Despesas</span>
                  <span className="font-bold text-danger">{formatCurrency(expTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted">Média por Veículo</span>
                  <span className="font-medium text-foreground">
                    {available.length > 0 ? formatCurrency(expTotal / available.length) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted">Total de Lançamentos</span>
                  <span className="font-medium text-foreground">{expenses.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted">Categorias</span>
                  <span className="font-medium text-foreground">{expByCategory.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── PERFORMANCE ── */}
        <TabsContent value="performance" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className={`text-4xl font-bold ${salesTotals.avgMargin > 10 ? 'text-success' : 'text-warning'}`}>
                  {formatPercent(salesTotals.avgMargin)}
                </p>
                <p className="text-sm text-foreground-muted mt-1">Margem Média</p>
                <Badge variant={salesTotals.avgMargin > 12 ? 'success' : 'warning'} className="mt-2">
                  {salesTotals.avgMargin > 12 ? 'Acima da meta' : 'Abaixo da meta'}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className={`text-4xl font-bold ${avgDays <= 30 ? 'text-success' : avgDays <= 60 ? 'text-warning' : 'text-danger'}`}>
                  {avgDays}
                </p>
                <p className="text-sm text-foreground-muted mt-1">Dias em Estoque</p>
                <Badge variant="secondary" className="mt-2">Meta: 30 dias</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-4xl font-bold text-primary">{available.length}</p>
                <p className="text-sm text-foreground-muted mt-1">Em Estoque</p>
                <Badge variant={critical > 0 ? 'destructive' : 'success'} className="mt-2">
                  {critical} crítico{critical !== 1 ? 's' : ''}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-4xl font-bold text-secondary">{salesTotals.count}</p>
                <p className="text-sm text-foreground-muted mt-1">Vendas no Período</p>
                <Badge variant="secondary" className="mt-2">{formatCurrency(salesTotals.revenue)}</Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Recomendações da IA</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {critical > 0 && (
                <div className="p-4 rounded-xl bg-danger/5 border border-danger/20">
                  <p className="font-semibold text-sm text-danger">⚠️ {critical} veículo{critical !== 1 ? 's' : ''} em situação crítica</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    Há mais de 60 dias no estoque. Considere reduzir o preço em 5% para acelerar a venda.
                  </p>
                </div>
              )}
              {warning > 0 && (
                <div className="p-4 rounded-xl bg-warning/5 border border-warning/20">
                  <p className="font-semibold text-sm text-warning">🔔 {warning} veículo{warning !== 1 ? 's' : ''} precisam de atenção</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    Entre 31–60 dias. Invista em fotos melhores ou polimento para acelerar as vendas.
                  </p>
                </div>
              )}
              {salesTotals.avgMargin > 0 && salesTotals.avgMargin < 10 && (
                <div className="p-4 rounded-xl bg-warning/5 border border-warning/20">
                  <p className="font-semibold text-sm text-warning">📊 Margem abaixo do ideal</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    Margem média de {formatPercent(salesTotals.avgMargin)} abaixo da referência de mercado (12%). Revise preços de compra.
                  </p>
                </div>
              )}
              {salesTotals.avgMargin >= 12 && (
                <div className="p-4 rounded-xl bg-success/5 border border-success/20">
                  <p className="font-semibold text-sm text-success">📈 Margem acima do mercado</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    {formatPercent(salesTotals.avgMargin)} está acima da média do mercado (12%). Continue priorizando qualidade.
                  </p>
                </div>
              )}
              {available.length === 0 && salesTotals.count === 0 && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="font-semibold text-sm text-primary">💡 Importe seus dados para ver recomendações</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    Vá em Importar e carregue seu arquivo .mdb ou .csv para começar.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alertas IA */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-warning" />
              Alertas IA
            </CardTitle>
            <Link href="/dashboard/alertas">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                Ver alertas <ChevronLeft className="w-3 h-3 rotate-180" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground-muted">
            Analisa toda a frota disponível e gera alertas inteligentes sobre veículos críticos, atenção e despesas elevadas.
          </p>
          {aiResult && (
            <div className={`p-3 rounded-xl border text-sm ${aiResult.ok ? 'bg-success/10 border-success/20 text-success' : 'bg-danger/10 border-danger/20 text-danger'}`}>
              {aiResult.ok ? '✅' : '⚠️'} {aiResult.msg}
            </div>
          )}
          <div className="flex gap-3">
            <Button
              onClick={generateAlerts}
              disabled={aiGenerating}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${aiGenerating ? 'animate-spin' : ''}`} />
              {aiGenerating ? 'Gerando alertas...' : 'Gerar Alertas IA'}
            </Button>
            <Link href="/dashboard/alertas">
              <Button variant="outline" className="gap-2">
                <Bell className="w-4 h-4" />
                Ver Alertas
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
