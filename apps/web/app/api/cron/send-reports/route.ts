import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Runs every 30 minutes via Vercel Cron
// Finds all active scheduled reports that are due and sends them
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // BRT = UTC-3
  const brtHour = (now.getUTCHours() - 3 + 24) % 24
  const brtMinute = now.getUTCMinutes()
  const brtDayOfWeek = now.getDay() // 0=Sun…6=Sat in BRT approx
  const brtDayOfMonth = now.getDate()
  const hourStr = `${String(brtHour).padStart(2, '0')}:${String(Math.floor(brtMinute / 30) * 30).padStart(2, '0')}`

  const { data: reports } = await supabase
    .from('relatorios_agendados')
    .select('*')
    .eq('ativo', true)
    .eq('hora', hourStr)

  if (!reports?.length) {
    return NextResponse.json({ sent: 0 })
  }

  // Filter by day
  const due = reports.filter(r => {
    if (r.frequencia === 'daily') return true
    if (r.frequencia === 'weekly') return r.dia_semana === brtDayOfWeek
    if (r.frequencia === 'monthly') return r.dia_mes === brtDayOfMonth
    return false
  })

  let sent = 0
  const errors: string[] = []

  await Promise.all(
    due.map(async (rel) => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/reports/send-scheduled`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relatorio_id: rel.id }),
        })
        if (res.ok) sent++
        else errors.push(`${rel.id}: ${res.status}`)
      } catch (e) {
        errors.push(`${rel.id}: ${e}`)
      }
    })
  )

  return NextResponse.json({ sent, errors, checked: due.length })
}
