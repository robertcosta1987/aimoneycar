'use client'
import { useState } from 'react'
import {
  MessageSquare, Copy, Check, ExternalLink, Code2,
  Users, Calendar, ThumbsUp, Flame, Minus, RefreshCw
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Conversation {
  id: string
  lead_nome: string | null
  lead_telefone: string | null
  lead_email: string | null
  qualificado: boolean
  temperatura: string | null
  convertido: boolean
  dados_qualificacao: Record<string, any>
  started_at: string
  agendamento_id: string | null
}

interface Props {
  dealershipName: string
  slug: string
  baseUrl: string
  conversations: Conversation[]
}

const TEMP_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  quente: { label: 'Quente',     color: 'bg-red-500/10 text-red-400 border-red-500/20',     icon: Flame },
  morno:  { label: 'Morno',      color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: Minus },
  frio:   { label: 'Frio',       color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',   icon: Minus },
}

export function ChatClientesClient({ dealershipName, slug, baseUrl, conversations }: Props) {
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'preview' | 'leads'>('preview')

  const embedCode = `<script
  src="${baseUrl}/widget.js"
  data-dealership="${slug}"
  data-color="#00D9FF"
  data-greeting="Olá! Posso ajudar a encontrar seu próximo carro? 🚗"
></script>`

  async function copyCode() {
    await navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const stats = {
    total: conversations.length,
    qualified: conversations.filter(c => c.qualificado).length,
    converted: conversations.filter(c => c.convertido).length,
    hot: conversations.filter(c => c.temperatura === 'quente').length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Chat dos Clientes</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Widget de atendimento para o site da <strong>{dealershipName}</strong>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Conversas',   value: stats.total,     color: 'text-primary',  icon: MessageSquare },
          { label: 'Qualificados', value: stats.qualified, color: 'text-warning',  icon: ThumbsUp },
          { label: 'Agendaram',   value: stats.converted, color: 'text-success',  icon: Calendar },
          { label: 'Leads quentes', value: stats.hot,     color: 'text-danger',   icon: Flame },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl bg-background-elevated flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-foreground-muted leading-tight">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-background-elevated rounded-xl w-fit">
        {(['preview', 'leads'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t
                ? 'bg-background-paper text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            )}
          >
            {t === 'preview' ? '🖥️ Preview & Código' : `👥 Leads (${stats.total})`}
          </button>
        ))}
      </div>

      {tab === 'preview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Preview iframe */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Preview ao vivo
              </CardTitle>
              <a
                href={`${baseUrl}/api/widget/${slug}/preview`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7">
                  <ExternalLink className="w-3 h-3" />
                  Abrir em nova aba
                </Button>
              </a>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative bg-background-elevated" style={{ height: 480 }}>
                <iframe
                  src={`${baseUrl}/api/widget/${slug}/preview`}
                  className="w-full h-full border-0"
                  title="Widget preview"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              </div>
              <p className="text-xs text-foreground-muted text-center py-2 border-t border-border">
                Clique no botão no canto inferior direito para testar o chat
              </p>
            </CardContent>
          </Card>

          {/* Embed code */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-primary" />
                  Código de incorporação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground-muted">
                  Cole este código antes do fechamento da tag{' '}
                  <code className="text-xs bg-background-elevated px-1.5 py-0.5 rounded text-primary">&lt;/body&gt;</code>{' '}
                  no site da revenda:
                </p>

                <div className="relative">
                  <pre className="bg-background-elevated rounded-xl p-4 text-xs text-foreground overflow-x-auto font-mono leading-relaxed border border-border">
                    <code>{embedCode}</code>
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyCode}
                    className={cn(
                      'absolute top-2 right-2 h-7 gap-1.5 text-xs transition-colors',
                      copied && 'text-success'
                    )}
                  >
                    {copied
                      ? <><Check className="w-3 h-3" /> Copiado!</>
                      : <><Copy className="w-3 h-3" /> Copiar</>
                    }
                  </Button>
                </div>

                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Parâmetros opcionais</p>
                  {[
                    { attr: 'data-color', desc: 'Cor principal do widget (hex)', example: '#00D9FF' },
                    { attr: 'data-position', desc: 'Posição: bottom-right ou bottom-left', example: 'bottom-right' },
                    { attr: 'data-greeting', desc: 'Mensagem de boas-vindas', example: 'Olá! Como posso ajudar?' },
                  ].map(p => (
                    <div key={p.attr} className="flex items-start gap-2 text-xs">
                      <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">{p.attr}</code>
                      <span className="text-foreground-muted">{p.desc} <span className="text-foreground-subtle">(padrão: {p.example})</span></span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  ✅ Funcionalidades do widget
                </p>
                <ul className="space-y-1 text-sm text-foreground-muted">
                  <li>• Busca veículos do estoque em tempo real</li>
                  <li>• Verifica horários disponíveis na agenda</li>
                  <li>• Agenda visitas e test drives automaticamente</li>
                  <li>• Qualifica leads (orçamento, pagamento, troca)</li>
                  <li>• Histórico de conversas no dashboard</li>
                  <li>• Funciona em mobile e desktop</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* Leads tab */
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Leads do Widget
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7" onClick={() => window.location.reload()}>
              <RefreshCw className="w-3 h-3" />
              Atualizar
            </Button>
          </CardHeader>
          <CardContent>
            {conversations.length === 0 ? (
              <div className="py-16 text-center">
                <MessageSquare className="w-10 h-10 text-foreground-subtle mx-auto mb-3" />
                <p className="text-foreground-muted font-medium">Nenhuma conversa ainda</p>
                <p className="text-xs text-foreground-subtle mt-1">
                  Os leads do widget aparecerão aqui após a instalação no site.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map(conv => {
                  const temp = conv.temperatura ? TEMP_CONFIG[conv.temperatura] : null
                  const TempIcon = temp?.icon || Minus
                  const q = conv.dados_qualificacao || {}
                  return (
                    <div
                      key={conv.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-background-elevated hover:bg-background-hover transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
                        {(conv.lead_nome || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">
                            {conv.lead_nome || 'Visitante anônimo'}
                          </p>
                          {temp && (
                            <Badge className={cn('text-xs border gap-1', temp.color)}>
                              <TempIcon className="w-3 h-3" />
                              {temp.label}
                            </Badge>
                          )}
                          {conv.convertido && (
                            <Badge className="text-xs border bg-success/10 text-success border-success/20 gap-1">
                              <Calendar className="w-3 h-3" />
                              Agendou
                            </Badge>
                          )}
                          {conv.qualificado && !conv.convertido && (
                            <Badge className="text-xs border bg-primary/10 text-primary border-primary/20 gap-1">
                              <ThumbsUp className="w-3 h-3" />
                              Qualificado
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-foreground-muted flex-wrap">
                          {conv.lead_telefone && <span>📱 {conv.lead_telefone}</span>}
                          {conv.lead_email && <span>✉️ {conv.lead_email}</span>}
                          {q.forma_pagamento && (
                            <span>💳 {q.forma_pagamento === 'avista' ? 'À vista' : q.forma_pagamento === 'financiamento' ? 'Financiamento' : 'Consórcio'}</span>
                          )}
                          {q.orcamento_max && (
                            <span>💰 até R$ {Number(q.orcamento_max).toLocaleString('pt-BR')}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-foreground-subtle flex-shrink-0">
                        {new Date(conv.started_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
