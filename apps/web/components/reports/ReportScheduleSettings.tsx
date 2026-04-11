'use client'
import { useEffect } from 'react'
import { useReportSchedule } from '@/hooks/useReportSchedule'
import type { ReportType, DeliveryConfig } from '@/types/report.types'
import { REPORT_TYPE_LABELS, WEEKDAYS, MONTHS_BR } from '@/types/report.types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, Check, Mail, Calendar, Bell } from 'lucide-react'

const ALL_TYPES: ReportType[] = ['weekly', 'monthly', 'quarterly', 'annual']

export function ReportScheduleSettings() {
  const { schedule, loading, saving, saved, error, loadSchedule, saveSchedule, setSchedule } = useReportSchedule()

  useEffect(() => { loadSchedule() }, [loadSchedule])

  function toggleType(t: ReportType) {
    const types = schedule.reportTypes.includes(t)
      ? schedule.reportTypes.filter(x => x !== t)
      : [...schedule.reportTypes, t]
    setSchedule({ ...schedule, reportTypes: types })
  }

  function setEmails(raw: string) {
    const emails = raw.split(',').map(e => e.trim()).filter(Boolean)
    setSchedule({ ...schedule, recipientEmails: emails })
  }

  function setDelivery(key: keyof DeliveryConfig, value: DeliveryConfig[keyof DeliveryConfig]) {
    setSchedule({ ...schedule, deliveryConfig: { ...schedule.deliveryConfig, [key]: value } })
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0,1,2].map(i => <div key={i} className="h-24 bg-background-elevated animate-pulse rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Enable / Disable */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Envio Automático</p>
                <p className="text-xs text-foreground-muted">Ativar envio periódico por e-mail</p>
              </div>
            </div>
            <Switch
              checked={schedule.enabled}
              onCheckedChange={v => setSchedule({ ...schedule, enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Report types */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Tipos de Relatório
          </CardTitle>
          <CardDescription className="text-xs">Selecione quais relatórios enviar automaticamente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ALL_TYPES.map(t => (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  schedule.reportTypes.includes(t)
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-background-elevated border-border text-foreground-muted hover:text-foreground'
                }`}
              >
                {REPORT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delivery config per type */}
      {schedule.reportTypes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configuração de Entrega</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {schedule.reportTypes.includes('weekly') && (
              <div className="space-y-2">
                <Label className="text-xs">Semanal — Dia de envio</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => setDelivery('weekly', { day: i })}
                      className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors ${
                        schedule.deliveryConfig.weekly?.day === i
                          ? 'bg-primary text-white'
                          : 'bg-background-elevated text-foreground-muted hover:text-foreground'
                      }`}
                    >
                      {d.slice(0,3)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {schedule.reportTypes.includes('monthly') && (
              <div className="space-y-2">
                <Label className="text-xs">Mensal — Dia do mês (1–28)</Label>
                <Input
                  type="number" min={1} max={28} className="w-24"
                  value={schedule.deliveryConfig.monthly?.day ?? 1}
                  onChange={e => setDelivery('monthly', { day: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) })}
                />
              </div>
            )}

            {schedule.reportTypes.includes('quarterly') && (
              <div className="space-y-2">
                <Label className="text-xs">Trimestral — Mês do trimestre e dia</Label>
                <div className="flex items-center gap-3">
                  <select
                    value={schedule.deliveryConfig.quarterly?.month ?? 0}
                    onChange={e => setDelivery('quarterly', { ...(schedule.deliveryConfig.quarterly ?? { day: 1 }), month: parseInt(e.target.value) })}
                    className="rounded-lg border border-border bg-background-elevated px-3 py-2 text-sm text-foreground"
                  >
                    {[0,3,6,9].map(m => (
                      <option key={m} value={m}>{MONTHS_BR[m]}</option>
                    ))}
                  </select>
                  <span className="text-foreground-muted text-sm">dia</span>
                  <Input
                    type="number" min={1} max={28} className="w-20"
                    value={schedule.deliveryConfig.quarterly?.day ?? 1}
                    onChange={e => setDelivery('quarterly', { ...(schedule.deliveryConfig.quarterly ?? { month: 0 }), day: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            )}

            {schedule.reportTypes.includes('annual') && (
              <div className="space-y-2">
                <Label className="text-xs">Anual — Mês e dia de envio</Label>
                <div className="flex items-center gap-3">
                  <select
                    value={schedule.deliveryConfig.annual?.month ?? 0}
                    onChange={e => setDelivery('annual', { ...(schedule.deliveryConfig.annual ?? { day: 1 }), month: parseInt(e.target.value) })}
                    className="rounded-lg border border-border bg-background-elevated px-3 py-2 text-sm text-foreground"
                  >
                    {MONTHS_BR.map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                  <span className="text-foreground-muted text-sm">dia</span>
                  <Input
                    type="number" min={1} max={28} className="w-20"
                    value={schedule.deliveryConfig.annual?.day ?? 1}
                    onChange={e => setDelivery('annual', { ...(schedule.deliveryConfig.annual ?? { month: 0 }), day: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recipients */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            Destinatários
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">E-mails (separados por vírgula)</Label>
            <Input
              placeholder="gerente@revenda.com.br, dono@revenda.com.br"
              value={schedule.recipientEmails.join(', ')}
              onChange={e => setEmails(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Assunto do E-mail</Label>
            <Input
              value={schedule.emailSubject}
              onChange={e => setSchedule({ ...schedule, emailSubject: e.target.value })}
              placeholder="Relatório Executivo — {dealership_name} | {period}"
            />
            <p className="text-xs text-foreground-subtle">Variáveis: {'{'}{'}'}dealership_name, {'{'}{'}'}period</p>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={schedule.includeAttachment}
              onCheckedChange={v => setSchedule({ ...schedule, includeAttachment: v })}
            />
            <Label className="text-sm cursor-pointer">Incluir relatório como anexo PDF</Label>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      {error && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">{error}</p>
      )}

      <Button
        onClick={() => saveSchedule(schedule)}
        disabled={saving}
        className="gap-2"
      >
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          : saved
          ? <><Check className="w-4 h-4" /> Salvo!</>
          : <><Save className="w-4 h-4" /> Salvar Configurações</>
        }
      </Button>
    </div>
  )
}
