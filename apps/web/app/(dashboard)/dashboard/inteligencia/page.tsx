'use client'
/**
 * /dashboard/inteligencia
 *
 * Three intelligence tools in one tabbed page:
 *
 *  1. Período Benchmark  — current month vs last month vs same month last year
 *  2. Capital em Risco   — capital tied up, at-risk aging breakdown, opportunity cost
 *  3. O que Comprar      — acquisition intelligence ranked by margin × speed score
 */
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  ShoppingCart, DollarSign, Clock, BarChart3,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts'
import { cn } from '@/lib/utils'

const TOOLTIP_STYLE = {
  contentStyle: { background: '#111820', border: '1px solid #1E2A3A', borderRadius: 10, fontSize: 12, color: '#E2E8F0' },
  labelStyle:   { color: '#94A3B8' },
  itemStyle:    { color: '#E2E8F0' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getPeriods() {
  const now   = new Date()
  const y     = now.getFullYear()
  const m     = now.getMonth()

  return {
    current: {
      label: now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }),
      start: isoDate(new Date(y, m, 1)),
      end:   isoDate(now),
    },
    previous: {
      label: new Date(y, m - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }),
      start: isoDate(new Date(y, m - 1, 1)),
      end:   isoDate(new Date(y, m, 0)),
    },
    sameLastYear: {
      label: new Date(y - 1, m, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }),
      start: isoDate(new Date(y - 1, m, 1)),
      end:   isoDate(new Date(y - 1, m + 1, 0)),
    },
  }
}

function calcPeriodStats(vehicles: any[]) {
  if (!vehicles.length) return { units: 0, revenue: 0, profit: 0, margin: 0, avgDays: 0, avgTicket: 0 }
  const units   = vehicles.length
  const revenue = vehicles.reduce((s, v) => s + (v.sale_price || 0), 0)
  const profit  = vehicles.reduce((s, v) => {
    const exp = (v.expenses || []).reduce((e: number, x: any) => e + x.amount, 0)
    return s + (v.sale_price || 0) - v.purchase_price - exp
  }, 0)
  const margin   = revenue > 0 ? (profit / revenue) * 100 : 0
  const avgDays  = Math.round(vehicles.reduce((s, v) => s + (v.days_in_stock ?? 0), 0) / units)
  const avgTicket = Math.round(revenue / units)
  return { units, revenue, profit, margin, avgDays, avgTicket }
}

function Delta({ curr, prev, fmt = 'num' }: { curr: number; prev: number; fmt?: 'num'|'currency'|'percent'|'days' }) {
  if (prev === 0 && curr === 0) return <span className="text-xs text-foreground-subtle">—</span>
  const pct = prev === 0 ? 100 : ((curr - prev) / Math.abs(prev)) * 100
  const up   = curr >= prev
  const neutral = Math.abs(pct) < 1
  const color = neutral ? 'text-foreground-muted' : up ? 'text-success' : 'text-danger'
  const Icon  = neutral ? Minus : up ? TrendingUp : TrendingDown
  const label = neutral ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', color)}>
      <Icon className="w-3 h-3" />{label}
    </span>
  )
}

// ─── Benchmark ────────────────────────────────────────────────────────────────

function BenchmarkTab() {
  const supabase = createClient()
  const [loading, setLoading]   = useState(true)
  const [allSold, setAllSold]   = useState<any[]>([])
  const periods = getPeriods()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: userData } = await supabase.from('users').select('dealership_id').single()
      const did = userData?.dealership_id
      if (!did) { setLoading(false); return }

      const data = await fetchAll(
        supabase.from('vehicles')
          .select('sale_price, purchase_price, days_in_stock, sale_date, expenses:expenses(amount)')
          .eq('dealership_id', did)
          .eq('status', 'sold')
          .gte('sale_date', periods.sameLastYear.start)
          .order('sale_date', { ascending: false })
          .limit(1000)
      )
      if (!cancelled) { setAllSold(data); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <LoadingSkeleton />

  const filter = (start: string, end: string) =>
    allSold.filter(v => v.sale_date >= start && v.sale_date <= end)

  const curr  = calcPeriodStats(filter(periods.current.start,      periods.current.end))
  const prev  = calcPeriodStats(filter(periods.previous.start,     periods.previous.end))
  const lyear = calcPeriodStats(filter(periods.sameLastYear.start, periods.sameLastYear.end))

  const rows: Array<{ label: string; key: keyof typeof curr; fmt: 'num'|'currency'|'percent'|'days'; display: (v: number) => string }> = [
    { label: 'Unidades Vendidas', key: 'units',    fmt: 'num',      display: v => String(v) },
    { label: 'Receita Total',     key: 'revenue',  fmt: 'currency', display: formatCurrency },
    { label: 'Lucro Total',       key: 'profit',   fmt: 'currency', display: formatCurrency },
    { label: 'Margem Média',      key: 'margin',   fmt: 'percent',  display: v => formatPercent(v) },
    { label: 'Dias Médios',       key: 'avgDays',  fmt: 'days',     display: v => `${v}d` },
    { label: 'Ticket Médio',      key: 'avgTicket', fmt: 'currency', display: formatCurrency },
  ]

  const chartData = [
    { name: periods.sameLastYear.label.split(' ')[0] + ' -1a', revenue: lyear.revenue, profit: lyear.profit },
    { name: periods.previous.label.split(' ')[0],              revenue: prev.revenue,  profit: prev.profit  },
    { name: 'Este mês',                                         revenue: curr.revenue,  profit: curr.profit  },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Benchmark de Período</h2>
        <p className="text-sm text-foreground-muted mt-0.5">Compare o desempenho entre períodos equivalentes</p>
      </div>

      {/* Period comparison table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs text-foreground-muted font-medium w-40">Métrica</th>
                <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">
                  {periods.sameLastYear.label}
                </th>
                <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">
                  {periods.previous.label}
                </th>
                <th className="text-right px-4 py-3 text-xs text-primary font-semibold bg-primary/5 rounded-tr-xl">
                  {periods.current.label}
                </th>
                <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">vs Mês Ant.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key} className="border-b border-border last:border-0 hover:bg-background-elevated/30">
                  <td className="px-4 py-3 text-xs text-foreground-muted font-medium">{row.label}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-foreground-muted">
                    {row.display(lyear[row.key] as number)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-foreground-muted">
                    {row.display(prev[row.key] as number)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-foreground bg-primary/5">
                    {row.display(curr[row.key] as number)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Delta curr={curr[row.key] as number} prev={prev[row.key] as number} fmt={row.fmt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Revenue + profit chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Receita vs Lucro — 3 Períodos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8B9EB3' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8B9EB3' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [formatCurrency(v), name === 'revenue' ? 'Receita' : 'Lucro']} />
              <Bar dataKey="revenue" name="revenue" fill="#3B82F6" radius={[4,4,0,0]} />
              <Bar dataKey="profit"  name="profit"  fill="#22C55E" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Capital em Risco ─────────────────────────────────────────────────────────

function CapitalTab() {
  const supabase  = createClient()
  const [loading, setLoading] = useState(true)
  const [vehicles, setVehicles] = useState<any[]>([])
  const [salesPace, setSalesPace] = useState(0) // units sold last 30 days

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: userData } = await supabase.from('users').select('dealership_id').single()
      const did = userData?.dealership_id
      if (!did) { setLoading(false); return }

      const thirtyAgo = isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

      const [avail, { count: pace }] = await Promise.all([
        fetchAll(
          supabase.from('vehicles')
            .select('id, purchase_price, sale_price, days_in_stock, expenses:expenses(amount)')
            .eq('dealership_id', did)
            .eq('status', 'available')
        ),
        supabase.from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('dealership_id', did)
          .eq('status', 'sold')
          .gte('sale_date', thirtyAgo),
      ])

      if (!cancelled) {
        setVehicles(avail)
        setSalesPace(pace ?? 0)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <LoadingSkeleton />

  // Compute per-vehicle true cost
  const enriched = vehicles.map(v => {
    const expenses = (v.expenses || []).reduce((s: number, e: any) => s + e.amount, 0)
    return { ...v, totalExpenses: expenses, trueCost: v.purchase_price + expenses }
  })

  const totalCapital   = enriched.reduce((s, v) => s + v.trueCost, 0)
  const totalSaleValue = enriched.filter(v => v.sale_price > 0).reduce((s, v) => s + v.sale_price, 0)
  const unpriced       = enriched.filter(v => !v.sale_price || v.sale_price === 0)
  const unpricedCapital = unpriced.reduce((s, v) => s + v.trueCost, 0)
  const spread         = totalSaleValue - enriched.filter(v => v.sale_price > 0).reduce((s, v) => s + v.trueCost, 0)

  // Opportunity cost: 1.5% per month (18%/yr) on tied capital, per day
  const dailyOpportunityCost = totalCapital * (0.18 / 365)

  // Aging buckets
  const ok         = enriched.filter(v => v.days_in_stock <= 45)
  const attention  = enriched.filter(v => v.days_in_stock > 45 && v.days_in_stock <= 90)
  const critical   = enriched.filter(v => v.days_in_stock > 90)

  // Cash projection: if pace continues (salesPace units/30d), how much capital frees in 30/60/90 days
  const avgCapPerVehicle = enriched.length > 0 ? totalCapital / enriched.length : 0
  const proj30  = salesPace * avgCapPerVehicle
  const proj60  = salesPace * 2 * avgCapPerVehicle
  const proj90  = salesPace * 3 * avgCapPerVehicle

  const agingBuckets = [
    { label: 'OK (0–45d)',     count: ok.length,        capital: ok.reduce((s,v) => s + v.trueCost, 0),       color: '#22C55E' },
    { label: 'Atenção (46–90d)', count: attention.length, capital: attention.reduce((s,v) => s + v.trueCost, 0), color: '#EAB308' },
    { label: 'Crítico (+90d)', count: critical.length,   capital: critical.reduce((s,v) => s + v.trueCost, 0),  color: '#EF4444' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Capital em Risco</h2>
        <p className="text-sm text-foreground-muted mt-0.5">Visão financeira do estoque atual</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Capital Imobilizado', value: formatCurrency(totalCapital),      icon: DollarSign, color: 'text-primary',   sub: `${enriched.length} veículos` },
          { label: 'Valor de Venda Previsto', value: formatCurrency(totalSaleValue), icon: TrendingUp, color: 'text-success',   sub: spread >= 0 ? `+${formatCurrency(spread)} de spread` : `${formatCurrency(spread)} de spread` },
          { label: 'Capital Sem Preço',    value: formatCurrency(unpricedCapital),   icon: AlertTriangle, color: 'text-danger', sub: `${unpriced.length} veículo${unpriced.length !== 1 ? 's' : ''}` },
          { label: 'Custo de Oportunidade', value: `${formatCurrency(dailyOpportunityCost)}/dia`, icon: Clock, color: 'text-warning', sub: `Base: 18% a.a.` },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-foreground-muted">{kpi.label}</p>
                  <p className={cn('text-lg font-bold mt-0.5', kpi.color)}>{kpi.value}</p>
                  <p className="text-xs text-foreground-subtle mt-0.5">{kpi.sub}</p>
                </div>
                <kpi.icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', kpi.color)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Aging capital breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Capital por Faixa de Envelhecimento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agingBuckets.map(b => {
              const pct = totalCapital > 0 ? (b.capital / totalCapital) * 100 : 0
              return (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                      <span className="text-foreground-muted text-xs">{b.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-foreground-muted">{b.count} veíc.</span>
                      <span className="font-semibold text-xs font-mono text-foreground">{formatCurrency(b.capital)}</span>
                      <span className="text-xs text-foreground-subtle w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Cash projection */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Projeção de Liberação de Capital</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-foreground-muted">
              Baseado no ritmo atual de <strong className="text-foreground">{salesPace} venda{salesPace !== 1 ? 's' : ''}</strong> nos últimos 30 dias
            </p>
            {[
              { label: '30 dias', value: proj30  },
              { label: '60 dias', value: proj60  },
              { label: '90 dias', value: proj90  },
            ].map(p => {
              const pct = totalCapital > 0 ? Math.min(100, (p.value / totalCapital) * 100) : 0
              return (
                <div key={p.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground-muted text-xs">{p.label}</span>
                    <span className="font-semibold text-xs font-mono text-foreground">{formatCurrency(p.value)}</span>
                  </div>
                  <div className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-foreground-subtle mt-0.5">{pct.toFixed(1)}% do capital imobilizado</p>
                </div>
              )
            })}

            <div className="pt-2 border-t border-border">
              <p className="text-xs text-foreground-muted">
                Custo acumulado de oportunidade (90 dias):{' '}
                <strong className="text-warning">{formatCurrency(dailyOpportunityCost * 90)}</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capital bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Distribuição de Capital por Envelhecimento</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={agingBuckets} barSize={48}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B9EB3' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8B9EB3' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [formatCurrency(v), 'Capital']} />
              <Bar dataKey="capital" radius={[4,4,0,0]}>
                {agingBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Acquisition Intelligence ─────────────────────────────────────────────────

interface ModelStats {
  brand: string
  model: string
  count: number
  avgSalePrice: number
  avgMargin: number
  avgDays: number
  totalProfit: number
  score: number
}

function AquisicaoTab() {
  const supabase  = createClient()
  const [loading, setLoading] = useState(true)
  const [models, setModels]   = useState<ModelStats[]>([])
  const [minCount, setMinCount] = useState(2)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: userData } = await supabase.from('users').select('dealership_id').single()
      const did = userData?.dealership_id
      if (!did) { setLoading(false); return }

      const data = await fetchAll(
        supabase.from('vehicles')
          .select('brand, model, purchase_price, sale_price, days_in_stock, expenses:expenses(amount)')
          .eq('dealership_id', did)
          .eq('status', 'sold')
          .gt('purchase_price', 0)
          .gt('sale_price', 0)
          .order('sale_date', { ascending: false })
          .limit(2000)
      )

      if (cancelled) return

      // Group by brand + model
      const map = new Map<string, { vehicles: any[] }>()
      for (const v of data) {
        const key = `${v.brand.trim()}|||${v.model.trim()}`
        if (!map.has(key)) map.set(key, { vehicles: [] })
        map.get(key)!.vehicles.push(v)
      }

      const stats: ModelStats[] = []
      for (const [key, { vehicles }] of Array.from(map.entries())) {
        if (vehicles.length < 1) continue
        const [brand, model] = key.split('|||')
        const count = vehicles.length

        const profits = vehicles.map(v => {
          const exp = (v.expenses || []).reduce((s: number, e: any) => s + e.amount, 0)
          return (v.sale_price || 0) - v.purchase_price - exp
        })
        const margins = vehicles.map((v, i) =>
          v.sale_price > 0 ? (profits[i] / v.sale_price) * 100 : 0
        )
        const totalProfit  = profits.reduce((s, p) => s + p, 0)
        const avgMargin    = margins.reduce((s, m) => s + m, 0) / count
        const avgDays      = Math.round(vehicles.reduce((s, v) => s + (v.days_in_stock ?? 0), 0) / count)
        const avgSalePrice = Math.round(vehicles.reduce((s, v) => s + (v.sale_price || 0), 0) / count)

        // Score: 50% margin weight + 50% speed weight (45-day baseline)
        const speedScore  = Math.max(0, Math.min(100, (45 / Math.max(avgDays, 1)) * 100))
        const marginScore = Math.max(0, Math.min(100, avgMargin * 4))
        const score = Math.round(speedScore * 0.5 + marginScore * 0.5)

        stats.push({ brand, model, count, avgSalePrice, avgMargin, avgDays, totalProfit, score })
      }

      stats.sort((a, b) => b.score - a.score)
      setModels(stats)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <LoadingSkeleton />

  const filtered = models.filter(m => m.count >= minCount)
  const chartData = filtered.slice(0, 10).map(m => ({
    name: `${m.brand} ${m.model}`.slice(0, 22),
    score: m.score,
    margin: parseFloat(m.avgMargin.toFixed(1)),
    days: m.avgDays,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Inteligência de Aquisição</h2>
          <p className="text-sm text-foreground-muted mt-0.5">O que comprar — ranqueado por margem e velocidade de giro</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground-muted">Mínimo de vendas:</span>
          {[1, 2, 3, 5].map(n => (
            <button
              key={n}
              onClick={() => setMinCount(n)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                minCount === n
                  ? 'bg-primary text-white'
                  : 'bg-background-elevated text-foreground-muted hover:text-foreground'
              )}
            >
              {n}+
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingCart className="w-8 h-8 text-foreground-subtle mx-auto mb-3" />
            <p className="text-foreground-muted text-sm">Dados insuficientes para gerar recomendações</p>
            <p className="text-xs text-foreground-subtle mt-1">Registre pelo menos {minCount} venda{minCount > 1 ? 's' : ''} por modelo</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top 10 score chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top 10 — Score de Aquisição</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
                <BarChart data={chartData} layout="vertical" barSize={18} margin={{ left: 10, right: 60 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#8B9EB3' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#8B9EB3' }} width={140} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}`, 'Score']} />
                  <Bar dataKey="score" radius={[0,4,4,0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={`hsl(${140 - i * 12}, 70%, 50%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Full ranked table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ranking Completo ({filtered.length} modelos)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs text-foreground-muted font-medium w-8">#</th>
                      <th className="text-left px-4 py-3 text-xs text-foreground-muted font-medium">Modelo</th>
                      <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">Vendas</th>
                      <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">Margem Méd.</th>
                      <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">Dias Méd.</th>
                      <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">Ticket Méd.</th>
                      <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">Lucro Total</th>
                      <th className="text-right px-4 py-3 text-xs text-foreground-muted font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m, i) => (
                      <tr key={`${m.brand}-${m.model}`} className="border-b border-border last:border-0 hover:bg-background-elevated/30">
                        <td className="px-4 py-3 text-xs text-foreground-muted">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground text-sm">{m.brand} {m.model}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-foreground">{m.count}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'text-sm font-mono font-semibold',
                            m.avgMargin >= 15 ? 'text-success' : m.avgMargin >= 8 ? 'text-secondary' : m.avgMargin >= 0 ? 'text-warning' : 'text-danger'
                          )}>
                            {formatPercent(m.avgMargin)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'text-sm font-mono font-semibold',
                            m.avgDays <= 30 ? 'text-success' : m.avgDays <= 60 ? 'text-warning' : 'text-danger'
                          )}>
                            {m.avgDays}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-foreground-muted">
                          {formatCurrency(m.avgSalePrice)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={m.totalProfit >= 0 ? 'text-success text-sm font-mono' : 'text-danger text-sm font-mono'}>
                            {formatCurrency(m.totalProfit)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ScoreBadge score={m.score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <p className="text-xs text-foreground-subtle">
            Score = 50% velocidade (base 45 dias) + 50% margem. Quanto maior, melhor para adquirir.
          </p>
        </>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-success/20 text-success' : score >= 45 ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded-md text-xs font-bold font-mono', color)}>
      {score}
    </span>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-24 rounded-xl bg-background-elevated animate-pulse" />
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InteligenciaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inteligência de Negócio</h1>
        <p className="text-foreground-muted text-sm mt-1">Benchmark, capital em risco e recomendações de aquisição</p>
      </div>

      <Tabs defaultValue="benchmark">
        <TabsList className="mb-2">
          <TabsTrigger value="benchmark" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Benchmark
          </TabsTrigger>
          <TabsTrigger value="capital" className="gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            Capital em Risco
          </TabsTrigger>
          <TabsTrigger value="aquisicao" className="gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5" />
            O que Comprar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="benchmark" className="mt-4">
          <BenchmarkTab />
        </TabsContent>
        <TabsContent value="capital" className="mt-4">
          <CapitalTab />
        </TabsContent>
        <TabsContent value="aquisicao" className="mt-4">
          <AquisicaoTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
