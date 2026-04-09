import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { chatWithClaude } from '@/lib/ai/claude'
import type { ChatMessage } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as { messages: ChatMessage[]; conversation_id?: string }

    const svc = createServiceClient()
    const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    const D = profile.dealership_id

    // Fetch all data the AI needs in parallel
    const [
      { data: dealership },
      { data: allVehicles },
      { data: expenses },
      { data: customers },
      { data: employees },
      { data: financings },
      { data: vehicleFines },
      { data: orders },
    ] = await Promise.all([
      svc.from('dealerships').select('name, city, state').eq('id', D).single(),

      // ALL vehicles — available and sold — with their expenses nested
      svc.from('vehicles')
        .select('id, external_id, brand, model, version, year_fab, year_model, plate, color, mileage, fuel, purchase_price, sale_price, fipe_price, purchase_date, sale_date, days_in_stock, status, source, notes, supplier_name, expenses:expenses(id, category, amount, date, description)')
        .eq('dealership_id', D)
        .order('days_in_stock', { ascending: false }),

      // All expenses with vehicle info
      svc.from('expenses')
        .select('id, vehicle_id, category, amount, date, description')
        .eq('dealership_id', D)
        .order('date', { ascending: false })
        .limit(500),

      // Customers
      svc.from('customers')
        .select('id, name, phone, city, source')
        .eq('dealership_id', D)
        .limit(200),

      // Employees
      svc.from('employees')
        .select('id, name, role, is_active')
        .eq('dealership_id', D),

      // Financings
      svc.from('financings')
        .select('vehicle_external_id, bank, total_amount, installments, interest_rate, start_date, status')
        .eq('dealership_id', D)
        .limit(200),

      // Vehicle fines
      svc.from('vehicle_fines')
        .select('vehicle_external_id, date, amount, issuing_agency, is_paid')
        .eq('dealership_id', D)
        .limit(200),

      // Orders / pedidos
      svc.from('orders')
        .select('id, order_date, amount, status, payment_method')
        .eq('dealership_id', D)
        .order('order_date', { ascending: false })
        .limit(100),
    ])

    const vehicles = allVehicles ?? []
    const expenseList = expenses ?? []

    // ── Derived analytics ────────────────────────────────────────────────────

    const available = vehicles.filter(v => v.status === 'available')
    const sold = vehicles.filter(v => v.status === 'sold')

    // Enrich each vehicle with total expenses and profit
    const enrich = (v: any) => {
      const exps: any[] = v.expenses ?? []
      const totalExp = exps.reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
      const profit = v.sale_price ? v.sale_price - v.purchase_price - totalExp : null
      const profitPct = v.sale_price && v.sale_price > 0 ? (profit! / v.sale_price) * 100 : null
      return { ...v, totalExp, profit, profitPct }
    }

    const availableEnriched = available.map(enrich)
    const soldEnriched = sold.map(enrich).sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0))

    // Summary stats
    const totalRevenue = soldEnriched.reduce((s, v) => s + (v.sale_price ?? 0), 0)
    const totalProfit = soldEnriched.reduce((s, v) => s + (v.profit ?? 0), 0)
    const totalExpenses = expenseList.reduce((s, e) => s + (e.amount ?? 0), 0)
    const avgDaysAvailable = available.length
      ? Math.round(available.reduce((s, v) => s + (v.days_in_stock ?? 0), 0) / available.length)
      : 0
    const avgDaysSold = sold.length
      ? Math.round(sold.reduce((s, v) => s + (v.days_in_stock ?? 0), 0) / sold.length)
      : 0

    // Expense breakdown by category
    const expByCategory: Record<string, number> = {}
    expenseList.forEach(e => {
      const cat = e.category ?? 'Outros'
      expByCategory[cat] = (expByCategory[cat] ?? 0) + (e.amount ?? 0)
    })

    const context = {
      dealershipId: D,
      dealershipName: dealership?.name ?? 'Revenda',
      dealershipCity: dealership?.city,
      summary: {
        totalVehicles: vehicles.length,
        availableCount: available.length,
        soldCount: sold.length,
        criticalCount: available.filter(v => (v.days_in_stock ?? 0) > 60).length,
        avgDaysAvailable,
        avgDaysSold,
        totalRevenue,
        totalProfit,
        totalExpenses,
        totalCustomers: customers?.length ?? 0,
        activeEmployees: employees?.filter(e => e.is_active).length ?? 0,
        pendingOrders: orders?.filter(o => o.status === 'open').length ?? 0,
      },
      availableVehicles: availableEnriched,
      soldVehicles: soldEnriched,
      expensesByCategory: expByCategory,
      financings: financings ?? [],
      fines: vehicleFines ?? [],
      customers: customers ?? [],
      employees: employees ?? [],
    }

    const reply = await chatWithClaude(body.messages, context)

    const newMessages: ChatMessage[] = [...body.messages, { role: 'assistant', content: reply }]
    if (body.conversation_id) {
      await supabase.from('ai_conversations')
        .update({ messages: newMessages as any, updated_at: new Date().toISOString() })
        .eq('id', body.conversation_id).eq('dealership_id', D)
    } else {
      await supabase.from('ai_conversations').insert({
        dealership_id: D, user_id: user.id, messages: newMessages, context: {},
      } as any)
    }

    return NextResponse.json({ reply })
  } catch (err: any) {
    // Detailed error breakdown for easier debugging
    const isAnthropicError = err?.status !== undefined || err?.error !== undefined
    if (isAnthropicError) {
      console.error('[Chat] Anthropic API error:', {
        status: err.status,
        type: err.error?.type,
        message: err.error?.message ?? err.message,
      })
      // Surface billing/auth errors clearly to the client (non-sensitive)
      const msg = err.error?.message ?? err.message ?? 'Anthropic API error'
      if (err.status === 401) return NextResponse.json({ error: `Anthropic: invalid API key` }, { status: 502 })
      if (err.status === 403 || msg.includes('credit balance')) return NextResponse.json({ error: `Anthropic: créditos insuficientes — adicione créditos em console.anthropic.com` }, { status: 502 })
      if (err.status === 429) return NextResponse.json({ error: `Anthropic: rate limit atingido` }, { status: 502 })
      return NextResponse.json({ error: `Anthropic: ${msg}` }, { status: 502 })
    }

    console.error('[Chat] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
