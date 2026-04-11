'use client'
import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, CalendarClock, Plus, TrendingUp } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useReportData } from '@/hooks/useReportData'
import { ReportListTable } from '@/components/reports/ReportListTable'
import { ReportScheduleSettings } from '@/components/reports/ReportScheduleSettings'
import { ReportPDFExport } from '@/components/reports/ReportPDFExport'
import type { ExecutiveReport, ReportType } from '@/types/report.types'
import { REPORT_TYPE_LABELS } from '@/types/report.types'
import type { AvailablePeriod } from '@/app/api/executive-reports/available-periods/route'

const MONTHS_BR = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// Build list of last 24 months for manual fallback
function buildMonthOptions(): AvailablePeriod[] {
  const opts: AvailablePeriod[] = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    opts.push({ value, label: `${MONTHS_BR[d.getMonth()]} ${d.getFullYear()}`, salesCount: 0 })
  }
  return opts
}

export default function RelatoriosExecutivosPage() {
  const { reports, loading, generating, error, loadReports, generateReport, deleteReport, fetchReport } = useReportData()
  const [selectedType, setSelectedType] = useState<ReportType>('monthly')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [availablePeriods, setAvailablePeriods] = useState<AvailablePeriod[]>([])
  const [periodsLoading, setPeriodsLoading] = useState(true)
  const [viewReport, setViewReport] = useState<ExecutiveReport | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  useEffect(() => { loadReports() }, [loadReports])

  // Load available periods (months with data)
  useEffect(() => {
    async function load() {
      setPeriodsLoading(true)
      try {
        const res = await fetch('/api/executive-reports/available-periods')
        if (res.ok) {
          const { periods } = await res.json()
          if (periods && periods.length > 0) {
            setAvailablePeriods(periods)
            setSelectedPeriod(periods[0].value)  // default: most recent month with data
          } else {
            // No data yet — fallback to last 24 months
            const fallback = buildMonthOptions()
            setAvailablePeriods(fallback)
            setSelectedPeriod(fallback[0].value)
          }
        }
      } catch {
        const fallback = buildMonthOptions()
        setAvailablePeriods(fallback)
        setSelectedPeriod(fallback[0].value)
      } finally {
        setPeriodsLoading(false)
      }
    }
    load()
  }, [])

  const hasDataPeriods = availablePeriods.some(p => p.salesCount > 0)

  async function handleGenerate() {
    await generateReport(selectedType, selectedPeriod || undefined)
  }

  async function handleView(report: ExecutiveReport) {
    if (report.data && report.data.period) {
      setViewReport(report)
      return
    }
    setViewLoading(true)
    const full = await fetchReport(report.id)
    setViewLoading(false)
    if (full) setViewReport(full)
  }

  // Period options: periods with data shown first with count badge, then others
  const periodOptions = availablePeriods

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios Executivos</h1>
          <p className="text-foreground-muted text-sm mt-1">Análise completa da performance da revenda</p>
        </div>
      </div>

      {/* Generator card */}
      <div className="p-5 rounded-2xl border border-border bg-background-paper space-y-4">
        <p className="text-sm font-semibold text-foreground">Gerar Novo Relatório</p>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Type */}
          <div className="space-y-1 flex-shrink-0">
            <p className="text-xs text-foreground-muted">Tipo</p>
            <Select value={selectedType} onValueChange={v => setSelectedType(v as ReportType)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['weekly','monthly','quarterly','annual'] as ReportType[]).map(t => (
                  <SelectItem key={t} value={t}>{REPORT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Period selector */}
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs text-foreground-muted">
              Período
              {hasDataPeriods && (
                <span className="ml-2 text-success">• meses com dados destacados</span>
              )}
            </p>
            {periodsLoading ? (
              <div className="h-10 w-full bg-background-elevated animate-pulse rounded-lg" />
            ) : (
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Selecione o período..." />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="flex items-center gap-2">
                        {p.salesCount > 0 && (
                          <TrendingUp className="w-3 h-3 text-success flex-shrink-0" />
                        )}
                        {p.label}
                        {p.salesCount > 0 && (
                          <span className="text-xs text-foreground-muted ml-1">
                            ({p.salesCount} venda{p.salesCount !== 1 ? 's' : ''})
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Generate button */}
          <div className="space-y-1 flex-shrink-0">
            <p className="text-xs text-foreground-muted opacity-0 select-none">.</p>
            <Button
              onClick={handleGenerate}
              disabled={generating || periodsLoading || !selectedPeriod}
              className="gap-2 w-full sm:w-auto"
            >
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
                : <><Plus className="w-4 h-4" /> Gerar Relatório</>
              }
            </Button>
          </div>
        </div>

        {!hasDataPeriods && !periodsLoading && (
          <p className="text-xs text-warning">
            Nenhuma venda encontrada no banco. O relatório será gerado com os dados disponíveis do período selecionado.
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">{error}</div>
      )}

      <Tabs defaultValue="reports">
        <TabsList className="grid w-full grid-cols-2 max-w-xs">
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="w-4 h-4" />
            Relatórios
            {reports.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{reports.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2">
            <CalendarClock className="w-4 h-4" />
            Agendamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6">
          <ReportListTable
            reports={reports}
            loading={loading}
            onView={handleView}
            onDelete={deleteReport}
            onGenerate={handleGenerate}
            generating={generating}
          />
        </TabsContent>

        <TabsContent value="schedule" className="mt-6">
          <ReportScheduleSettings />
        </TabsContent>
      </Tabs>

      {/* Report viewer dialog */}
      <Dialog.Root open={!!viewReport || viewLoading} onOpenChange={open => { if (!open) setViewReport(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50 print:hidden" />
          <Dialog.Content className="fixed inset-4 md:inset-8 z-50 bg-background rounded-2xl overflow-y-auto p-6 focus:outline-none print:fixed print:inset-0 print:rounded-none print:overflow-visible">
            <Dialog.Title className="sr-only">Relatório Executivo</Dialog.Title>
            {viewLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : viewReport?.data ? (
              <ReportPDFExport data={viewReport.data} onClose={() => setViewReport(null)} />
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
