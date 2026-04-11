'use client'
import { useState, useEffect } from 'react'
import {
  Wifi, WifiOff, RefreshCw, Copy, Check, ArrowLeft,
  MessageCircle, Brain, Clock, FileText, Key, QrCode,
  ToggleLeft, ToggleRight, AlertCircle, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ── Toggle component (no Switch available) ────────────────────────────────────
function Toggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className="text-foreground-muted hover:text-primary transition-colors"
    >
      {checked
        ? <ToggleRight className="w-8 h-8 text-primary" />
        : <ToggleLeft  className="w-8 h-8" />
      }
    </button>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface SessionData {
  configured:      boolean
  connected?:      boolean
  phone?:          string
  name?:           string
  qrCode?:         string
  qrError?:        string
  hasPersonalToken?: boolean
  sessionId?:      string
  aiEnabled?:      boolean
  modelo?:         string
  businessHours?:  { start: string; end: string }
  webhookUrl?:     string
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function WhatsAppConfigPage() {
  const [dealershipId, setDealershipId] = useState<string | null>(null)
  const [session, setSession]           = useState<SessionData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [copied, setCopied]             = useState(false)
  const [removing, setRemoving]         = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [statusMsg, setStatusMsg]       = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Setup form
  const [sessionId,  setSessionId]  = useState('')
  const [apiKey,     setApiKey]     = useState('')

  // Settings
  const [aiEnabled,  setAiEnabled]  = useState(true)
  const [modelo,     setModelo]     = useState('claude-haiku-4-5-20251001')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFim,    setHoraFim]    = useState('18:00')
  const [msgFora,    setMsgFora]    = useState('')

  const supabase = createClient()

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('users').select('dealership_id').single()
      setDealershipId(data?.dealership_id ?? null)
    }
    init()
  }, [])

  // ── Load session ───────────────────────────────────────────────────────────
  const loadSession = async (did: string) => {
    setLoading(true)
    const res = await fetch(`/api/whatsapp/session?dealershipId=${did}`)
    if (!res.ok) { setLoading(false); return }
    const data: SessionData = await res.json()
    setSession(data)
    if (data.configured) {
      setAiEnabled(data.aiEnabled ?? true)
      setModelo(data.modelo ?? 'claude-haiku-4-5-20251001')
      setHoraInicio(data.businessHours?.start ?? '08:00')
      setHoraFim(data.businessHours?.end ?? '18:00')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (dealershipId) loadSession(dealershipId)
  }, [dealershipId])

  // ── Remove session ─────────────────────────────────────────────────────────
  const handleRemove = async () => {
    if (!dealershipId) return
    setRemoving(true)
    setStatusMsg(null)

    const res = await fetch(`/api/whatsapp/session?dealershipId=${dealershipId}`, { method: 'DELETE' })
    setRemoving(false)
    setConfirmRemove(false)

    if (res.ok) {
      setSession({ configured: false })
      setSessionId('')
      setApiKey('')
    } else {
      const json = await res.json()
      setStatusMsg({ type: 'error', text: json.error ?? 'Erro ao remover configuração' })
    }
  }

  // ── Setup session ──────────────────────────────────────────────────────────
  const handleSetup = async () => {
    if (!dealershipId || !sessionId.trim() || !apiKey.trim()) return
    setSaving(true)
    setStatusMsg(null)

    const res = await fetch('/api/whatsapp/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dealershipId,
        wasenderSessionId: sessionId.trim(),
        wasenderApiKey: apiKey.trim(),
        aiEnabled, modelo,
        systemPrompt: systemPrompt || null,
        businessHoursStart: horaInicio,
        businessHoursEnd: horaFim,
        outOfHoursMessage: msgFora || null,
      }),
    })

    const json = await res.json()
    setSaving(false)

    if (res.ok) {
      setStatusMsg({ type: 'success', text: 'Sessão configurada com sucesso!' })
      await loadSession(dealershipId)
    } else {
      setStatusMsg({ type: 'error', text: json.error ?? 'Erro ao configurar sessão' })
    }
  }

  // ── Update individual settings ─────────────────────────────────────────────
  const handleSaveSettings = async () => {
    if (!dealershipId) return
    setSaving(true)
    setStatusMsg(null)

    const res = await fetch('/api/whatsapp/session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dealershipId,
        aiEnabled, modelo,
        systemPrompt: systemPrompt || null,
        businessHoursStart: horaInicio,
        businessHoursEnd: horaFim,
        outOfHoursMessage: msgFora || null,
      }),
    })

    setSaving(false)
    if (res.ok) {
      setStatusMsg({ type: 'success', text: 'Configurações salvas!' })
    } else {
      const json = await res.json()
      setStatusMsg({ type: 'error', text: json.error ?? 'Erro ao salvar' })
    }
  }

  // ── Copy webhook URL ───────────────────────────────────────────────────────
  const copyWebhook = () => {
    if (!session?.webhookUrl) return
    navigator.clipboard.writeText(session.webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="h-8 w-64 bg-background-elevated animate-pulse rounded" />
        <div className="h-48 bg-background-elevated animate-pulse rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/whatsapp">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            Configurar WhatsApp
          </h1>
          <p className="text-foreground-muted text-sm mt-0.5">
            Integração via WASenderAPI
          </p>
        </div>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div className={cn(
          'p-3 rounded-xl text-sm flex items-center gap-2',
          statusMsg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'
        )}>
          {statusMsg.type === 'error' && <AlertCircle className="w-4 h-4" />}
          {statusMsg.text}
        </div>
      )}

      {/* ── Session Status ── */}
      {session?.configured && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                {session.connected
                  ? <Wifi className="w-4 h-4 text-success" />
                  : <WifiOff className="w-4 h-4 text-danger" />
                }
                Status da Sessão
              </span>
              <Button variant="ghost" size="sm" onClick={() => loadSession(dealershipId!)}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-background-elevated">
              <Badge variant={session.connected ? 'success' : 'destructive'} className="text-xs">
                {session.connected ? 'Conectado' : 'Desconectado'}
              </Badge>
              {session.phone && <span className="text-sm text-foreground">{session.phone}</span>}
              {session.name  && <span className="text-sm text-foreground-muted">({session.name})</span>}
            </div>

            {/* QR Code */}
            {!session.connected && session.qrCode && (
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border">
                <div className="flex items-center gap-2 text-sm text-foreground-muted">
                  <QrCode className="w-4 h-4" />
                  Escaneie o QR Code com seu WhatsApp
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={session.qrCode}
                  alt="WhatsApp QR Code"
                  className="w-48 h-48 rounded-xl"
                />
                <p className="text-xs text-foreground-muted text-center">
                  Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
                </p>
              </div>
            )}

            {!session.connected && !session.qrCode && (
              <div className="space-y-2">
                {!session.hasPersonalToken ? (
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning">
                    Adicione <code className="font-mono">WASENDER_PERSONAL_TOKEN</code> ao <code className="font-mono">.env.local</code> e reinicie o servidor para exibir o QR Code aqui.
                  </div>
                ) : session.qrError ? (
                  <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">
                    Erro ao buscar QR Code: {session.qrError}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning">
                    QR Code indisponível no momento.
                  </div>
                )}
                <div className="p-3 rounded-xl bg-background-elevated text-sm text-foreground-muted">
                  Alternativamente, escaneie o QR Code diretamente no{' '}
                  <a
                    href="https://app.wasenderapi.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    painel WASenderAPI
                  </a>
                  {session.sessionId && (
                    <span> → sessão <code className="font-mono">{session.sessionId}</code></span>
                  )}
                  .
                </div>
              </div>
            )}

            {/* Remove config */}
            <div className="pt-2 border-t border-border">
              {!confirmRemove ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRemove(true)}
                  className="gap-2 text-danger border-danger/30 hover:bg-danger/10 hover:border-danger"
                >
                  <Trash2 className="w-4 h-4" />
                  Remover configuração
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground-muted">Confirmar remoção?</p>
                  <Button
                    size="sm"
                    onClick={handleRemove}
                    disabled={removing}
                    className="bg-danger hover:bg-danger/90 text-white gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {removing ? 'Removendo...' : 'Sim, remover'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmRemove(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>

            {/* Webhook URL */}
            {session.webhookUrl && (
              <div>
                <p className="text-xs text-foreground-muted mb-1">URL do Webhook (configure no painel WASenderAPI)</p>
                <div className="flex gap-2">
                  <Input
                    value={session.webhookUrl}
                    readOnly
                    className="text-xs font-mono text-foreground-muted bg-background-elevated"
                  />
                  <Button variant="outline" size="sm" onClick={copyWebhook} className="flex-shrink-0">
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Main content: setup or settings tabs ── */}
      {!session?.configured ? (
        /* Setup form */
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Conectar WASenderAPI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-foreground-muted">
              Crie uma sessão em <span className="text-primary font-medium">wasender.com</span> e cole as credenciais abaixo.
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Session ID</label>
              <Input
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
                placeholder="minha-sessao-revenda"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">API Key</label>
              <Input
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="ws_..."
                type="password"
                className="font-mono text-sm"
              />
            </div>
            <Button
              onClick={handleSetup}
              disabled={saving || !sessionId.trim() || !apiKey.trim()}
              className="w-full"
            >
              {saving ? 'Conectando...' : 'Conectar'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Settings tabs */
        <Tabs defaultValue="ai">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ai" className="gap-1.5">
              <Brain className="w-3.5 h-3.5" />IA
            </TabsTrigger>
            <TabsTrigger value="horario" className="gap-1.5">
              <Clock className="w-3.5 h-3.5" />Horário
            </TabsTrigger>
            <TabsTrigger value="prompt" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />Prompt
            </TabsTrigger>
          </TabsList>

          {/* ── AI Settings ── */}
          <TabsContent value="ai" className="mt-4">
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">Resposta automática com IA</p>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      A IA responde automaticamente mensagens recebidas
                    </p>
                  </div>
                  <Toggle checked={aiEnabled} onCheckedChange={setAiEnabled} />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Modelo padrão</label>
                  <select
                    value={modelo}
                    onChange={e => setModelo(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="claude-haiku-4-5-20251001">Claude Haiku (rápido, econômico)</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet (mais inteligente)</option>
                  </select>
                  <p className="text-xs text-foreground-muted mt-1">
                    Haiku para respostas gerais. Sonnet é ativado automaticamente para consultas complexas (financiamento, comparações).
                  </p>
                </div>

                <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Business Hours ── */}
          <TabsContent value="horario" className="mt-4">
            <Card>
              <CardContent className="pt-6 space-y-5">
                <p className="text-sm text-foreground-muted">
                  Fora deste horário, a IA envia a mensagem de ausência abaixo.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Início</label>
                    <Input
                      type="time"
                      value={horaInicio}
                      onChange={e => setHoraInicio(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Fim</label>
                    <Input
                      type="time"
                      value={horaFim}
                      onChange={e => setHoraFim(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Mensagem fora do horário
                  </label>
                  <textarea
                    value={msgFora}
                    onChange={e => setMsgFora(e.target.value)}
                    rows={3}
                    placeholder="Olá! Nosso horário de atendimento é das 08:00 às 18:00. Em breve retornaremos!"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── System Prompt ── */}
          <TabsContent value="prompt" className="mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-foreground-muted">
                  Deixe em branco para usar o prompt padrão. O prompt personalizado substitui completamente o padrão — inclua instruções sobre seu negócio, tom de voz e regras especiais.
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Prompt do sistema</label>
                  <textarea
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                    rows={10}
                    placeholder="Você é um assistente da Revenda X, especializado em veículos seminovos. Responda sempre de forma amigável e profissional..."
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
                <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
