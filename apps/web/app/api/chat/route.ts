import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { chatWithClaude } from '@/lib/ai/claude'
import type { ChatMessage } from '@/types'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

    // Fetch context for the AI. Vehicles are fetched minimally — Claude uses
    // the query_vehicles tool for any detailed vehicle analysis.
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const [
      { data: dealership },
      { data: availVehicles },    // top 20 worst-aged, for summary display
      { data: recentSold },       // top 20 most-recent sold, for summary stats
      { data: expenses },
      { data: customers },
      { data: employees },
      { data: financings },
      { data: vehicleFines },
      { data: orders },
      { data: commissions },
      { data: commissionStandards },
      { data: employeeSalaries },
      { data: saleData },
    ] = await Promise.all([
      svc.from('dealerships').select('name, city, state').eq('id', D).single(),

      // Available: top 20 by days_in_stock (no nested expenses needed for summary)
      svc.from('vehicles')
        .select('id, brand, model, version, year_fab, year_model, plate, purchase_price, sale_price, days_in_stock, status')
        .eq('dealership_id', D).eq('status', 'available')
        .order('days_in_stock', { ascending: false })
        .limit(20),

      // Sold (last 180d): top 20 most recent for summary stats + profit overview
      svc.from('vehicles')
        .select('id, brand, model, version, year_fab, year_model, plate, purchase_price, sale_price, days_in_stock, status, sale_date, expenses:expenses(amount)')
        .eq('dealership_id', D).eq('status', 'sold')
        .gte('sale_date', sixMonthsAgo)
        .order('sale_date', { ascending: false })
        .limit(20),

      // Expenses by category (aggregate — only amounts needed)
      svc.from('expenses')
        .select('vehicle_id, category, amount')
        .eq('dealership_id', D)
        .limit(200),

      // Customers
      svc.from('customers')
        .select('id, name, phone, city, source')
        .eq('dealership_id', D)
        .limit(200),

      // Employees — include salary and commission fields
      svc.from('employees')
        .select('id, external_id, name, role, is_active, base_salary, commission_percent')
        .eq('dealership_id', D),

      // Financings
      svc.from('financings')
        .select('vehicle_external_id, customer_external_id, bank, total_amount, installments, installment_amount, interest_rate, down_payment, contract_number, start_date, status, notes')
        .eq('dealership_id', D)
        .limit(200),

      // Vehicle fines
      svc.from('vehicle_fines')
        .select('vehicle_external_id, date, amount, issuing_agency, is_paid')
        .eq('dealership_id', D)
        .limit(200),

      // Orders / pedidos — include employee (salesperson) link
      svc.from('orders')
        .select('id, external_id, employee_external_id, employee_id, order_date, amount, status, payment_method, down_payment')
        .eq('dealership_id', D)
        .order('order_date', { ascending: false })
        .limit(200),

      // Commissions per sale/vehicle
      svc.from('commissions')
        .select('id, vehicle_external_id, vehicle_id, employee_external_id, employee_id, amount, percent, date, paid_date, is_paid')
        .eq('dealership_id', D)
        .order('date', { ascending: false })
        .limit(500),

      // Commission standards (rules per employee)
      svc.from('commission_standards')
        .select('id, employee_external_id, employee_id, percent, min_value, max_value, type, is_active')
        .eq('dealership_id', D),

      // Employee salary/commission payment history
      svc.from('employee_salaries')
        .select('id, employee_external_id, employee_id, date, amount, type, description')
        .eq('dealership_id', D)
        .order('date', { ascending: false })
        .limit(100),

      // Sale data — detailed sale records per vehicle
      svc.from('sale_data')
        .select('id, vehicle_external_id, vehicle_id, sale_date, mileage, sale_price, customer_external_id, customer_id, employee_external_id, employee_id, payment_method, notes')
        .eq('dealership_id', D)
        .order('sale_date', { ascending: false })
        .limit(100),
    ])

    // ── Derived analytics ────────────────────────────────────────────────────
    const available = availVehicles ?? []
    const sold = (recentSold ?? []).map((v: any) => {
      const totalExp = (v.expenses ?? []).reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
      const profit = v.sale_price ? v.sale_price - v.purchase_price - totalExp : null
      const profitPct = v.sale_price && v.sale_price > 0 ? (profit! / v.sale_price) * 100 : null
      return { ...v, expenses: undefined, totalExp, profit, profitPct }
    })

    const expenseList = expenses ?? []
    const totalRevenue = sold.reduce((s: number, v: any) => s + (v.sale_price ?? 0), 0)
    const totalProfit  = sold.reduce((s: number, v: any) => s + (v.profit ?? 0), 0)
    const totalExpenses = expenseList.reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
    const avgDaysAvailable = available.length
      ? Math.round(available.reduce((s: number, v: any) => s + (v.days_in_stock ?? 0), 0) / available.length) : 0
    const avgDaysSold = sold.length
      ? Math.round(sold.reduce((s: number, v: any) => s + (v.days_in_stock ?? 0), 0) / sold.length) : 0

    const expByCategory: Record<string, number> = {}
    expenseList.forEach((e: any) => {
      const cat = e.category ?? 'Outros'
      expByCategory[cat] = (expByCategory[cat] ?? 0) + (e.amount ?? 0)
    })

    const commissionList = commissions ?? []
    const totalCommissionsPaid    = commissionList.filter((c: any) => c.is_paid).reduce((s: number, c: any) => s + (c.amount ?? 0), 0)
    const totalCommissionsPending = commissionList.filter((c: any) => !c.is_paid).reduce((s: number, c: any) => s + (c.amount ?? 0), 0)

    const context = {
      dealershipId: D,
      dealershipName: dealership?.name ?? 'Revenda',
      dealershipCity: dealership?.city,
      summary: {
        totalVehicles: available.length + sold.length,
        availableCount: available.length,
        soldCount: sold.length,
        criticalCount: available.filter((v: any) => (v.days_in_stock ?? 0) > 90).length,
        avgDaysAvailable,
        avgDaysSold,
        totalRevenue,
        totalProfit,
        totalExpenses,
        totalCustomers: customers?.length ?? 0,
        activeEmployees: employees?.filter((e: any) => e.is_active).length ?? 0,
        pendingOrders: orders?.filter((o: any) => o.status === 'open').length ?? 0,
        totalCommissionsPaid,
        totalCommissionsPending,
      },
      availableVehicles: available,
      soldVehicles: sold,
      expensesByCategory: expByCategory,
      financings: financings ?? [],
      fines: vehicleFines ?? [],
      customers: customers ?? [],
      employees: employees ?? [],
      orders: orders ?? [],
      commissions: commissionList,
      commissionStandards: commissionStandards ?? [],
      employeeSalaries: employeeSalaries ?? [],
      saleData: saleData ?? [],
      purchaseData: [],
      vendors: [],
      vehicleTrades: [],
      vehiclePendencies: [],
      postSaleExpenses: [],
    }

    const { reply, dashboard } = await chatWithClaude(body.messages, context)

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

    return NextResponse.json({ reply, dashboard })
  } catch (err: any) {
    // Detailed error breakdown for easier debugging
    const isAnthropicError = err?.status !== undefined || err?.error !== undefined
    if (isAnthropicError) {
      const retryAfter   = err.headers?.['retry-after']
      const resetTokens  = err.headers?.['anthropic-ratelimit-tokens-reset']
      const resetRequests = err.headers?.['anthropic-ratelimit-requests-reset']
      const limitType    = err.error?.message?.toLowerCase().includes('request') ? 'RPM' : 'TPM'
      console.error('[Chat] Anthropic API error:', {
        status: err.status,
        type: err.error?.type,
        message: err.error?.message ?? err.message,
        retryAfter,
        resetTokens,
        resetRequests,
        limitType,
      })
      // Surface billing/auth errors clearly to the client (non-sensitive)
      const msg = err.error?.message ?? err.message ?? 'Anthropic API error'
      if (err.status === 401) return NextResponse.json({ error: `Anthropic: invalid API key` }, { status: 502 })
      if (err.status === 403 || msg.includes('credit balance')) return NextResponse.json({ error: `Anthropic: créditos insuficientes — adicione créditos em console.anthropic.com` }, { status: 502 })
      if (err.status === 429) {
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : null
        const waitMsg = waitSec ? ` Tente novamente em ${waitSec}s.` : ''
        const typeMsg = limitType === 'RPM' ? ' (limite de requisições por minuto)' : ' (limite de tokens por minuto)'
        return NextResponse.json({ error: `Anthropic: rate limit atingido${typeMsg}.${waitMsg}` }, { status: 502 })
      }
      return NextResponse.json({ error: `Anthropic: ${msg}` }, { status: 502 })
    }

    console.error('[Chat] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
