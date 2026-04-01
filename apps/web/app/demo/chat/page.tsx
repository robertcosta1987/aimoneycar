'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Loader2, Car, TrendingUp, Receipt, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, formatPercent } from '@/lib/utils'
import { demoVehicles, getDashboardStats, expensesByCategory, demoSales } from '@/lib/demo-data'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

function getAIResponse(question: string): string {
  const q = question.toLowerCase()
  const stats = getDashboardStats()

  if (q.includes('baixar') && q.includes('preço')) {
    const criticalVehicles = demoVehicles
      .filter((v) => v.daysInStock > 45 && v.status === 'available')
      .sort((a, b) => b.daysInStock - a.daysInStock)
      .slice(0, 3)

    return `Baseado na análise do seu estoque, recomendo baixar o preço destes ${criticalVehicles.length} veículos:\n\n${criticalVehicles
      .map((v, i) => {
        const discount = Math.round(v.salePrice * 0.05)
        const newPrice = v.salePrice - discount
        return `${i + 1}. **${v.brand} ${v.model}** (${v.plate})\n   • ${v.daysInStock} dias em estoque\n   • Preço atual: ${formatCurrency(v.salePrice)}\n   • Sugestão: ${formatCurrency(newPrice)} (-5%)`
      })
      .join('\n\n')}\n\n💡 **Dica:** Veículos parados há mais de 60 dias perdem ~2% do valor por mês.`
  }

  if (q.includes('lucro') || q.includes('margem') || q.includes('ganho')) {
    return `📊 **Resumo Financeiro do Mês**\n\n• Faturamento: ${formatCurrency(stats.monthlyRevenue)}\n• Lucro líquido: ${formatCurrency(stats.monthlyProfit)}\n• Margem média: ${formatPercent(stats.avgMargin)}\n• Total em despesas: ${formatCurrency(stats.totalExpenses)}\n\n**Por veículo vendido:**\n• Lucro médio: ${formatCurrency(stats.monthlyProfit / stats.soldThisMonth)}\n\n💡 Sua margem está saudável! Para melhorar, foque em veículos populares que giram rápido.`
  }

  if (q.includes('parado') || q.includes('tempo') || q.includes('estoque')) {
    const available = demoVehicles.filter((v) => v.status === 'available')
    const critical = available.filter((v) => v.daysInStock > 60)

    return `📦 **Análise de Tempo em Estoque**\n\n• Total em estoque: ${available.length} veículos\n• Tempo médio: ${stats.avgDaysInStock} dias\n\n🔴 **Críticos (+60 dias):** ${critical.length} veículos\n${critical.map((v) => `   • ${v.brand} ${v.model} - ${v.daysInStock} dias`).join('\n')}\n\n💡 Esses veículos estão custando ~${formatCurrency(critical.length * 50 * 30)}/mês em custo de oportunidade.`
  }

  if (q.includes('despesa') || q.includes('gasto') || q.includes('despachante')) {
    const despachante = expensesByCategory.find((e) => e.category === 'DESPACHANTE')
    return `💰 **Análise de Despesas**\n\n**Total por categoria:**\n${expensesByCategory.map((e) => `• ${e.category}: ${formatCurrency(e.total)}`).join('\n')}\n\n**Despachante:**\n• Total: ${formatCurrency(despachante?.total || 0)}\n• Média: ${formatCurrency((despachante?.total || 0) / (despachante?.count || 1))}/veículo\n• **18% acima do mercado**\n\n💡 Renegociando, você pode economizar ~R$1.300/mês.`
  }

  if (q.includes('vend') && (q.includes('mais') || q.includes('rápido'))) {
    return `🏆 **Veículos que Vendem Mais Rápido**\n\n1. **HB20** - média de 18 dias\n2. **Onix** - média de 22 dias\n3. **Argo** - média de 25 dias\n4. **Gol** - média de 28 dias\n\n💡 Priorize HB20 e Onix na faixa de R$45-55k.`
  }

  if (q.includes('comprar') || q.includes('o que')) {
    return `📦 **O Que Comprar Este Mês**\n\n**Alta demanda na região:**\n• HB20 2019-2021 → venda em <20 dias\n• Onix 2019-2021 → venda em <22 dias\n• Argo 2020+ → demanda crescente\n\n**Evitar:**\n• Sedãs grandes (+45 dias)\n• Carros >R$80k (mercado lento)\n\n💡 Compre 2 HB20 e 1 Onix. ROI esperado: 15%`
  }

  if (q.includes('resumo') || q.includes('como') || q.includes('está')) {
    return `📊 **Resumo da Sua Revenda**\n\n**Estoque:**\n• ${stats.availableVehicles} veículos disponíveis\n• ${stats.criticalVehicles} precisam de atenção\n• Tempo médio: ${stats.avgDaysInStock} dias\n\n**Financeiro (mês):**\n• Vendas: ${stats.soldThisMonth} veículos\n• Faturamento: ${formatCurrency(stats.monthlyRevenue)}\n• Lucro: ${formatCurrency(stats.monthlyProfit)}\n• Margem: ${formatPercent(stats.avgMargin)}\n\n💡 Performance boa! Foque nos ${stats.criticalVehicles} veículos críticos.`
  }

  return `Entendi sua pergunta! Posso te ajudar com:\n\n• **"Quais carros devo baixar o preço?"**\n• **"Qual foi meu lucro esse mês?"**\n• **"Quanto gastei com despachante?"**\n• **"Quais veículos estão parados?"**\n• **"O que devo comprar?"**\n• **"Como está minha revenda?"**\n\nTente uma dessas!`
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        '👋 Olá! Sou o assistente de IA da Moneycar.\n\nPosso analisar seus dados e responder perguntas sobre estoque, vendas, despesas e muito mais.\n\nO que você gostaria de saber?',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 800))

    const response = getAIResponse(input)
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
    }

    setMessages((prev) => [...prev, assistantMessage])
    setIsLoading(false)
  }

  const quickActions = [
    { icon: TrendingUp, label: 'Meu lucro', question: 'Qual foi meu lucro esse mês?' },
    { icon: Clock, label: 'Estoque parado', question: 'Quais veículos estão parados há mais tempo?' },
    { icon: Receipt, label: 'Despesas', question: 'Quanto gastei com despachante?' },
    { icon: Car, label: 'O que comprar', question: 'O que devo comprar este mês?' },
  ]

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-violet-500" />
          Assistente IA
        </h1>
        <p className="text-muted-foreground">
          Pergunte qualquer coisa sobre sua revenda em português natural
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {quickActions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setInput(action.question)
              setTimeout(() => handleSend(), 100)
            }}
          >
            <action.icon className="h-4 w-4 text-violet-500" />
            {action.label}
          </Button>
        ))}
      </div>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-3',
                    message.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-sm'
                      : 'bg-slate-100 dark:bg-slate-800 rounded-bl-sm'
                  )}
                >
                  <div className="text-sm whitespace-pre-wrap">
                    {message.content.split('**').map((part, i) =>
                      i % 2 === 1 ? (
                        <strong key={i}>{part}</strong>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analisando seus dados...
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta..."
              className="flex-1"
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !input.trim()} variant="gradient">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
