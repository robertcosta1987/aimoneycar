import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ReportType } from '@/types/report.types'
import { computeExecutiveReport } from '@/lib/reports/executive'

function makeSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}

async function getDealId(supabase: ReturnType<typeof makeSupabase>, userId: string) {
  const { data } = await supabase.from('users').select('dealership_id').eq('id', userId).single()
  return data?.dealership_id as string | null
}

// GET /api/executive-reports — list all reports for dealership
export async function GET() {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dealId = await getDealId(supabase, user.id)
  if (!dealId) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const { data: reports, error } = await supabase
    .from('executive_reports')
    .select('id, type, period_label, period_start, period_end, generated_at, triggered_by, created_at')
    .eq('dealership_id', dealId)
    .order('generated_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reports: reports ?? [] })
}

// POST /api/executive-reports — generate a new report
export async function POST(req: NextRequest) {
  const supabase = makeSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dealId = await getDealId(supabase, user.id)
  if (!dealId) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  let type: ReportType
  try {
    const body = await req.json()
    type = body.type
    if (!['weekly', 'monthly', 'quarterly', 'annual'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const data = await computeExecutiveReport(supabase, dealId, type)

    const { data: saved, error } = await supabase
      .from('executive_reports')
      .insert({
        dealership_id: dealId,
        type,
        period_label: data.period.label,
        period_start: data.period.start,
        period_end:   data.period.end,
        data,
        triggered_by: 'manual',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ report: saved })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
