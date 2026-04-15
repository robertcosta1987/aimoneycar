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

    const del = async (table: string) => {
      const { error } = await (svc as any).from(table).delete().eq('dealership_id', D)
      if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`)
    }

    const delAll = (...tables: string[]) => Promise.all(tables.map(del))

    // Level 1: deepest leaf tables (nothing else references these)
    await delAll(
      'order_followups',
      'post_sale_expenses',
      'vehicle_fines',
      'vehicle_documents',
      'vehicle_optionals',
      'vehicle_pendencies',
      'vehicle_apportionment',
      'vehicle_delivery_protocols',
      'vehicle_purchase_documents',
      'vehicle_trades',
      'purchase_data',
      'sale_data',
      'nfe_prod',
      'nfe_dest',
      'nfe_emit',
      'nfe_ide',
      'commissions',
      'commission_standards',
      'employee_salaries',
      'ai_alerts',
    )

    // Level 2: tables that may reference vehicles/customers but not each other
    await delAll(
      'expenses',
      'insurances',
      'financings',
      'orders',
    )

    // Level 3: main entities
    await delAll('vehicles', 'customers')

    // Level 4: reference / lookup tables (no FK deps within the list)
    await delAll(
      'manufacturers',
      'fuel_types',
      'plan_accounts',
      'customer_origins',
      'cancellation_reasons',
      'standard_pendencies',
      'standard_expenses',
      'optionals',
      'general_enumerations',
      'text_configurations',
      'banks',
      'bank_accounts',
      'vendors',
      'employees',
      'nature_of_operation',
      'ncm',
    )

    // Level 5: import history
    await del('imports')

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[clear-data]', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
