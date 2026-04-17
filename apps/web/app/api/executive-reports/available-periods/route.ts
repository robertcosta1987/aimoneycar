import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export const dynamic = 'force-dynamic'

export interface AvailablePeriod {
  value: string    // ISO date of first day of month: "2026-03-01"
  label: string    // "Março 2026"
  salesCount: number
}

const MONTHS_BR = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

export async function GET() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users').select('dealership_id').eq('id', user.id).single()
  const dealId = userData?.dealership_id
  if (!dealId) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  // Fetch all sale dates for this dealership
  const { data: rows } = await supabase
    .from('vehicles')
    .select('sale_date')
    .eq('dealership_id', dealId)
    .eq('status', 'sold')
    .not('sale_date', 'is', null)
    .order('sale_date', { ascending: false })

  if (!rows || rows.length === 0) {
    return NextResponse.json({ periods: [] })
  }

  // Aggregate by year-month
  const monthMap = new Map<string, number>()
  for (const row of rows) {
    const d = new Date(row.sale_date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1)
  }

  const periods: AvailablePeriod[] = Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))  // newest first
    .map(([value, salesCount]) => {
      const d = new Date(value)
      return {
        value,
        label: `${MONTHS_BR[d.getMonth()]} ${d.getFullYear()}`,
        salesCount,
      }
    })

  return NextResponse.json({ periods })
}
