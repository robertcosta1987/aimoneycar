'use client'
import type { ExecutiveReport } from '@/types/report.types'
import { REPORT_TYPE_LABELS } from '@/types/report.types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, Trash2, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface Props {
  reports: ExecutiveReport[]
  loading: boolean
  onView:   (report: ExecutiveReport) => void
  onDelete: (id: string) => void
  onGenerate: () => void
  generating: boolean
}

export function ReportListTable({ reports, loading, onView, onDelete, onGenerate, generating }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    await onDelete(id)
    setDeletingId(null)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0,1,2].map(i => (
          <div key={i} className="h-16 bg-background-elevated animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  if (!reports.length) {
    return (
      <div className="py-16 text-center rounded-2xl border border-border bg-background-elevated">
        <p className="text-foreground-muted text-sm mb-4">Nenhum relatório gerado ainda.</p>
        <Button onClick={onGenerate} disabled={generating} className="gap-2">
          {generating && <Loader2 className="w-4 h-4 animate-spin" />}
          Gerar Primeiro Relatório
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {reports.map(r => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background-elevated border border-border hover:border-border-hover transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {REPORT_TYPE_LABELS[r.type]}
              </Badge>
              <span className="font-medium text-sm text-foreground">{r.period_label}</span>
              {r.triggered_by === 'scheduled' && (
                <Badge variant="secondary" className="text-[10px]">Automático</Badge>
              )}
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              {r.period_start} → {r.period_end} · Gerado em{' '}
              {new Date(r.generated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onView(r)}
              className="gap-1 text-xs"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">Ver</span>
            </Button>
            <button
              onClick={() => handleDelete(r.id)}
              disabled={deletingId === r.id}
              className="p-2 rounded-lg text-foreground-subtle hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              {deletingId === r.id
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Trash2 className="w-4 h-4" />
              }
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
