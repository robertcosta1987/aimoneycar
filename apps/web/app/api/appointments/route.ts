import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = createServiceClient()
    const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    const sp = req.nextUrl.searchParams
    const start = sp.get('start') || new Date().toISOString().split('T')[0]
    const end = sp.get('end') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const salespersonId = sp.get('salesperson_id') || null

    // Direct query instead of get_calendario_dashboard RPC (avoids TEXT/VARCHAR type mismatch).
    // Use BRT (UTC-3) day boundaries: 00:00 BRT = 03:00 UTC, end-of-day BRT = next day 02:59 UTC
    const startUTC = `${start}T03:00:00.000Z`
    const endDate = new Date(end)
    endDate.setDate(endDate.getDate() + 1)
    const endUTCFinal = endDate.toISOString().replace(/T.*/, 'T02:59:59.999Z')

    let query = svc
      .from('agendamentos')
      .select(`
        id, data_inicio, data_fim, lead_nome, lead_telefone,
        tipo, veiculo_interesse, status, origem,
        salesperson_id,
        salesperson:employees(name)
      `)
      .eq('dealership_id', profile.dealership_id)
      .gte('data_inicio', startUTC)
      .lte('data_inicio', endUTCFinal)
      .order('data_inicio', { ascending: true })

    if (salespersonId) query = query.eq('salesperson_id', salespersonId)

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const STATUS_COLORS: Record<string, string> = {
      agendado: '#3B82F6', confirmado: '#10B981', em_atendimento: '#F59E0B',
      concluido: '#6B7280', cancelado: '#EF4444', no_show: '#DC2626',
    }

    const appointments = (data || []).map((a: any) => ({
      id: a.id,
      data_inicio: a.data_inicio,
      data_fim: a.data_fim,
      lead_nome: a.lead_nome,
      lead_telefone: a.lead_telefone,
      tipo: a.tipo,
      veiculo_interesse: a.veiculo_interesse,
      status: a.status,
      salesperson_id: a.salesperson_id,
      salesperson_name: a.salesperson?.name ?? null,
      cor: STATUS_COLORS[a.status] ?? '#00D9FF',
      origem: a.origem,
    }))

    return NextResponse.json({ appointments })
  } catch (err) {
    console.error('[Appointments GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = createServiceClient()
    const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    const body = await req.json()
    const { data_inicio, data_fim, lead_nome, lead_telefone, lead_email, tipo, vehicle_id, veiculo_interesse, salesperson_id } = body

    if (!data_inicio || !data_fim || !lead_nome || !lead_telefone) {
      return NextResponse.json({ error: 'Campos obrigatórios: data_inicio, data_fim, lead_nome, lead_telefone' }, { status: 400 })
    }

    const { data: result } = await svc.rpc('criar_agendamento', {
      p_dealership_id: profile.dealership_id,
      p_data_inicio: data_inicio,
      p_data_fim: data_fim,
      p_lead_nome: lead_nome,
      p_lead_telefone: lead_telefone,
      p_lead_email: lead_email || null,
      p_tipo: tipo || 'visita',
      p_vehicle_id: vehicle_id || null,
      p_veiculo_interesse: veiculo_interesse || null,
      p_salesperson_id: salesperson_id || null,
      p_origem: 'manual',
      p_dados_qualificacao: '{}',
      p_conversa_id: null,
    })

    if (!result?.success) {
      return NextResponse.json({ error: result?.error || 'Erro ao criar agendamento' }, { status: 409 })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[Appointments POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = createServiceClient()
    const body = await req.json()
    const { id, status, observacoes_internas } = body

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    if (status === 'cancelado') {
      const { data: result } = await svc.rpc('cancelar_agendamento', {
        p_agendamento_id: id,
        p_motivo: observacoes_internas || null,
      })
      return NextResponse.json(result)
    }

    const { error } = await svc
      .from('agendamentos')
      .update({ status, observacoes_internas, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Appointments PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
