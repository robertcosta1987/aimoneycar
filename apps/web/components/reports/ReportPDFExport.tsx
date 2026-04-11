'use client'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Download, FileCode } from 'lucide-react'
import type { ExecutiveReportData } from '@/types/report.types'
import { ExecutiveReportDocument } from './ExecutiveReportDocument'
import { downloadReportHTML } from '@/lib/reports/exportHtml'

interface Props {
  data: ExecutiveReportData
  onClose?: () => void
}

export function ReportPDFExport({ data, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    setTimeout(() => window.print(), 0)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-lg font-semibold">Visualizar Relatório</h2>
          <p className="text-xs text-foreground-muted mt-0.5">Exporte como HTML para ver todos os gráficos, ou imprima diretamente</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => downloadReportHTML(data)} variant="outline" className="gap-2">
            <FileCode className="w-4 h-4" />
            Exportar HTML
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Download className="w-4 h-4" />
            Imprimir / PDF
          </Button>
          {onClose && (
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          )}
        </div>
      </div>

      <ExecutiveReportDocument data={data} printRef={printRef} />
    </div>
  )
}
