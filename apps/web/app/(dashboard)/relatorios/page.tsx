'use client'
import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

export default function RelatoriosPage() {
  const [period, setPeriod] = useState('30')
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.from('users').select('dealership_id').single()
      const cutoff = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString()

      const { data } = await supabase.from('sales').select('*')
        .eq('dealership_id', userData?.dealership_id)
        .gte('sale_date', cutoff.split('T')[0])
        .order('sale_date', { ascending: true })

      setSales(data || [])
      setLoading(false)
    }
    load()
  }, [period])

  const totals = {
    revenue: sales.reduce((s, sale) => s + sale.sale_price, 0),
    profit: sales.reduce((s, sale) => s + (sale.profit || 0), 0),
    count: sales.length,
    avgMargin: sales.length ? sales.reduce((s, sale) => s + (sale.profit_percent || 0), 0) / sales.length : 0,
  }

  // Sales by day for chart
  const byDay = sales.reduce((acc: Record<string, { revenue: number; profit: number; count: number }>, sale) => {
    const day = sale.sale_date.slice(5) // MM-DD
    if (!acc[day]) acc[day] = { revenue: 0, profit: 0, count: 0 }
    acc[day].revenue += sale.sale_price
    acc[day].profit += sale.profit || 0
    acc[day].count += 1
    return acc
  }, {})

  const chartData = Object.entries(byDay).map(([day, data]) => ({ day, ...data }))

  const paymentMethods = sales.reduce((acc: Record<string, number>, sale) => {
    acc[sale.payment_method] = (acc[sale.payment_method] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-foreground-muted text-sm mt-1">Análise de performance da revenda</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="365">1 ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Vendas', value: totals.count, icon: TrendingUp, color: 'text-primary' },
          { label: 'Faturamento', value: formatCurrency(totals.revenue), icon: DollarSign, color: 'text-success' },
          { label: 'Lucro', value: formatCurrency(totals.profit), icon: BarChart3, color: 'text-secondary' },
          { label: 'Margem Média', value: formatPercent(totals.avgMargin), icon: TrendingUp, color: 'text-warning' },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-foreground-muted">{k.label}</p>
              <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Faturamento por Dia</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8B9EB3' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8B9EB3' }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#111820', border: '1px solid #1E2A3A', borderRadius: 12 }}
                  formatter={(v: any) => formatCurrency(v)}
                />
                <Bar dataKey="revenue" fill="#00D9FF" radius={[4,4,0,0]} />
                <Bar dataKey="profit" fill="#00E676" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
