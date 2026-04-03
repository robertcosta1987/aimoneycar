'use client'

import { useState } from 'react'
import {
  BarChart3,
  Download,
  Calendar,
  FileText,
  TrendingUp,
  Car,
  Receipt,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { getDashboardStats, demoSales, demoVehicles, expensesByCategory } from '@/lib/demo-data'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function RelatoriosPage() {
  const stats = getDashboardStats()

  const reports = [
    {
      id: 'vendas',
      name: 'Relatório de Vendas',
      description: 'Vendas, faturamento e margem por período',
      icon: TrendingUp,
      color: 'green',
    },
    {
      id: 'estoque',
      name: 'Relatório de Estoque',
      description: 'Tempo em estoque, veículos críticos, giro',
      icon: Car,
      color: 'blue',
    },
    {
      id: 'despesas',
      name: 'Relatório de Despesas',
      description: 'Gastos por categoria e fornecedor',
      icon: Receipt,
      color: 'orange',
    },
    {
      id: 'performance',
      name: 'Performance Geral',
      description: 'KPIs, metas e comparativo mensal',
      icon: BarChart3,
      color: 'violet',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground">
            Análises e insights do seu negócio
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Março 2024
          </Button>
          <Button variant="gradient">
            <Download className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Faturamento</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.monthlyRevenue)}</p>
            <Badge variant="success" className="mt-1">+20% vs mês anterior</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Lucro Líquido</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.monthlyProfit)}</p>
            <Badge variant="success" className="mt-1">Margem {formatPercent((stats.monthlyProfit / stats.monthlyRevenue) * 100)}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Veículos Vendidos</p>
            <p className="text-2xl font-bold">{stats.soldThisMonth}</p>
            <Badge variant="secondary" className="mt-1">Meta: 8</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Tempo Médio Estoque</p>
            <p className="text-2xl font-bold">{stats.avgDaysInStock} dias</p>
            <Badge variant="warning" className="mt-1">Meta: 30 dias</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Reports tabs */}
      <Tabs defaultValue="vendas" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Evolução de Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={demoSales.map(s => ({ name: s.vehicle.split(' ').slice(0,2).join(' '), lucro: s.profit, receita: s.salePrice }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="receita" fill="#00D9FF" name="Receita" radius={[4,4,0,0]} />
                  <Bar dataKey="lucro" fill="#FFB800" name="Lucro" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vendas do Mês</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demoSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                  >
                    <div>
                      <p className="font-medium">{sale.vehicle}</p>
                      <p className="text-sm text-muted-foreground">
                        {sale.customerName} • {sale.salesperson}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(sale.salePrice)}</p>
                      <p className="text-sm text-green-600">
                        Lucro: {formatCurrency(sale.profit)} ({formatPercent(sale.profitPercent)})
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estoque" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Tempo em Estoque</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { range: '0-15 dias', count: demoVehicles.filter(v => v.daysInStock <= 15 && v.status === 'available').length },
                  { range: '16-30 dias', count: demoVehicles.filter(v => v.daysInStock > 15 && v.daysInStock <= 30 && v.status === 'available').length },
                  { range: '31-60 dias', count: demoVehicles.filter(v => v.daysInStock > 30 && v.daysInStock <= 60 && v.status === 'available').length },
                  { range: '+60 dias', count: demoVehicles.filter(v => v.daysInStock > 60 && v.status === 'available').length },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#00D9FF" name="Veículos" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-green-200">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Saudável (0-30 dias)</p>
                <p className="text-2xl font-bold text-green-600">
                  {demoVehicles.filter((v) => v.daysInStock <= 30 && v.status === 'available').length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-yellow-200">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Atenção (31-60 dias)</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {demoVehicles.filter((v) => v.daysInStock > 30 && v.daysInStock <= 60 && v.status === 'available').length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Crítico (+60 dias)</p>
                <p className="text-2xl font-bold text-red-600">
                  {demoVehicles.filter((v) => v.daysInStock > 60 && v.status === 'available').length}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="despesas" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Por Categoria</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {expensesByCategory.map((expense) => (
                  <div key={expense.category} className="flex items-center justify-between">
                    <span>{expense.category}</span>
                    <span className="font-medium">{formatCurrency(expense.total)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Total de Despesas</span>
                  <span className="font-bold text-red-600">
                    {formatCurrency(expensesByCategory.reduce((sum, e) => sum + e.total, 0))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Média por Veículo</span>
                  <span className="font-medium">
                    {formatCurrency(expensesByCategory.reduce((sum, e) => sum + e.total, 0) / demoVehicles.length)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Transações</span>
                  <span className="font-medium">
                    {expensesByCategory.reduce((sum, e) => sum + e.count, 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-4xl font-bold text-green-600">{formatPercent(stats.avgMargin)}</p>
                <p className="text-sm text-muted-foreground mt-1">Margem Média</p>
                <Badge variant="success" className="mt-2">Acima da meta</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-4xl font-bold">{stats.avgDaysInStock}</p>
                <p className="text-sm text-muted-foreground mt-1">Dias em Estoque</p>
                <Badge variant="warning" className="mt-2">Meta: 30 dias</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-4xl font-bold text-green-600">62%</p>
                <p className="text-sm text-muted-foreground mt-1">Meta de Vendas</p>
                <Badge variant="secondary" className="mt-2">{stats.soldThisMonth}/8 veículos</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-4xl font-bold text-violet-600">A</p>
                <p className="text-sm text-muted-foreground mt-1">Score Geral</p>
                <Badge variant="ai" className="mt-2">Excelente</Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recomendações da IA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                <p className="font-medium">💡 Foque nos veículos críticos</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.criticalVehicles} veículos estão há mais de 60 dias. 
                  Baixar 5% no preço pode acelerar as vendas e liberar capital.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <p className="font-medium">📈 Sua margem está ótima</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatPercent(stats.avgMargin)} está acima da média do mercado (12%). 
                  Continue priorizando qualidade sobre volume.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                <p className="font-medium">⚠️ Revise despesas com despachante</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Gastos 18% acima do mercado. Renegociar pode economizar ~R$1.300/mês.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
