'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle, Send, Search, Phone, User, Clock,
  CheckCheck, Check, AlertCircle, ArrowLeft, Settings, RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface Conversa {
  id: string
  dealership_id: string
  telefone: string
  telefone_limpo: string
  nome_contato: string | null
  remote_jid: string | null
  status: string
  ultima_mensagem_em: string | null
  total_mensagens: number
  ultima_intencao: string | null
  criado_em: string
}

interface Mensagem {
  id: string
  conversa_id: string
  direcao: 'entrada' | 'saida'
  tipo: string
  conteudo: string
  status: string
  criado_em: string
  enviado_em: string | null
  erro: string | null
}

// ── Status helpers ────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string }> = {
  ativo:              { label: 'Ativo',            color: 'bg-success/20 text-success' },
  encerrado:          { label: 'Encerrado',         color: 'bg-foreground-muted/20 text-foreground-muted' },
  aguardando_humano:  { label: 'Aguarda humano',    color: 'bg-warning/20 text-warning' },
}

function formatRelTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60)    return 'agora'
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [dealershipId, setDealershipId]       = useState<string | null>(null)
  const [conversations, setConversations]     = useState<Conversa[]>([])
  const [selectedId, setSelectedId]           = useState<string | null>(null)
  const [messages, setMessages]               = useState<Mensagem[]>([])
  const [loadingConvs, setLoadingConvs]       = useState(true)
  const [loadingMsgs, setLoadingMsgs]         = useState(false)
  const [sending, setSending]                 = useState(false)
  const [newMessage, setNewMessage]           = useState('')
  const [search, setSearch]                   = useState('')
  const [statusFilter, setStatusFilter]       = useState('all')
  const [showThread, setShowThread]           = useState(false)  // mobile nav

  const supabase  = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollMsgsRef = useRef<ReturnType<typeof setInterval>>()

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('users').select('dealership_id').single()
      setDealershipId(data?.dealership_id ?? null)
    }
    init()
  }, [])

  // ── Load conversations ─────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!dealershipId) return
    const res = await fetch(`/api/whatsapp/conversations?dealershipId=${dealershipId}&limit=50`)
    if (!res.ok) return
    const json = await res.json()
    setConversations(json.conversations ?? [])
    setLoadingConvs(false)
  }, [dealershipId])

  useEffect(() => {
    if (!dealershipId) return
    loadConversations()
    const interval = setInterval(loadConversations, 30_000)
    return () => clearInterval(interval)
  }, [dealershipId, loadConversations])

  // ── Load messages for selected conversation ────────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true)
    const res = await fetch(`/api/whatsapp/conversations/${convId}?limit=80`)
    if (!res.ok) { setLoadingMsgs(false); return }
    const json = await res.json()
    setMessages(json.messages ?? [])
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    if (pollMsgsRef.current) clearInterval(pollMsgsRef.current)
    if (!selectedId) return

    loadMessages(selectedId)
    pollMsgsRef.current = setInterval(() => loadMessages(selectedId), 8_000)
    return () => { if (pollMsgsRef.current) clearInterval(pollMsgsRef.current) }
  }, [selectedId, loadMessages])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Select conversation ────────────────────────────────────────────────────
  const selectConversation = (id: string) => {
    setSelectedId(id)
    setShowThread(true)
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    const msg = newMessage.trim()
    if (!msg || !selectedId || sending) return

    setSending(true)
    setNewMessage('')

    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversaId: selectedId, message: msg }),
    })

    setSending(false)
    if (res.ok) {
      await loadMessages(selectedId)
      await loadConversations()
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredConvs = conversations.filter(c => {
    const name  = (c.nome_contato ?? c.telefone ?? '').toLowerCase()
    const phone = (c.telefone ?? '').toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) || phone.includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const selectedConv = conversations.find(c => c.id === selectedId)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-2xl border border-border bg-background-paper">

      {/* ── LEFT: Conversations list ──────────────────────────────────────── */}
      <div className={cn(
        'flex flex-col w-full md:w-80 lg:w-96 border-r border-border flex-shrink-0',
        showThread && 'hidden md:flex'
      )}>
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              <h1 className="font-bold text-foreground">WhatsApp</h1>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={loadConversations}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Link href="/dashboard/whatsapp/configurar">
                <Button variant="ghost" size="sm">
                  <Settings className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-foreground-muted" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar contato..."
              className="pl-8 h-9 text-sm"
            />
          </div>
          <div className="flex gap-1 mt-2">
            {['all','ativo','aguardando_humano','encerrado'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                  statusFilter === s
                    ? 'bg-primary/20 text-primary'
                    : 'text-foreground-muted hover:text-foreground hover:bg-background-elevated'
                )}
              >
                {s === 'all' ? 'Todos' : statusConfig[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="space-y-1 p-2">
              {[0,1,2,3,4].map(i => (
                <div key={i} className="h-16 bg-background-elevated animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="p-8 text-center text-foreground-muted text-sm">
              {conversations.length === 0
                ? 'Nenhuma conversa ainda'
                : 'Nenhum resultado encontrado'}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredConvs.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 p-3 rounded-xl transition-all',
                    selectedId === c.id
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-background-elevated'
                  )}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-medium text-sm text-foreground truncate">
                        {c.nome_contato ?? c.telefone}
                      </p>
                      <span className="text-[10px] text-foreground-muted flex-shrink-0">
                        {formatRelTime(c.ultima_mensagem_em)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      {c.nome_contato && (
                        <p className="text-xs text-foreground-muted truncate">{c.telefone}</p>
                      )}
                      <div className="flex items-center gap-1 ml-auto">
                        {c.ultima_intencao && (
                          <span className="text-[10px] text-foreground-subtle truncate max-w-[80px]">
                            {c.ultima_intencao}
                          </span>
                        )}
                        {c.status !== 'ativo' && (
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', statusConfig[c.status]?.color)}>
                            {statusConfig[c.status]?.label ?? c.status}
                          </span>
                        )}
                        {c.status === 'aguardando_humano' && (
                          <AlertCircle className="w-3 h-3 text-warning" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Message thread ─────────────────────────────────────────── */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        !showThread && 'hidden md:flex'
      )}>
        {selectedConv ? (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <button
                className="md:hidden p-1 rounded-lg hover:bg-background-elevated"
                onClick={() => setShowThread(false)}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">
                  {selectedConv.nome_contato ?? selectedConv.telefone}
                </p>
                <div className="flex items-center gap-2">
                  <Phone className="w-3 h-3 text-foreground-muted" />
                  <p className="text-xs text-foreground-muted">{selectedConv.telefone}</p>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', statusConfig[selectedConv.status]?.color ?? 'bg-primary/10 text-primary')}>
                    {statusConfig[selectedConv.status]?.label ?? selectedConv.status}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadMessages(selectedConv.id)}
                  disabled={loadingMsgs}
                >
                  <RefreshCw className={cn('w-4 h-4', loadingMsgs && 'animate-spin')} />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingMsgs && messages.length === 0 ? (
                <div className="space-y-3">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                      <div className="h-10 w-48 bg-background-elevated animate-pulse rounded-2xl" />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-foreground-muted text-sm">
                  Nenhuma mensagem nesta conversa
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOut  = msg.direcao === 'saida'
                  const showTs = idx === 0 || new Date(msg.criado_em).toDateString() !== new Date(messages[idx - 1].criado_em).toDateString()
                  return (
                    <div key={msg.id}>
                      {showTs && (
                        <div className="text-center my-3">
                          <span className="text-[10px] text-foreground-muted bg-background-elevated px-2 py-1 rounded-full">
                            {new Date(msg.criado_em).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                          </span>
                        </div>
                      )}
                      <div className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[75%] px-3 py-2 rounded-2xl text-sm',
                          isOut
                            ? 'bg-primary/20 text-foreground rounded-br-sm'
                            : 'bg-background-elevated text-foreground rounded-bl-sm'
                        )}>
                          {msg.tipo !== 'texto' && (
                            <p className="text-[10px] text-foreground-muted mb-1 uppercase tracking-wide">{msg.tipo}</p>
                          )}
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.conteudo}</p>
                          <div className={cn('flex items-center gap-1 mt-1', isOut ? 'justify-end' : 'justify-start')}>
                            <span className="text-[10px] text-foreground-muted">{formatTime(msg.criado_em)}</span>
                            {isOut && (
                              msg.status === 'enviado'  ? <CheckCheck className="w-3 h-3 text-primary" /> :
                              msg.status === 'falhou'   ? <span title={msg.erro ?? ''}><AlertCircle className="w-3 h-3 text-danger" /></span> :
                                                          <Check className="w-3 h-3 text-foreground-muted" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Send box */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Digite uma mensagem..."
                  className="flex-1"
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="sm" className="px-4">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-foreground-muted mt-1.5">
                Esta mensagem será enviada pelo WhatsApp da revenda
              </p>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-semibold text-foreground mb-1">WhatsApp Clientes</h2>
            <p className="text-sm text-foreground-muted mb-4 max-w-xs">
              Selecione uma conversa para ver as mensagens ou configure a integração.
            </p>
            <Link href="/dashboard/whatsapp/configurar">
              <Button variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                Configurar integração
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
