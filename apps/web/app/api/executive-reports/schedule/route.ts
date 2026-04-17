import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ReportSchedule } from '@/types/report.types'
export const dynamic = 'force-dynamic'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}

// GET /api/executive-reports/schedule — get current schedule settings
export async function GET() {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase.from('users').select('dealership_id').eq('id', user.id).single()
  const dealId = userData?.dealership_id
  if (!dealId) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const { data: row } = await supabase
    .from('executive_report_schedules')
    .select('*')
    .eq('dealership_id', dealId)
    .maybeSingle()

  if (!row) {
    // Return defaults
    const defaults: ReportSchedule = {
      enabled: false,
      recipientEmails: [],
      reportTypes: ['monthly'],
      deliveryConfig: { monthly: { day: 1 } },
      includeAttachment: true,
      emailSubject: 'Relatório Executivo — {dealership_name} | {period}',
      emailBody: '',
    }
    return NextResponse.json({ schedule: defaults })
  }

  const schedule: ReportSchedule = {
    id:                 row.id,
    dealership_id:      row.dealership_id,
    enabled:            row.enabled,
    recipientEmails:    row.recipient_emails,
    reportTypes:        row.report_types,
    deliveryConfig:     row.delivery_config,
    includeAttachment:  row.include_attachment,
    emailSubject:       row.email_subject,
    emailBody:          row.email_body,
  }

  return NextResponse.json({ schedule })
}

// POST /api/executive-reports/schedule — upsert schedule settings
export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase.from('users').select('dealership_id').eq('id', user.id).single()
  const dealId = userData?.dealership_id
  if (!dealId) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  let body: ReportSchedule
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { error } = await supabase
    .from('executive_report_schedules')
    .upsert({
      dealership_id:      dealId,
      enabled:            body.enabled,
      recipient_emails:   body.recipientEmails,
      report_types:       body.reportTypes,
      delivery_config:    body.deliveryConfig,
      include_attachment: body.includeAttachment,
      email_subject:      body.emailSubject,
      email_body:         body.emailBody,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'dealership_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
