'use client'

import { useState } from 'react'
import {
  Receipt,
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Car,
  Filter,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, cn } from '@/lib/utils'
import { demoVehicles, expensesByCategory } from '@/lib/demo-data'

export default function DespesasPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const allExpenses = demoVehicles.flatMap((v) =>
    v.expenses.map((e) => ({
      ...e,
      vehicleName: `${v.brand} ${v.model}`,
      vehiclePlate: v.plate,
    }))
  )

  const filteredExpenses = selectedCategory
    ? allExpenses.filter((e) => e.category === selectedCategory)
    : allExpenses

  const totalExpenses = expensesByCategory.reduce((sum, e) => sum + e.total, 0)
  const avgPerVehicle = totalExpenses / demoVehicles.length

  // Find anomalies
  const despachante = expensesByCategory.find((e) => e.category === 'DESPACHANTE')
  const marketAvgDespachante = 320
  const despachanteOverage = despachante
    ? ((despachante.total / despachante.count - marketAvgDespachante) / marketAvgDespachante) * 100
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Despesas</h1>
          <p className="text-muted-foreground">
            Análise completa de despesas por veículo e categoria
          </p>
        </div>
        <Button variant="outline">
          <Receipt className="mr-2 h-4 w-4" />
          Adicionar Despesa
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <DollarSign className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalExpenses)}</p>
                <p className="text-xs text-muted-foreground">Total despesas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Car className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(avgPerVehicle)}</p>
                <p className="text-xs text-muted-foreground">Média por veículo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                <Receipt className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{allExpenses.length}</p>
                <p className="text-xs text-muted-foreground">Transações</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <TrendingDown className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{expensesByCategory.length}</p>
                <p className="text-xs text-muted-foreground">Categorias</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insight */}
      {despachanteOverage > 10 && (
        <Card className="border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                <Sparkles className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h4 className="font-medium text-violet-800 dark:text-violet-200">
                  💡 Insight: Despachante {despachanteOverage.toFixed(0)}% acima do mercado
                </h4>
                <p className="text-sm text-violet-600 dark:text-violet-400 mt-1">
                  Você está pagando em média {formatCurrency((despachante?.total || 0) / (despachante?.count || 1))} por
                  transferência. A média da região é {formatCurrency(marketAvgDespachante)}.
                  Economia potencial: <strong>{formatCurrency((despachante?.total || 0) * 0.18)}/ano</strong>
                </p>
                <Button variant="outline" size="sm" className="mt-3">
                  Ver despachantes alternativos
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Category breakdown */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {expensesByCategory.map((expense) => {
              const percentage = (expense.total / totalExpenses) * 100
              const isSelected = selectedCategory === expense.category
              return (
                <button
                  key={expense.category}
                  onClick={() =>
                    setSelectedCategory(isSelected ? null : expense.category)
                  }
                  className={cn(
                    'w-full text-left p-3 rounded-lg transition-colors',
                    isSelected
                      ? 'bg-violet-100 dark:bg-violet-900/30 ring-2 ring-violet-500'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium">{expense.category}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(expense.total)}
                    </span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{expense.count} transações</span>
                    <span>{percentage.toFixed(1)}%</span>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        {/* Expense list */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {selectedCategory
                ? `Despesas: ${selectedCategory}`
                : 'Todas as Despesas'}
            </CardTitle>
            {selectedCategory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                Limpar filtro
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {filteredExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-slate-700 border">
                      <Receipt className="h-5 w-5 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{expense.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {expense.vehicleName} • {expense.vehiclePlate}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-red-600">
                      -{formatCurrency(expense.value)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {expense.vendor}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top vendors */}
      <Card>
        <CardHeader>
          <CardTitle>Principais Fornecedores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">BRISAMAR DESPACHANTE</span>
                <Badge>97 transações</Badge>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(4200)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Despachante e documentação
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">LAURE MOTORS</span>
                <Badge>22 transações</Badge>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(3800)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Funilaria e pintura
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">FAROL MANIA</span>
                <Badge>15 transações</Badge>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(2850)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Mecânica e peças
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
