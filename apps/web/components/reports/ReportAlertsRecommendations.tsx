import type { AlertRecommendation } from '@/types/report.types'

interface Props { alerts: AlertRecommendation[] }

const LEVEL_STYLES = {
  red:    { bg: 'bg-danger/5 border-danger/20',   title: 'text-danger',  label: 'Crítico' },
  yellow: { bg: 'bg-warning/5 border-warning/20', title: 'text-warning', label: 'Atenção' },
  green:  { bg: 'bg-success/5 border-success/20', title: 'text-success', label: 'Destaque' },
}

export function ReportAlertsRecommendations({ alerts }: Props) {
  if (!alerts.length) {
    return (
      <section className="space-y-4 print:break-inside-avoid">
        <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
          4.8 Alertas e Recomendações
        </h2>
        <div className="p-6 rounded-xl bg-success/5 border border-success/20 text-center">
          <p className="text-success font-semibold">✅ Nenhum alerta crítico no período</p>
          <p className="text-foreground-muted text-sm mt-1">Sua operação está dentro dos parâmetros esperados.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4 print:break-inside-avoid">
      <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">
        4.8 Alertas e Recomendações
      </h2>

      <div className="space-y-3">
        {alerts.map((alert, i) => {
          const style = LEVEL_STYLES[alert.level]
          return (
            <div key={i} className={`p-4 rounded-xl border ${style.bg}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{alert.icon}</span>
                <div>
                  <p className={`font-semibold text-sm ${style.title}`}>
                    [{style.label}] {alert.message}
                  </p>
                  <p className="text-sm text-foreground-muted mt-1">{alert.recommendation}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
