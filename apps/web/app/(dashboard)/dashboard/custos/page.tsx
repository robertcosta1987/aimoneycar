/**
 * app/(dashboard)/dashboard/custos/page.tsx
 *
 * Fleet Cost Analysis page.
 * Server component: fetches all vehicles with their expenses, then passes
 * the enriched data to the client-side FleetCostAnalysis and MarginTrendChart.
 *
 * The CostEditModal is managed client-side via CustosPageClient.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { VehicleForCost } from '@/types/cost'
import type { Expense } from '@/types/index'
import { CustosPageClient } from './CustosPageClient'

export default async function CustosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('dealership_id')
    .eq('id', user.id)
    .single()

  const dealId = userData?.dealership_id

  const { data: raw } = await supabase
    .from('vehicles')
    .select(`
      id, dealership_id, plate, chassis, renavam, brand, model, version,
      year_fab, year_model, color, mileage, fuel, transmission,
      purchase_price, sale_price, fipe_price, min_price,
      status, purchase_date, sale_date, days_in_stock,
      supplier_name, customer_id, photos, notes, source, external_id,
      created_at, updated_at,
      expenses:expenses(
        id, dealership_id, vehicle_id, category, description,
        amount, date, vendor_name, payment_method, receipt_url,
        created_by, external_id, created_at, updated_at
      )
    `)
    .eq('dealership_id', dealId)
    .order('days_in_stock', { ascending: false })

  const vehicles: VehicleForCost[] = (raw || []).map((v: any) => ({
    ...v,
    purchase_price: v.purchase_price ?? 0,
    sale_price: v.sale_price ?? null,
    days_in_stock: v.days_in_stock ?? 0,
    purchase_date: v.purchase_date ?? '',
    photos: v.photos ?? [],
    expenses: (v.expenses || []) as Expense[],
  }))

  return <CustosPageClient vehicles={vehicles} />
}
