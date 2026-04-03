'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Loader2, Car, TrendingUp, Receipt, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const quickActions = [
  { icon: Car, label: 'Quais veículos baixar o preço?', query: 'Quais veículos eu deveria baixar o preço agora?' },
  { icon: TrendingUp, label: 'Análise de margem do mês', query: 'Qual é a análise de margem das minhas vendas este mês?' },
  { icon: Receipt, label: 'Despesas acima da média', query: 'Quais categorias de despesa estão acima da média?' },
  { icon: Clock, label: 'Estoque parado há mais tempo', query: 'Quais veículos estão há mais tempo no estoque?' },
]

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Olá! 👋 Sou o assistente IA da Moneycar. Analiso os dados da sua revenda em tempo real.\n\nPosso ajudar com:\n- **Alertas de estoque** parado\n- **Análise de margem** por veículo\n- **Despesas** acima da média\n- **Sugestões de precificação**\n\nComo posso ajudar hoje?',
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
        body: JSON.stringify({ messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: data.reply || data.error || 'Erro ao processar.' }])
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: '❌ Erro de conexão. Tente novamente.' }])
    } finally {
      setLoading(false)
    }
  }

  // Simple markdown renderer
  const renderContent = (text: string) => {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: bold || '&nbsp;' }} />
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Chat IA
        </h1>
        <p className="text-foreground-muted text-sm mt-1">Analise dados e tome decisões com inteligência artificial</p>
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
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}
            >
              {/* Avatar */}
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                msg.role === 'assistant' ? 'bg-primary/20 text-primary' : 'bg-background-elevated text-foreground-muted'
              )}>
                {msg.role === 'assistant' ? '🤖' : 'EU'}
              </div>

              {/* Bubble */}
              <div className={cn(
                'max-w-[80%] rounded-2xl px-4 py-3 text-sm space-y-1',
                msg.role === 'assistant'
                  ? 'bg-background-elevated border border-border rounded-bl-md'
                  : 'bg-primary/20 border border-primary/30 rounded-br-md'
              )}>
                {renderContent(msg.content)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs">🤖</div>
              <div className="bg-background-elevated border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="flex gap-3"
      >
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pergunte sobre sua revenda..."
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
