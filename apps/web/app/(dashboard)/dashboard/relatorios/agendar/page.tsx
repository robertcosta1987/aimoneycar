'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, Plus, Trash2, Send, ToggleLeft, ToggleRight, Loader2, Clock, Mail, CalendarDays
} from 'lucide-react'
import Link from 'next/link'
import { ScheduledReport, REPORT_TEMPLATES } from '@/types/reports'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const FREQ_LABEL: Record<string, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' }

const DEFAULT_FORM = {
  name: '',
  tipo: '',
  frequencia: 'weekly' as 'daily' | 'weekly' | 'monthly',
  dia_semana: 1,
  dia_mes: 1,
  hora: '08:00',
  destinatarios: '',
  periodo_dias: 30,
}

export default function AgendarRelatorioPage() {
  const router = useRouter()
  const supabase = createClient()
  const [reports, setReports] = useState<ScheduledReport[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [dealershipId, setDealershipId] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => { loadReports() }, [])

  async function loadReports() {
    setLoading(true)
    const { data: userData } = await supabase.from('users').select('dealership_id').single()
    setDealershipId(userData?.dealership_id ?? '')

    const { data } = await supabase
      .from('relatorios_agendados')
      .select('*')
      .eq('dealership_id', userData?.dealership_id)
      .order('created_at', { ascending: false })

    setReports(data ?? [])
    setLoading(false)
  }

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.tipo || !form.name || !form.destinatarios.trim()) return
    setSaving(true)

    const emails = form.destinatarios.split(',').map(e => e.trim()).filter(Boolean)
    const row: Record<string, unknown> = {
      dealership_id: dealershipId,
      name: form.name,
      tipo: form.tipo,
      frequencia: form.frequencia,
      hora: form.hora,
      destinatarios: emails,
      periodo_dias: form.periodo_dias,
      ativo: true,
    }
    if (form.frequencia === 'weekly') row.dia_semana = form.dia_semana
    if (form.frequencia === 'monthly') row.dia_mes = form.dia_mes

    const { error } = await supabase.from('relatorios_agendados').insert(row)
    if (!error) {
      setShowForm(false)
      setForm(DEFAULT_FORM)
      await loadReports()
      setFeedback('Relatório agendado com sucesso!')
      setTimeout(() => setFeedback(''), 3000)
    } else {
      setFeedback('Erro ao salvar: ' + error.message)
    }
    setSaving(false)
  }

  async function toggleActive(rel: ScheduledReport) {
    await supabase
      .from('relatorios_agendados')
      .update({ ativo: !rel.ativo })
      .eq('id', rel.id)
    setReports(prev => prev.map(r => r.id === rel.id ? { ...r, ativo: !r.ativo } : r))
  }

  async function handleDelete(id: string) {
    await supabase.from('relatorios_agendados').delete().eq('id', id)
    setReports(prev => prev.filter(r => r.id !== id))
  }

  async function handleSendNow(id: string) {
    setSending(id)
    setFeedback('')
    try {
      const res = await fetch('/api/reports/send-scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatorio_id: id }),
      })
      if (res.ok) {
        setFeedback('Relatório enviado com sucesso!')
      } else {
        const err = await res.json()
        setFeedback('Erro ao enviar: ' + (err.error ?? res.status))
      }
    } catch {
      setFeedback('Erro de conexão')
    }
    setSending(null)
    setTimeout(() => setFeedback(''), 4000)
  }

  const template = REPORT_TEMPLATES.find(t => t.tipo === form.tipo)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/relatorios">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Relatórios Agendados</h1>
          <p className="text-foreground-muted text-sm mt-1">Envie relatórios por e-mail automaticamente</p>
        </div>
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl text-sm font-medium ${
          feedback.startsWith('Erro') ? 'bg-danger/10 text-danger border border-danger/20' : 'bg-success/10 text-success border border-success/20'
        }`}>
          {feedback}
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Agendamento
        </Button>
      )}

      {/* Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo Relatório Agendado</CardTitle>
            <CardDescription>Configure o relatório, frequência e destinatários</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label>Nome do agendamento</Label>
              <Input
                placeholder="Ex: Relatório semanal de vendas"
                value={form.name}
                onChange={e => set('name', e.target.value)}
              />
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Relatório</Label>
              <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TEMPLATES.map(t => (
                    <SelectItem key={t.tipo} value={t.tipo}>
                      {t.icon} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template && (
                <p className="text-xs text-foreground-muted">{template.description}</p>
              )}
            </div>

            {/* Periodo */}
            <div className="space-y-2">
              <Label>Período dos dados</Label>
              <Select value={String(form.periodo_dias)} onValueChange={v => set('periodo_dias', parseInt(v))}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Frequência */}
            <div className="space-y-2">
              <Label>Frequência de envio</Label>
              <Select value={form.frequencia} onValueChange={v => set('frequencia', v)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dia semana / mes */}
            {form.frequencia === 'weekly' && (
              <div className="space-y-2">
                <Label>Dia da semana</Label>
                <div className="flex gap-2">
                  {DIAS_SEMANA.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => set('dia_semana', i)}
                      className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors ${
                        form.dia_semana === i
                          ? 'bg-primary text-white'
                          : 'bg-background-elevated text-foreground-muted hover:text-foreground'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.frequencia === 'monthly' && (
              <div className="space-y-2">
                <Label>Dia do mês</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={form.dia_mes}
                  onChange={e => set('dia_mes', parseInt(e.target.value))}
                  className="w-24"
                />
              </div>
            )}

            {/* Hora */}
            <div className="space-y-2">
              <Label>Horário de envio (BRT)</Label>
              <Input
                type="time"
                value={form.hora}
                onChange={e => set('hora', e.target.value)}
                className="w-32"
              />
            </div>

            {/* Destinatários */}
            <div className="space-y-2">
              <Label>Destinatários (separados por vírgula)</Label>
              <Input
                placeholder="email1@exemplo.com, email2@exemplo.com"
                value={form.destinatarios}
                onChange={e => set('destinatarios', e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Salvar Agendamento
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setForm(DEFAULT_FORM) }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map(i => (
            <div key={i} className="h-24 bg-background-elevated animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="w-10 h-10 text-foreground-subtle mx-auto mb-3" />
            <p className="text-sm text-foreground-muted">Nenhum relatório agendado ainda.</p>
            <p className="text-xs text-foreground-subtle mt-1">Crie seu primeiro para receber análises automáticas por e-mail.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map(rel => {
            const tmpl = REPORT_TEMPLATES.find(t => t.tipo === rel.tipo)
            return (
              <Card key={rel.id} className={rel.ativo ? '' : 'opacity-60'}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{rel.name}</span>
                        <Badge variant={rel.ativo ? 'success' : 'secondary'} className="text-[10px]">
                          {rel.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{FREQ_LABEL[rel.frequencia]}</Badge>
                      </div>

                      <p className="text-xs text-foreground-muted mt-1">
                        {tmpl?.icon} {tmpl?.label} · últimos {rel.periodo_dias} dias
                      </p>

                      <div className="flex items-center gap-4 mt-2 text-xs text-foreground-subtle">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {rel.frequencia === 'weekly'
                            ? `${DIAS_SEMANA[rel.dia_semana ?? 1]}s às ${rel.hora}`
                            : rel.frequencia === 'monthly'
                            ? `Dia ${rel.dia_mes} às ${rel.hora}`
                            : `Diariamente às ${rel.hora}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {rel.destinatarios.length} destinatário{rel.destinatarios.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Enviar agora"
                        disabled={sending === rel.id}
                        onClick={() => handleSendNow(rel.id)}
                        className="gap-1 text-xs"
                      >
                        {sending === rel.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Send className="w-4 h-4" />}
                      </Button>
                      <button
                        onClick={() => toggleActive(rel)}
                        title={rel.ativo ? 'Desativar' : 'Ativar'}
                        className="text-foreground-muted hover:text-primary transition-colors"
                      >
                        {rel.ativo
                          ? <ToggleRight className="w-5 h-5 text-primary" />
                          : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => handleDelete(rel.id)}
                        className="text-foreground-subtle hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
