import type { ExecutiveReportData } from '@/types/report.types'
import { REPORT_TYPE_LABELS } from '@/types/report.types'

interface Props {
  data: ExecutiveReportData
}

export function ReportCoverHeader({ data }: Props) {
  const { dealershipName, dealershipAddress, period, executiveSummary, generatedAt } = data
  const genDate = new Date(generatedAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="print:break-after-page">
      {/* Cover */}
      <div className="flex flex-col items-center justify-center text-center py-16 px-8 bg-gradient-to-br from-background-paper to-background-elevated rounded-2xl border border-border mb-8 print:rounded-none print:border-none print:min-h-screen print:justify-start print:pt-24">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
          <span className="text-3xl">⚡</span>
        </div>

        <h1 className="text-4xl font-extrabold text-foreground mb-2">
          Relatório Executivo
        </h1>
        <p className="text-xl font-semibold text-primary mb-1">{dealershipName}</p>
        {dealershipAddress && (
          <p className="text-sm text-foreground-muted mb-6">{dealershipAddress}</p>
        )}

        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-5 py-2 mb-8">
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
            {REPORT_TYPE_LABELS[period.type]}
          </span>
          <span className="w-1 h-1 rounded-full bg-primary/40" />
          <span className="text-sm text-foreground font-medium">{period.label}</span>
        </div>

        <div className="max-w-xl">
          <p className="text-sm text-foreground-muted leading-relaxed">{executiveSummary}</p>
        </div>

        <p className="text-xs text-foreground-subtle mt-10">
          Gerado em {genDate} · Moneycar AI
        </p>
      </div>
    </div>
  )
}
