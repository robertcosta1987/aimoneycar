import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chatWithClaude } from '@/lib/ai/claude'
import type { ChatMessage, DashboardStats, Vehicle } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      messages: ChatMessage[]
      conversation_id?: string
    }

    // Fetch dealership context
    const { data: profile } = await supabase
      .from('users')
      .select('dealership_id')
      .eq('id', user.id)
      .single()

    if (!profile?.dealership_id) {
      return NextResponse.json({ error: 'No dealership' }, { status: 400 })
    }

    const dealershipId = profile.dealership_id

    const [{ data: dealership }, { data: vehicles }, { data: stats }] = await Promise.all([
      supabase.from('dealerships').select('name').eq('id', dealershipId).single(),
      supabase
        .from('vehicles')
        .select('*')
        .eq('dealership_id', dealershipId)
        .eq('status', 'available')
        .order('days_in_stock', { ascending: false })
        .limit(10),
      supabase.rpc('get_dashboard_stats', { d_id: dealershipId }),
    ])

    const criticalVehicles = (vehicles as Vehicle[] | null)?.filter(v => v.days_in_stock > 60) ?? []

    const reply = await chatWithClaude(body.messages, {
      dealershipName: dealership?.name ?? 'Revenda',
      stats: stats as DashboardStats | undefined ?? undefined,
      criticalVehicles,
    })

    // Persist conversation
    const newMessages: ChatMessage[] = [...body.messages, { role: 'assistant', content: reply }]

    if (body.conversation_id) {
      await supabase
        .from('ai_conversations')
        .update({ messages: newMessages as any, updated_at: new Date().toISOString() })
        .eq('id', body.conversation_id)
        .eq('dealership_id', dealershipId)
    } else {
      await supabase.from('ai_conversations').insert({
        dealership_id: dealershipId,
        user_id: user.id,
        messages: newMessages,
        context: {},
      } as any)
    }

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Chat error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
