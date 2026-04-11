import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ReportPayload } from '@/types/reports'
import { buildReportEmail } from '@/lib/email/report-email'
import { generateReport } from '@/lib/reports/generate'
import {
  salesByDayChartUrl,
  stockHealthChartUrl,
  expenseByCategoryChartUrl,
  marginChartUrl,
} from '@/lib/charts/quickchart'

const resend = new Resend(process.env.RESEND_API_KEY!)

function buildChartUrls(payload: ReportPayload): string[] {
  const d = payload.data as Record<string, unknown>
  const urls: string[] = []

  if (payload.tipo === 'sales_overview' && Array.isArray(d.salesByDay) && d.salesByDay.length > 0) {
    urls.push(salesByDayChartUrl(d.salesByDay as Array<{ day: string; revenue: number; profit: number }>))
  }
  if (payload.tipo === 'inventory_health') {
    urls.push(stockHealthChartUrl(Number(d.healthy ?? 0), Number(d.warning ?? 0), Number(d.critical ?? 0)))
  }
  if (payload.tipo === 'expense_breakdown' && Array.isArray(d.byCategory) && d.byCategory.length > 0) {
    urls.push(expenseByCategoryChartUrl(d.byCategory as Array<{ cat: string; total: number }>))
  }
  if (payload.tipo === 'margin_analysis' && Array.isArray(d.vehicles) && d.vehicles.length > 0) {
    urls.push(marginChartUrl(d.vehicles as Array<{ name: string; margin: number }>))
  }

  return urls
}

// POST /api/reports/send-scheduled
// Called by: UI (manual send) or cron (automated)
export async function POST(req: NextRequest) {
  const body = await req.json() as { relatorio_id: string }
  const { relatorio_id } = body

  // Use service role for this — needs to work from cron (no user session) and UI
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: rel } = await svc
    .from('relatorios_agendados')
    .select('*')
    .eq('id', relatorio_id)
    .single()

  if (!rel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: dealer } = await svc
    .from('dealerships').select('name').eq('id', rel.dealership_id).single()

  let resend_id: string | undefined
  let status: 'sent' | 'failed' = 'sent'
  let erro: string | undefined

  try {
    const payload = await generateReport(
      svc,
      rel.tipo,
      rel.dealership_id,
      rel.periodo_dias,
      dealer?.name ?? 'Sua revenda'
    )

    const chartUrls = buildChartUrls(payload)
    const { subject, html } = buildReportEmail(payload, chartUrls)

    const { data: sent, error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'relatorios@moneycarai.com.br',
      to: rel.destinatarios,
      subject,
      html,
    })

    if (sendError) throw new Error(sendError.message)
    resend_id = sent?.id
  } catch (e: unknown) {
    status = 'failed'
    erro = e instanceof Error ? e.message : String(e)
  }

  await svc.from('relatorios_enviados_log').insert({
    relatorio_id,
    dealership_id: rel.dealership_id,
    destinatarios: rel.destinatarios,
    status,
    erro,
    resend_id,
  })

  if (status === 'failed') {
    return NextResponse.json({ error: erro }, { status: 500 })
  }

  return NextResponse.json({ ok: true, resend_id })
}
