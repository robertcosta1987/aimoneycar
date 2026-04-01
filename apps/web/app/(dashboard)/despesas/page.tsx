'use client'
import { useState, useEffect } from 'react'
import { Receipt, TrendingUp, Car } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

const EXPENSE_COLORS: Record<string, string> = {
  DESPACHANTE: 'bg-primary',
  LAVAGEM: 'bg-success',
  FUNILARIA: 'bg-warning',
  MECÂNICA: 'bg-danger',
  ELÉTRICA: 'bg-secondary',
  DOCUMENTAÇÃO: 'bg-primary/60',
  PUBLICIDADE: 'bg-success/60',
  OUTROS: 'bg-foreground-subtle',
}

export default function DespesasPage() {
  const [expenses, setExpenses] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.from('users').select('dealership_id').single()
      const [{ data: exp }, { data: veh }] = await Promise.all([
        supabase.from('expenses').select('*, vehicle:vehicles(brand, model, plate)')
          .eq('dealership_id', userData?.dealership_id)
          .order('date', { ascending: false }).limit(100),
        supabase.from('vehicles').select('id, brand, model, plate, expenses:expenses(amount)')
          .eq('dealership_id', userData?.dealership_id).eq('status', 'available'),
      ])
      setExpenses(exp || [])
      setVehicles((veh || []).map((v: any) => ({
        ...v,
        total: (v.expenses || []).reduce((s: number, e: any) => s + e.amount, 0)
      })).sort((a: any, b: any) => b.total - a.total))
      setLoading(false)
    }
    load()
  }, [])

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  const byCategory = expenses.reduce((acc: Record<string, { total: number; count: number }>, e) => {
    const cat = e.category.toUpperCase()
    if (!acc[cat]) acc[cat] = { total: 0, count: 0 }
    acc[cat].total += e.amount
    acc[cat].count += 1
    return acc
  }, {})

  const categories = Object.entries(byCategory)
    .map(([cat, data]) => ({ cat, ...data, pct: Math.round((data.total / total) * 100) }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Despesas</h1>
        <p className="text-foreground-muted text-sm mt-1">
          Total: {formatCurrency(total)} em {expenses.length} lançamentos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" />Por Categoria</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {categories.map(({ cat, total: catTotal, count, pct }) => (
              <div key={cat}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-foreground">{cat}</span>
                  <span className="text-foreground-muted">{formatCurrency(catTotal)} ({pct}%)</span>
                </div>
                <Progress value={pct} className="h-1.5" />
                <p className="text-xs text-foreground-subtle mt-0.5">{count} lançamentos</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* By vehicle */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Car className="w-4 h-4 text-secondary" />Por Veículo</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {vehicles.slice(0, 8).map((v) => (
                <div key={v.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{v.brand} {v.model}</p>
                    <p className="text-xs text-foreground-muted">{v.plate}</p>
                  </div>
                  <p className="text-sm font-semibold text-warning">{formatCurrency(v.total)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expense list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Lançamentos Recentes</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {expenses.slice(0, 20).map((e) => {
              const vehicle = e.vehicle as any
              return (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{e.description || e.category}</p>
                    <p className="text-xs text-foreground-muted">
                      {vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Geral'} · {new Date(e.date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{e.category}</Badge>
                    <p className="text-sm font-semibold text-warning">{formatCurrency(e.amount)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
