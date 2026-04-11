import { ReportPayload, ReportType } from '@/types/reports'

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function pct(v: number) { return `${v.toFixed(1)}%` }

const TITLE_MAP: Record<ReportType, string> = {
  sales_overview: 'Visão Geral de Vendas',
  inventory_health: 'Saúde do Estoque',
  margin_analysis: 'Análise de Margens',
  expense_breakdown: 'Breakdown de Despesas',
  salesperson_performance: 'Performance por Vendedor',
  monthly_comparison: 'Comparativo Mensal',
  lead_funnel: 'Funil de Leads',
}

export function buildReportEmail(payload: ReportPayload, chartUrls: string[]): {
  subject: string
  html: string
} {
  const title = TITLE_MAP[payload.tipo]
  const dateLabel = new Date(payload.generated_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const subject = `Moneycar AI — ${title} · ${dateLabel}`

  const kpiHtml = buildKpiSection(payload)
  const insightsHtml = buildInsightsSection(payload.insights)
  const chartsHtml = chartUrls.map(url =>
    `<img src="${url}" style="max-width:100%;border-radius:12px;margin-bottom:16px;" alt="Gráfico" />`
  ).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0D1117;font-family:'Segoe UI',Arial,sans-serif;color:#E2E8F0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1117;padding:24px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#111820;border-radius:16px 16px 0 0;padding:28px 32px;border-bottom:1px solid #1E2A3A;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:20px;font-weight:700;color:#E2E8F0;">Moneycar</span>
                  <span style="font-size:20px;font-weight:700;color:#00D9FF;"> AI</span>
                  <p style="margin:4px 0 0;font-size:13px;color:#8B9EB3;">${payload.dealership_name}</p>
                </td>
                <td align="right">
                  <span style="background:#00D9FF15;color:#00D9FF;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid #00D9FF30;">${title}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Period label -->
        <tr>
          <td style="background:#111820;padding:16px 32px 0;">
            <p style="margin:0;font-size:12px;color:#8B9EB3;">
              Período: últimos ${payload.periodo_dias} dias · Gerado em ${dateLabel}
            </p>
          </td>
        </tr>

        <!-- KPIs -->
        ${kpiHtml}

        <!-- Charts -->
        ${chartsHtml ? `
        <tr>
          <td style="background:#111820;padding:8px 32px 0;">
            ${chartsHtml}
          </td>
        </tr>` : ''}

        <!-- AI Insights -->
        ${insightsHtml}

        <!-- Footer -->
        <tr>
          <td style="background:#0D1117;border-radius:0 0 16px 16px;padding:20px 32px;border-top:1px solid #1E2A3A;">
            <p style="margin:0;font-size:11px;color:#4A5568;text-align:center;">
              Moneycar AI · Relatório automático · Não responda este e-mail
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}

function buildKpiSection(payload: ReportPayload): string {
  const d = payload.data as Record<string, unknown>

  let kpis: Array<{ label: string; value: string; color?: string }> = []

  if (payload.tipo === 'sales_overview') {
    kpis = [
      { label: 'Faturamento', value: currency(Number(d.revenue ?? 0)), color: '#00D9FF' },
      { label: 'Lucro Líquido', value: currency(Number(d.profit ?? 0)), color: '#00E676' },
      { label: 'Veículos Vendidos', value: String(d.count ?? 0), color: '#00D9FF' },
      { label: 'Margem Média', value: pct(Number(d.avgMargin ?? 0)), color: Number(d.avgMargin ?? 0) >= 12 ? '#00E676' : '#FFB800' },
    ]
  } else if (payload.tipo === 'inventory_health') {
    kpis = [
      { label: 'Total em Estoque', value: String(d.total ?? 0) },
      { label: 'Saudável (0–30d)', value: String(d.healthy ?? 0), color: '#00E676' },
      { label: 'Atenção (31–60d)', value: String(d.warning ?? 0), color: '#FFB800' },
      { label: 'Crítico (+60d)', value: String(d.critical ?? 0), color: '#FF5252' },
    ]
  } else if (payload.tipo === 'expense_breakdown') {
    kpis = [
      { label: 'Total Despesas', value: currency(Number(d.total ?? 0)), color: '#FF5252' },
      { label: 'Categorias', value: String(d.categoryCount ?? 0) },
      { label: 'Lançamentos', value: String(d.entryCount ?? 0) },
    ]
  } else if (payload.tipo === 'margin_analysis') {
    kpis = [
      { label: 'Margem Média', value: pct(Number(d.avgMargin ?? 0)) },
      { label: 'Melhor Margem', value: pct(Number(d.bestMargin ?? 0)), color: '#00E676' },
      { label: 'Pior Margem', value: pct(Number(d.worstMargin ?? 0)), color: '#FF5252' },
    ]
  } else if (payload.tipo === 'monthly_comparison') {
    kpis = [
      { label: 'Receita Atual', value: currency(Number(d.currentRevenue ?? 0)) },
      { label: 'Receita Anterior', value: currency(Number(d.prevRevenue ?? 0)) },
      { label: 'Variação Lucro', value: pct(Number(d.profitChange ?? 0)), color: Number(d.profitChange ?? 0) >= 0 ? '#00E676' : '#FF5252' },
      { label: 'Vendas Atuais', value: String(d.currentCount ?? 0) },
    ]
  } else if (payload.tipo === 'salesperson_performance') {
    kpis = [
      { label: 'Total Vendas', value: String(d.totalSales ?? 0) },
      { label: 'Melhor Vendedor', value: String(d.topName ?? '—') },
      { label: 'Receita Total', value: currency(Number(d.totalRevenue ?? 0)) },
    ]
  } else if (payload.tipo === 'lead_funnel') {
    kpis = [
      { label: 'Leads Recebidos', value: String(d.leads ?? 0) },
      { label: 'Agendamentos', value: String(d.bookings ?? 0) },
      { label: 'Taxa Conversão', value: pct(Number(d.conversionRate ?? 0)) },
    ]
  }

  if (!kpis.length) return ''

  const cells = kpis.map(k => `
    <td style="padding:0 8px;text-align:center;">
      <div style="background:#1A2332;border-radius:12px;padding:16px 12px;">
        <p style="margin:0;font-size:11px;color:#8B9EB3;">${k.label}</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${k.color ?? '#E2E8F0'};">${k.value}</p>
      </div>
    </td>`).join('')

  return `
    <tr>
      <td style="background:#111820;padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>${cells}</tr>
        </table>
      </td>
    </tr>`
}

function buildInsightsSection(insights: string[]): string {
  if (!insights.length) return ''
  const items = insights.map(i => `
    <tr>
      <td style="padding:6px 0;">
        <div style="background:#1A2332;border-left:3px solid #00D9FF;border-radius:0 8px 8px 0;padding:10px 14px;">
          <p style="margin:0;font-size:13px;color:#E2E8F0;">${i}</p>
        </div>
      </td>
    </tr>`).join('')

  return `
    <tr>
      <td style="background:#111820;padding:8px 32px 24px;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#8B9EB3;">💡 Insights da IA</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${items}
        </table>
      </td>
    </tr>`
}
