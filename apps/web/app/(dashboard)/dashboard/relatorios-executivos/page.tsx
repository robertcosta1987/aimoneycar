'use client'
import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, CalendarClock, Plus } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useReportData } from '@/hooks/useReportData'
import { ReportListTable } from '@/components/reports/ReportListTable'
import { ReportScheduleSettings } from '@/components/reports/ReportScheduleSettings'
import { ReportPDFExport } from '@/components/reports/ReportPDFExport'
import type { ExecutiveReport, ReportType } from '@/types/report.types'
import { REPORT_TYPE_LABELS } from '@/types/report.types'

export default function RelatoriosExecutivosPage() {
  const { reports, loading, generating, error, loadReports, generateReport, deleteReport, fetchReport } = useReportData()
  const [selectedType, setSelectedType] = useState<ReportType>('monthly')
  const [viewReport, setViewReport] = useState<ExecutiveReport | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  useEffect(() => { loadReports() }, [loadReports])

  async function handleGenerate() {
    await generateReport(selectedType)
  }

  async function handleView(report: ExecutiveReport) {
    // If data is already present (full object), show directly
    if (report.data && report.data.period) {
      setViewReport(report)
      return
    }
    // Otherwise fetch full report with data
    setViewLoading(true)
    const full = await fetchReport(report.id)
    setViewLoading(false)
    if (full) setViewReport(full)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios Executivos</h1>
          <p className="text-foreground-muted text-sm mt-1">Análise completa da performance da revenda</p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              : <><Plus className="w-4 h-4" /> Gerar</>
            }
          </Button>
        </div>
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
