import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ReportType } from '@/types/reports'
import { generateReport } from '@/lib/reports/generate'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tipo, periodo_dias = 30 } = await req.json() as {
    tipo: ReportType
    periodo_dias?: number
  }

  const { data: userData } = await supabase
    .from('users').select('dealership_id').eq('id', user.id).single()
  const did = userData?.dealership_id
  if (!did) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const { data: dealer } = await supabase
    .from('dealerships').select('name').eq('id', did).single()

  const payload = await generateReport(supabase, tipo, did, periodo_dias, dealer?.name ?? 'Sua revenda')
  return NextResponse.json(payload)
}
