'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Clock,
  User, Car, Phone, CheckCircle, XCircle, AlertCircle, Loader2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────

interface Appointment {
  id: string
  data_inicio: string
  data_fim: string
  lead_nome: string
  lead_telefone: string
  tipo: string
  veiculo_interesse: string
  status: string
  salesperson_id: string
  salesperson_name: string
  cor: string
  origem: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getWeekDays(baseDate: Date): Date[] {
  const start = new Date(baseDate)
  const day = start.getDay()
  start.setDate(start.getDate() - day + (day === 0 ? -6 : 1)) // start on Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7) // 07:00 – 18:00

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  agendado:       { label: 'Agendado',       color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',   icon: Clock },
  confirmado:     { label: 'Confirmado',     color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle },
  em_atendimento: { label: 'Em Atendimento', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: AlertCircle },
  concluido:      { label: 'Concluído',      color: 'bg-gray-500/10 text-gray-400 border-gray-500/20',   icon: CheckCircle },
  cancelado:      { label: 'Cancelado',      color: 'bg-red-500/10 text-red-400 border-red-500/20',      icon: XCircle },
  no_show:        { label: 'Não compareceu', color: 'bg-red-700/10 text-red-600 border-red-700/20',      icon: XCircle },
}

const TIPO_LABELS: Record<string, string> = {
  visita:          'Visita',
  test_drive:      'Test Drive',
  avaliacao_troca: 'Avaliação de Troca',
  entrega:         'Entrega',
}

function dateToISO(d: Date) {
  return d.toISOString().split('T')[0]
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── New Appointment Dialog ────────────────────────────────────────────────

function NewAppointmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    lead_nome: '', lead_telefone: '', lead_email: '',
    data_inicio: '', data_fim: '',
    tipo: 'visita', veiculo_interesse: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.lead_nome || !form.lead_telefone || !form.data_inicio) {
      setError('Preencha nome, telefone e horário de início.')
      return
    }
    setSaving(true)
    setError('')

    const startDt = new Date(form.data_inicio)
    const endDt = form.data_fim
      ? new Date(form.data_fim)
      : new Date(startDt.getTime() + 30 * 60 * 1000)

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        data_inicio: startDt.toISOString(),
        data_fim: endDt.toISOString(),
      }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok || !data.success) {
      setError(data.error || 'Erro ao criar agendamento.')
    } else {
      onSaved()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background-paper border border-border rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-foreground">Novo Agendamento</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-foreground-muted mb-1 block">Nome do cliente *</label>
              <Input value={form.lead_nome} onChange={e => set('lead_nome', e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <label className="text-xs text-foreground-muted mb-1 block">Telefone *</label>
              <Input value={form.lead_telefone} onChange={e => set('lead_telefone', e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="text-xs text-foreground-muted mb-1 block">Email</label>
              <Input type="email" value={form.lead_email} onChange={e => set('lead_email', e.target.value)} placeholder="email@..." />
            </div>
            <div>
              <label className="text-xs text-foreground-muted mb-1 block">Início *</label>
              <Input type="datetime-local" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-foreground-muted mb-1 block">Fim</label>
              <Input type="datetime-local" value={form.data_fim} onChange={e => set('data_fim', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-foreground-muted mb-1 block">Tipo</label>
              <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-foreground-muted mb-1 block">Veículo de interesse</label>
              <Input value={form.veiculo_interesse} onChange={e => set('veiculo_interesse', e.target.value)} placeholder="Ex: Gol 2020" />
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Agendar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Appointment card ──────────────────────────────────────────────────────

function AppointmentCard({ appt, onClick }: { appt: Appointment; onClick: () => void }) {
  const st = STATUS_LABELS[appt.status] || STATUS_LABELS.agendado
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-lg border text-xs space-y-1 hover:opacity-90 transition-opacity"
      style={{ borderLeftColor: appt.cor, borderLeftWidth: 3, background: appt.cor + '18' }}
    >
      <p className="font-semibold text-foreground truncate">{appt.lead_nome}</p>
      <p className="text-foreground-muted">{timeOf(appt.data_inicio)} · {TIPO_LABELS[appt.tipo] || appt.tipo}</p>
      {appt.veiculo_interesse && <p className="text-foreground-subtle truncate">{appt.veiculo_interesse}</p>}
    </button>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────

function AppointmentDetail({ appt, onClose, onStatusChange }: {
  appt: Appointment
  onClose: () => void
  onStatusChange: (id: string, status: string) => void
}) {
  const st = STATUS_LABELS[appt.status] || STATUS_LABELS.agendado
  const StatusIcon = st.icon

  async function changeStatus(newStatus: string) {
    await fetch('/api/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appt.id, status: newStatus }),
    })
    onStatusChange(appt.id, newStatus)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background-paper border border-border rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-foreground text-lg">{appt.lead_nome}</p>
            <Badge className={cn('mt-1 text-xs border', st.color)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {st.label}
            </Badge>
          </div>
          <button onClick={onClose} className="text-foreground-muted hover:text-foreground">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-foreground-muted">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>{new Date(appt.data_inicio).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {timeOf(appt.data_inicio)} – {timeOf(appt.data_fim)}</span>
          </div>
          <div className="flex items-center gap-2 text-foreground-muted">
            <Phone className="w-4 h-4 flex-shrink-0" />
            <a href={`tel:${appt.lead_telefone}`} className="hover:text-primary">{appt.lead_telefone}</a>
          </div>
          {appt.salesperson_name && (
            <div className="flex items-center gap-2 text-foreground-muted">
              <User className="w-4 h-4 flex-shrink-0" />
              <span>{appt.salesperson_name}</span>
            </div>
          )}
          {appt.veiculo_interesse && (
            <div className="flex items-center gap-2 text-foreground-muted">
              <Car className="w-4 h-4 flex-shrink-0" />
              <span>{appt.veiculo_interesse}</span>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs text-foreground-muted mb-2">Atualizar status:</p>
          <div className="flex flex-wrap gap-2">
            {['confirmado', 'em_atendimento', 'concluido', 'no_show', 'cancelado'].map(s => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={appt.status === s}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                  appt.status === s
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border text-foreground-muted hover:bg-background-elevated'
                )}
              >
                {STATUS_LABELS[s]?.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'week' | 'list'>('week')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const weekDays = getWeekDays(currentDate)
  const weekStart = weekDays[0]
  const weekEnd = weekDays[6]

  const load = useCallback(async () => {
    setLoading(true)
    const start = dateToISO(weekStart)
    const end = dateToISO(weekEnd)
    const res = await fetch(`/api/appointments?start=${start}&end=${end}`)
    const data = await res.json()
    setAppointments(data.appointments || [])
    setLoading(false)
  }, [weekStart.toDateString()])

  useEffect(() => { load() }, [load])

  function prevWeek() { setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }
  function goToday()  { setCurrentDate(new Date()) }

  function onStatusChange(id: string, newStatus: string) {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))
    setSelected(prev => prev?.id === id ? { ...prev, status: newStatus } : prev)
  }

  const filtered = statusFilter === 'all' ? appointments : appointments.filter(a => a.status === statusFilter)

  const apptsByDay = weekDays.map(day => ({
    day,
    appts: filtered.filter(a => new Date(a.data_inicio).toDateString() === day.toDateString()),
  }))

  const todayStr = new Date().toDateString()
  const total = appointments.length
  const pending = appointments.filter(a => ['agendado', 'confirmado'].includes(a.status)).length
  const today = appointments.filter(a => new Date(a.data_inicio).toDateString() === todayStr).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            {total} agendamentos · {pending} pendentes · {today} hoje
          </p>
        </div>
        <Button className="gap-2 self-start sm:self-auto" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Esta semana', value: total, color: 'text-primary' },
          { label: 'Pendentes', value: pending, color: 'text-warning' },
          { label: 'Hoje', value: today, color: 'text-success' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-foreground-muted mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevWeek}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={goToday}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={nextWeek}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <span className="text-sm font-medium text-foreground capitalize">
          {weekStart.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })} –{' '}
          {weekEnd.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['week', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  view === v ? 'bg-primary text-black' : 'text-foreground-muted hover:bg-background-elevated'
                )}
              >
                {v === 'week' ? 'Semana' : 'Lista'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-foreground-muted" />
        </div>
      ) : view === 'week' ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-border">
                {apptsByDay.map(({ day }) => {
                  const isToday = day.toDateString() === todayStr
                  return (
                    <div key={day.toISOString()} className={cn(
                      'p-3 text-center border-r border-border last:border-0',
                      isToday && 'bg-primary/5'
                    )}>
                      <p className="text-xs text-foreground-muted uppercase tracking-wide">
                        {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                      </p>
                      <p className={cn(
                        'text-lg font-bold mt-0.5',
                        isToday ? 'text-primary' : 'text-foreground'
                      )}>
                        {day.getDate()}
                      </p>
                    </div>
                  )
                })}
              </div>

              {/* Appointment columns */}
              <div className="grid grid-cols-7 divide-x divide-border min-h-[300px]">
                {apptsByDay.map(({ day, appts }) => {
                  const isToday = day.toDateString() === todayStr
                  return (
                    <div key={day.toISOString()} className={cn('p-2 space-y-1.5', isToday && 'bg-primary/5')}>
                      {appts.length === 0 ? (
                        <p className="text-[10px] text-foreground-subtle text-center pt-4">—</p>
                      ) : (
                        appts
                          .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
                          .map(appt => (
                            <AppointmentCard key={appt.id} appt={appt} onClick={() => setSelected(appt)} />
                          ))
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* List view */
        <div className="space-y-4">
          {apptsByDay.map(({ day, appts }) => {
            if (appts.length === 0) return null
            const isToday = day.toDateString() === todayStr
            return (
              <div key={day.toISOString()}>
                <p className={cn(
                  'text-sm font-semibold mb-2 capitalize',
                  isToday ? 'text-primary' : 'text-foreground-muted'
                )}>
                  {isToday ? '● Hoje · ' : ''}{day.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <div className="space-y-2">
                  {appts
                    .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
                    .map(appt => {
                      const st = STATUS_LABELS[appt.status] || STATUS_LABELS.agendado
                      const StatusIcon = st.icon
                      return (
                        <button
                          key={appt.id}
                          onClick={() => setSelected(appt)}
                          className="w-full text-left"
                        >
                          <Card className="hover:border-border-hover transition-colors">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-foreground">{appt.lead_nome}</p>
                                    <Badge className={cn('text-xs border', st.color)}>
                                      <StatusIcon className="w-3 h-3 mr-1" />
                                      {st.label}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-foreground-muted flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5" />
                                      {timeOf(appt.data_inicio)} – {timeOf(appt.data_fim)}
                                    </span>
                                    <span>{TIPO_LABELS[appt.tipo] || appt.tipo}</span>
                                    {appt.salesperson_name && (
                                      <span className="flex items-center gap-1">
                                        <User className="w-3.5 h-3.5" />
                                        {appt.salesperson_name}
                                      </span>
                                    )}
                                  </div>
                                  {appt.veiculo_interesse && (
                                    <p className="text-xs text-foreground-subtle flex items-center gap-1">
                                      <Car className="w-3 h-3" />
                                      {appt.veiculo_interesse}
                                    </p>
                                  )}
                                </div>
                                <div className="flex-shrink-0 text-right">
                                  <a
                                    href={`tel:${appt.lead_telefone}`}
                                    onClick={e => e.stopPropagation()}
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                  >
                                    <Phone className="w-3 h-3" />
                                    {appt.lead_telefone}
                                  </a>
                                  <p className="text-[10px] text-foreground-subtle mt-1 capitalize">{appt.origem}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </button>
                      )
                    })}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <Calendar className="w-10 h-10 text-foreground-subtle mx-auto mb-3" />
                <p className="text-foreground-muted font-medium">Nenhum agendamento esta semana</p>
                <p className="text-xs text-foreground-subtle mt-1">Clique em "Novo Agendamento" para adicionar.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {showNew && <NewAppointmentModal onClose={() => setShowNew(false)} onSaved={load} />}
      {selected && <AppointmentDetail appt={selected} onClose={() => setSelected(null)} onStatusChange={onStatusChange} />}
    </div>
  )
}
