'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Loader2, Car, TrendingUp, Receipt, Clock, BarChart3, Users, Tag, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ChatDashboard } from '@/components/chat/ChatDashboard'
import type { DashboardConfig } from '@/types/dashboard'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  dashboard?: DashboardConfig
}

const quickActions = [
  { icon: TrendingUp, label: 'Análise de margem', query: 'Faça uma análise completa das margens de lucro das minhas vendas' },
  { icon: Car, label: 'Saúde do estoque', query: 'Mostre a saúde do meu estoque com tempo de giro e alertas' },
  { icon: Receipt, label: 'Breakdown de despesas', query: 'Analise as despesas por categoria com gráfico' },
  { icon: BarChart3, label: 'Resumo geral', query: 'Me dê um resumo executivo completo da revenda com dashboard' },
  { icon: Clock, label: 'Veículos parados', query: 'Quais veículos estão parados há mais tempo e qual a recomendação?' },
  { icon: Users, label: 'Performance vendedores', query: 'Mostre a performance dos meus vendedores em ranking' },
  { icon: Tag, label: 'Sugestões de Promoção', query: 'Analise o estoque e sugira promoções, cortes de preço e ações de marketing para os veículos que estão parados há mais tempo. Inclua sugestões específicas por veículo com preço atual, tempo em estoque e estratégia recomendada.' },
  { icon: ShoppingCart, label: 'Sugestão de Compra', query: 'Com base no histórico de vendas, quais marcas e modelos vendem mais rápido (em até 2 semanas) ou têm maior volume de saída? Sugira em quais veículos vale a pena investir nas próximas compras, com justificativa baseada em giro de estoque e lucratividade.' },
]

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  const inlineFormat = (line: string) => {
    // Bold + italic inline
    let html = line
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:#1A2332;padding:1px 5px;border-radius:4px;font-size:11px;">$1</code>')
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  while (i < lines.length) {
    const line = lines[i]

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<p key={i} className="font-semibold text-sm text-foreground mt-2 mb-0.5">{inlineFormat(line.slice(4))}</p>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      elements.push(<p key={i} className="font-bold text-sm text-primary mt-3 mb-1">{inlineFormat(line.slice(3))}</p>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      elements.push(<p key={i} className="font-bold text-base text-foreground mt-3 mb-1">{inlineFormat(line.slice(2))}</p>)
      i++; continue
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***') {
      elements.push(<hr key={i} className="border-border my-2" />)
      i++; continue
    }

    // Table detection
    if (line.startsWith('|') && i + 1 < lines.length && lines[i + 1].startsWith('|---')) {
      const headerCells = line.split('|').filter(Boolean).map(c => c.trim())
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').filter(Boolean).map(c => c.trim()))
        i++
      }
      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-2 rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-background-elevated">
                {headerCells.map((h, j) => (
                  <th key={j} className="px-3 py-2 text-left font-semibold text-foreground-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-background-elevated/50'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-foreground whitespace-nowrap">{inlineFormat(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-0.5 my-1 pl-3">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 text-sm leading-relaxed">
              <span className="text-primary mt-1 flex-shrink-0">•</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-0.5 my-1 pl-3 list-decimal list-inside">
          {items.map((item, j) => (
            <li key={j} className="text-sm leading-relaxed">{inlineFormat(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
      i++; continue
    }

    // Regular paragraph
    elements.push(<p key={i} className="text-sm leading-relaxed">{inlineFormat(line)}</p>)
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

// ── Chat page ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Olá! Sou o **Moneycar IA**. Analiso os dados da sua revenda em tempo real e gero dashboards interativos.\n\nPergunte sobre:\n- **Margens e lucratividade** por veículo ou período\n- **Saúde do estoque** e alertas de giro\n- **Despesas** por categoria\n- **Performance** de vendedores\n- **Comparativos** mensais\n\nComo posso ajudar?',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (content: string) => {
    if (!content.trim() || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.reply || data.error || 'Erro ao processar.',
          dashboard: data.dashboard,
        },
      ])
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: `❌ Erro de conexão. Tente novamente. (${err?.message ?? 'network error'})` },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Chat IA
        </h1>
        <p className="text-foreground-muted text-sm mt-1">Análise de dados com dashboards interativos em tempo real</p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {quickActions.map(({ icon: Icon, label, query }) => (
          <button
            key={label}
            onClick={() => send(query)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background-elevated border border-border text-xs text-foreground-muted hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all duration-200 disabled:opacity-50"
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 rounded-2xl border border-border bg-background-paper p-4 mb-4">
        <div className="space-y-5">
          {messages.map((msg) => (
            <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>
              {/* Avatar */}
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
                msg.role === 'assistant' ? 'bg-primary/20 text-primary' : 'bg-background-elevated text-foreground-muted'
              )}>
                {msg.role === 'assistant' ? '⚡' : 'EU'}
              </div>

              {/* Bubble */}
              <div className={cn(
                'rounded-2xl px-4 py-3 text-sm',
                msg.role === 'assistant'
                  ? 'bg-background-elevated border border-border rounded-bl-md flex-1'
                  : 'bg-primary/15 border border-primary/25 rounded-br-md max-w-[80%]'
              )}>
                <MarkdownBlock text={msg.content} />
                {msg.dashboard && <ChatDashboard dashboard={msg.dashboard} />}
              </div>
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs flex-shrink-0">⚡</div>
              <div className="bg-background-elevated border border-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs text-foreground-muted">Analisando dados...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-3">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pergunte sobre margens, estoque, despesas, vendas..."
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !input.trim()} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar
        </Button>
      </form>
    </div>
  )
}
