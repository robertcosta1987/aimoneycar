import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function DELETE() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = createServiceClient()
    const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

    const D = profile.dealership_id
    const del = (table: string) => (svc as any).from(table).delete().eq('dealership_id', D)

    // Level 1: leaf tables (no other tables in this list depend on them)
    await Promise.all([
      del('order_followups'),
      del('post_sale_expenses'),
      del('vehicle_fines'),
      del('vehicle_documents'),
      del('vehicle_optionals'),
      del('vehicle_pendencies'),
      del('vehicle_apportionment'),
      del('vehicle_delivery_protocols'),
      del('vehicle_purchase_documents'),
      del('vehicle_trades'),
      del('expenses'),
      del('purchase_data'),
      del('sale_data'),
      del('nfe_prod'),
      del('nfe_dest'),
      del('nfe_emit'),
      del('nfe_ide'),
      del('commissions'),
      del('commission_standards'),
      del('employee_salaries'),
      del('insurances'),
      del('ai_alerts'),
    ])

    // Level 2: tables that depend on vehicles/customers
    await Promise.all([
      del('orders'),
      del('financings'),
    ])

    // Level 3: main entities
    await Promise.all([
      del('vehicles'),
      del('customers'),
    ])

    // Level 4: reference / lookup tables
    await Promise.all([
      del('manufacturers'),
      del('fuel_types'),
      del('plan_accounts'),
      del('customer_origins'),
      del('cancellation_reasons'),
      del('standard_pendencies'),
      del('standard_expenses'),
      del('optionals'),
      del('general_enumerations'),
      del('text_configurations'),
      del('banks'),
      del('bank_accounts'),
      del('vendors'),
      del('employees'),
      del('nature_of_operation'),
      del('ncm'),
    ])

    // Level 5: import history
    await del('imports')

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[clear-data]', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
