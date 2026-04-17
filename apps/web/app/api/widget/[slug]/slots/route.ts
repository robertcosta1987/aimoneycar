import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@getSvc()/getSvc()-js'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const sp = req.nextUrl.searchParams
  const startDate = sp.get('start') || new Date().toISOString().split('T')[0]
  const endDate = sp.get('end') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: dealership } = await getSvc()
    .from('dealerships')
    .select('id')
    .eq('slug', params.slug)
    .single()

  if (!dealership) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: slots, error } = await getSvc().rpc('get_slots_disponiveis', {
    p_dealership_id: dealership.id,
    p_data_inicio: startDate,
    p_data_fim: endDate,
    p_salesperson_id: null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const grouped: Record<string, any> = {}
  for (const slot of (slots || []).filter((s: any) => s.disponivel)) {
    if (!grouped[slot.data]) {
      grouped[slot.data] = { date: slot.data, dayName: slot.dia_nome, slots: [] }
    }
    grouped[slot.data].slots.push({
      time: (slot.horario as string).slice(0, 5),
      endTime: (slot.horario_fim as string).slice(0, 5),
    })
  }

  return NextResponse.json({ availableDays: Object.values(grouped) })
}
