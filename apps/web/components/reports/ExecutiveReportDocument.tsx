'use client'
import type { ExecutiveReportData } from '@/types/report.types'
import { ReportCoverHeader } from './ReportCoverHeader'
import { ReportFinancialOverview } from './ReportFinancialOverview'
import { ReportSalesPerformance } from './ReportSalesPerformance'
import { ReportInventoryHealth } from './ReportInventoryHealth'
import { ReportExpenseBreakdown } from './ReportExpenseBreakdown'
import { ReportFinancingOverview } from './ReportFinancingOverview'
import { ReportOperationalMetrics } from './ReportOperationalMetrics'
import { ReportAlertsRecommendations } from './ReportAlertsRecommendations'

interface Props {
  data: ExecutiveReportData
  printRef?: React.RefObject<HTMLDivElement>
}

export function ExecutiveReportDocument({ data, printRef }: Props) {
  return (
    <div
      ref={printRef}
      id="executive-report-print"
      className="space-y-10 print:space-y-8 print:text-black"
    >
      <ReportCoverHeader data={data} />
      <ReportFinancialOverview data={data.financial} />
      <ReportSalesPerformance data={data.sales} />
      <ReportInventoryHealth data={data.inventory} />
      <ReportExpenseBreakdown data={data.expenses} />
      <ReportFinancingOverview data={data.financing} />
      <ReportOperationalMetrics data={data.operational} />
      <ReportAlertsRecommendations alerts={data.alerts} />

      {/* Footer */}
      <footer className="pt-6 border-t border-border text-center print:block">
        <p className="text-xs text-foreground-subtle">
          Relatório gerado automaticamente pelo <strong>Moneycar AI</strong> ·{' '}
          {data.dealershipName} · {new Date(data.generatedAt).toLocaleDateString('pt-BR')}
        </p>
        <p className="text-xs text-foreground-subtle mt-1">
          Este documento é confidencial e destinado exclusivamente ao uso interno da revenda.
        </p>
      </footer>

      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          #executive-report-print { font-size: 11pt; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:break-after-page  { break-after: page; }
        }
      `}</style>
    </div>
  )
}
