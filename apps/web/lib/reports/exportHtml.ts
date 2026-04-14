/**
 * lib/reports/exportHtml.ts
 *
 * Generates a fully self-contained HTML file for executive reports.
 * No external dependencies — CSS-only charts, inline styles.
 * Opens in any browser and prints perfectly to PDF.
 */

import type { ExecutiveReportData, AlertRecommendation } from '@/types/report.types'

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })

const pct = (n: number) => `${n.toFixed(1)}%`

const alertColor: Record<AlertRecommendation['level'], string> = {
  red:    '#ef4444',
  yellow: '#f59e0b',
  green:  '#22c55e',
}
const alertBg: Record<AlertRecommendation['level'], string> = {
  red:    '#fef2f2',
  yellow: '#fffbeb',
  green:  '#f0fdf4',
}

function bar(value: number, max: number, color: string): string {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return `<div style="background:#e5e7eb;border-radius:4px;height:12px;width:100%;margin-top:4px">
    <div style="background:${color};width:${pct}%;height:100%;border-radius:4px"></div>
  </div>`
}

function kpiCard(label: string, value: string, sub?: string, color = '#111827'): string {
  return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px">
    <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">${label}</p>
    <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:${color}">${value}</p>
    ${sub ? `<p style="margin:4px 0 0;font-size:11px;color:#6b7280">${sub}</p>` : ''}
  </div>`
}

function section(title: string, content: string): string {
  return `<div style="margin-bottom:32px;page-break-inside:avoid">
    <h2 style="font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin:0 0 16px">${title}</h2>
    ${content}
  </div>`
}

function table(headers: string[], rows: string[][]): string {
  const ths = headers.map(h => `<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;white-space:nowrap">${h}</th>`).join('')
  const trs = rows.map((row, i) =>
    `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
      ${row.map(cell => `<td style="padding:7px 12px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6">${cell}</td>`).join('')}
    </tr>`
  ).join('')
  return `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead style="background:#f3f4f6"><tr>${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>`
}

function grid(...cards: string[]): string {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">${cards.join('')}</div>`
}

// ─── Section renderers ────────────────────────────────────────────────────────

function renderFinancial(d: ExecutiveReportData['financial']): string {
  const kpis = grid(
    kpiCard('Faturamento',   brl(d.totalRevenue),  undefined, '#111827'),
    kpiCard('Lucro Líquido', brl(d.totalProfit),   undefined, d.totalProfit >= 0 ? '#16a34a' : '#dc2626'),
    kpiCard('Despesas',      brl(d.totalExpenses), undefined, '#dc2626'),
    kpiCard('Margem Média',  pct(d.avgMargin),     undefined, d.avgMargin >= 10 ? '#16a34a' : '#f59e0b'),
    kpiCard('ROI',           pct(d.roi),           undefined, d.roi >= 0 ? '#16a34a' : '#dc2626'),
  )

  const maxRev = Math.max(...d.chartData.map(p => p.revenue), 1)
  const rows = d.chartData.map(p => [
    p.label,
    brl(p.revenue),
    brl(p.profit),
    brl(p.expenses),
    pct(p.margin),
    String(p.units),
  ])

  const chartRows = d.chartData.slice(-12).map(p =>
    `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#374151;margin-bottom:2px">
        <span>${p.label}</span><span style="font-weight:600">${brl(p.revenue)}</span>
      </div>
      ${bar(p.revenue, maxRev, '#3b82f6')}
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#6b7280;margin-top:2px">
        <span>Lucro: ${brl(p.profit)}</span><span>Margem: ${pct(p.margin)}</span>
      </div>
    </div>`
  ).join('')

  const chartSection = d.chartData.length > 0
    ? `<div style="margin-top:16px"><h3 style="font-size:13px;font-weight:600;margin:0 0 10px;color:#374151">Evolução por Período</h3>${chartRows}</div>`
    : ''

  const tbl = d.chartData.length > 0
    ? table(
        ['Período', 'Faturamento', 'Lucro', 'Despesas', 'Margem', 'Unidades'],
        rows
      )
    : '<p style="color:#6b7280;font-size:13px">Sem dados no período.</p>'

  return section('Visão Financeira', kpis + chartSection + `<div style="margin-top:16px">${tbl}</div>`)
}

function renderSales(d: ExecutiveReportData['sales']): string {
  const kpis = grid(
    kpiCard('Veículos Vendidos', String(d.totalSold)),
    kpiCard('Tempo Médio de Venda', `${d.avgDaysToSell}d`),
    d.fastestSale
      ? kpiCard('Venda Mais Rápida', `${d.fastestSale.days}d`, d.fastestSale.name, '#16a34a')
      : kpiCard('Venda Mais Rápida', '—'),
    d.slowestSale
      ? kpiCard('Venda Mais Lenta', `${d.slowestSale.days}d`, d.slowestSale.name, '#dc2626')
      : kpiCard('Venda Mais Lenta', '—'),
  )

  const topTable = d.topProfitable.length > 0
    ? `<h3 style="font-size:13px;font-weight:600;margin:16px 0 8px;color:#374151">Top 5 — Maior Lucro</h3>` +
      table(
        ['Veículo', 'Placa', 'Compra', 'Venda', 'Lucro', 'Margem', 'Dias'],
        d.topProfitable.map(v => [
          v.name, v.plate ?? '—', brl(v.purchasePrice), brl(v.salePrice),
          brl(v.profit), pct(v.margin), String(v.daysToSell),
        ])
      )
    : ''

  const btmTable = d.bottomMargin.length > 0
    ? `<h3 style="font-size:13px;font-weight:600;margin:16px 0 8px;color:#374151">Menor Margem — Atenção</h3>` +
      table(
        ['Veículo', 'Placa', 'Compra', 'Venda', 'Lucro', 'Margem', 'Dias'],
        d.bottomMargin.map(v => [
          v.name, v.plate ?? '—', brl(v.purchasePrice), brl(v.salePrice),
          brl(v.profit), `<span style="color:${v.margin < 0 ? '#dc2626' : '#f59e0b'}">${pct(v.margin)}</span>`, String(v.daysToSell),
        ])
      )
    : ''

  const maxUnits = Math.max(...(d.unitsByPeriod?.map(p => p.units) ?? [1]), 1)
  const unitsChart = d.unitsByPeriod?.length > 0
    ? `<h3 style="font-size:13px;font-weight:600;margin:16px 0 8px;color:#374151">Unidades por Período</h3>` +
      d.unitsByPeriod.map(p =>
        `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span style="font-size:11px;color:#374151;width:60px;flex-shrink:0">${p.label}</span>
          <div style="flex:1;background:#e5e7eb;border-radius:4px;height:14px">
            <div style="background:#8b5cf6;width:${Math.round((p.units / maxUnits) * 100)}%;height:100%;border-radius:4px"></div>
          </div>
          <span style="font-size:11px;color:#374151;width:20px;text-align:right">${p.units}</span>
        </div>`
      ).join('')
    : ''

  return section('Performance de Vendas', kpis + unitsChart + topTable + btmTable)
}

function renderInventory(d: ExecutiveReportData['inventory']): string {
  const kpis = grid(
    kpiCard('Em Estoque', String(d.totalInStock)),
    kpiCard('Média em Estoque', `${d.avgDaysInStock}d`),
    kpiCard('Atenção (30–60d)', String(d.attentionVehicles.length), undefined, '#f59e0b'),
    kpiCard('Críticos (+60d)', String(d.criticalVehicles.length), undefined, '#dc2626'),
  )

  const agingChart = d.agingDistribution.length > 0
    ? `<div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">` +
      d.agingDistribution.map(b =>
        `<div style="flex:1;min-width:80px;text-align:center;padding:10px 6px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px">
          <p style="margin:0;font-size:22px;font-weight:700;color:${b.color}">${b.count}</p>
          <p style="margin:4px 0 0;font-size:10px;color:#6b7280">${b.label}</p>
        </div>`
      ).join('') + '</div>'
    : ''

  const critTable = d.criticalVehicles.length > 0
    ? `<h3 style="font-size:13px;font-weight:600;margin:16px 0 8px;color:#dc2626">🔴 Veículos Críticos (+60 dias)</h3>` +
      table(
        ['Veículo', 'Placa', 'Dias', 'Preço'],
        d.criticalVehicles.map(v => [v.name, v.plate ?? '—', String(v.daysInStock), brl(v.salePrice ?? 0)])
      )
    : ''

  const attTable = d.attentionVehicles.length > 0
    ? `<h3 style="font-size:13px;font-weight:600;margin:16px 0 8px;color:#f59e0b">🟡 Veículos em Atenção (30–60 dias)</h3>` +
      table(
        ['Veículo', 'Placa', 'Dias', 'Preço'],
        d.attentionVehicles.map(v => [v.name, v.plate ?? '—', String(v.daysInStock), brl(v.salePrice ?? 0)])
      )
    : ''

  return section('Saúde do Estoque', kpis + agingChart + critTable + attTable)
}

function renderExpenses(d: ExecutiveReportData['expenses']): string {
  const kpis = grid(
    kpiCard('Total Despesas', brl(d.totalExpenses), undefined, '#dc2626'),
    kpiCard('Média por Venda', brl(d.avgPerVehicleSold)),
    d.largestItem
      ? kpiCard('Maior Item', brl(d.largestItem.amount), d.largestItem.description.slice(0, 30))
      : kpiCard('Maior Item', '—'),
  )

  const maxCat = Math.max(...d.byCategory.map(c => c.total), 1)
  const catChart = d.byCategory.map(c =>
    `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-bottom:2px">
        <span>${c.category}</span>
        <span style="font-weight:600">${brl(c.total)} <span style="font-weight:400;color:#6b7280">(${pct(c.percentage)})</span></span>
      </div>
      ${bar(c.total, maxCat, '#f59e0b')}
    </div>`
  ).join('')

  const catTable = d.byCategory.length > 0
    ? `<div style="margin-top:16px">` +
      table(
        ['Categoria', 'Total', '% do Total', 'Lançamentos'],
        d.byCategory.map(c => [c.category, brl(c.total), pct(c.percentage), String(c.count)])
      ) + '</div>'
    : ''

  return section('Despesas', kpis + `<div style="margin-top:12px">${catChart}</div>` + catTable)
}

function renderFinancing(d: ExecutiveReportData['financing']): string {
  const finPct = d.totalContracts > 0
    ? ((d.totalContracts - d.cashCount) / d.totalContracts) * 100
    : 0

  const kpis = grid(
    kpiCard('Total Contratos', String(d.totalContracts)),
    kpiCard('Volume Financiado', brl(d.totalFinancedAmount)),
    kpiCard('À Vista', String(d.cashCount), brl(d.cashAmount)),
    kpiCard('% Financiado', pct(finPct)),
  )

  const bankTable = d.byBank.length > 0
    ? table(
        ['Banco', 'Contratos', 'Volume Total'],
        d.byBank.map(b => [b.bank, String(b.count), brl(b.totalAmount)])
      )
    : '<p style="color:#6b7280;font-size:13px">Sem dados de financiamento.</p>'

  return section('Financiamentos', kpis + `<div style="margin-top:12px">${bankTable}</div>`)
}

function renderOperational(d: ExecutiveReportData['operational']): string {
  const kpis = grid(
    kpiCard('Taxa de Giro', d.turnoverRate.toFixed(2)),
    d.bestPeriod?.label
      ? kpiCard('Melhor Período', d.bestPeriod.label, `${d.bestPeriod.units} unidades`)
      : kpiCard('Melhor Período', '—'),
  )

  const maxInflow = Math.max(...(d.inflow?.map(p => Math.max(p.acquired, p.sold)) ?? [1]), 1)
  const inflowChart = d.inflow?.length > 0
    ? `<h3 style="font-size:13px;font-weight:600;margin:16px 0 8px;color:#374151">Entrada vs. Saída</h3>` +
      d.inflow.map(p =>
        `<div style="margin-bottom:8px">
          <div style="font-size:11px;color:#374151;margin-bottom:3px">${p.label}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="font-size:10px;color:#3b82f6;width:48px">Entrada</span>
            <div style="flex:1;background:#e5e7eb;border-radius:3px;height:10px">
              <div style="background:#3b82f6;width:${Math.round((p.acquired / maxInflow) * 100)}%;height:100%;border-radius:3px"></div>
            </div>
            <span style="font-size:10px;width:20px;text-align:right">${p.acquired}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:2px">
            <span style="font-size:10px;color:#22c55e;width:48px">Saída</span>
            <div style="flex:1;background:#e5e7eb;border-radius:3px;height:10px">
              <div style="background:#22c55e;width:${Math.round((p.sold / maxInflow) * 100)}%;height:100%;border-radius:3px"></div>
            </div>
            <span style="font-size:10px;width:20px;text-align:right">${p.sold}</span>
          </div>
        </div>`
      ).join('')
    : ''

  return section('Métricas Operacionais', kpis + inflowChart)
}

function renderAlerts(alerts: AlertRecommendation[]): string {
  if (!alerts.length) return ''
  const cards = alerts.map(a =>
    `<div style="padding:14px 16px;border-radius:10px;border-left:4px solid ${alertColor[a.level]};background:${alertBg[a.level]};margin-bottom:10px">
      <p style="margin:0;font-size:13px;font-weight:600;color:#111827">${a.icon} ${a.message}</p>
      <p style="margin:6px 0 0;font-size:12px;color:#374151">${a.recommendation}</p>
    </div>`
  ).join('')
  return section('Alertas e Recomendações', cards)
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateReportHTML(data: ExecutiveReportData): string {
  const title = `Relatório Executivo — ${data.period.label} — ${data.dealershipName}`

  const body = [
    // Cover
    `<div style="text-align:center;padding:32px 0 24px;border-bottom:2px solid #e5e7eb;margin-bottom:32px">
      <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em">Relatório Executivo</p>
      <h1 style="margin:8px 0 4px;font-size:28px;font-weight:800;color:#111827">${data.dealershipName}</h1>
      <p style="margin:0;font-size:16px;color:#374151;font-weight:500">${data.period.label}</p>
      <p style="margin:6px 0 0;font-size:12px;color:#6b7280">${data.period.start} até ${data.period.end}</p>
      ${data.executiveSummary
        ? `<div style="margin:16px auto 0;max-width:600px;padding:14px 18px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;text-align:left">
            <p style="margin:0;font-size:12px;color:#0369a1;font-weight:600">Resumo Executivo</p>
            <p style="margin:6px 0 0;font-size:13px;color:#0c4a6e;line-height:1.6">${data.executiveSummary}</p>
          </div>`
        : ''
      }
    </div>`,
    renderFinancial(data.financial),
    renderSales(data.sales),
    renderInventory(data.inventory),
    renderExpenses(data.expenses),
    renderFinancing(data.financing),
    renderOperational(data.operational),
    renderAlerts(data.alerts),
    // Footer
    `<div style="text-align:center;padding:24px 0;border-top:1px solid #e5e7eb;margin-top:32px">
      <p style="margin:0;font-size:11px;color:#9ca3af">
        Relatório gerado automaticamente pelo <strong>Moneycar IA</strong> ·
        ${data.dealershipName} ·
        ${new Date(data.generatedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
      </p>
      <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">Este documento é confidencial e destinado exclusivamente ao uso interno da revenda.</p>
    </div>`,
  ].join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #fff; color: #111827; max-width: 900px; margin: 0 auto; }
    @media print {
      body { padding: 0; max-width: 100%; font-size: 10pt; }
      div[style*="page-break-inside:avoid"] { page-break-inside: avoid; }
      h2 { page-break-after: avoid; }
    }
    @page { margin: 15mm; }
  </style>
</head>
<body>${body}</body>
</html>`
}

export function downloadReportHTML(data: ExecutiveReportData): void {
  const html     = generateReportHTML(data)
  const blob     = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  const filename = `relatorio-${data.period.label.toLowerCase().replace(/\s+/g, '-')}-${data.dealershipName.toLowerCase().replace(/\s+/g, '-')}.html`
  a.href         = url
  a.download     = filename
  a.click()
  URL.revokeObjectURL(url)
}
