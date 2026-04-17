/**
 * app/(dashboard)/dashboard/envelhecimento/page.tsx
 * Full Inventory Aging page — wraps AgingDashboard + AgingSettings.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AgingDashboard } from '@/components/aging/AgingDashboard'
import { AgingSettings } from '@/components/aging/AgingSettings'
import type { AgingVehicle } from '@/types/aging'
import { fetchAll } from '@/lib/supabase/fetch-all'

export default async function EnvelhecimentoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('dealership_id')
    .eq('id', user.id)
    .single()

  const dealId = userData?.dealership_id

  const raw = await fetchAll(supabase
    .from('vehicles')
    .select('id, brand, model, version, plate, year_fab, year_model, purchase_price, sale_price, days_in_stock, purchase_date, status, expenses:expenses(amount)')
    .eq('dealership_id', dealId)
    .eq('status', 'available')
    .order('days_in_stock', { ascending: false }))

  const vehicles: AgingVehicle[] = raw.map((v: any) => {
    const totalExpenses = (v.expenses || []).reduce((s: number, e: any) => s + e.amount, 0)
    return {
      id: v.id,
      brand: v.brand,
      model: v.model,
      version: v.version ?? null,
      plate: v.plate ?? null,
      year_fab: v.year_fab,
      year_model: v.year_model,
      purchase_price: v.purchase_price,
      sale_price: v.sale_price ?? null,
      days_in_stock: v.days_in_stock ?? 0,
      purchase_date: v.purchase_date ?? '',
      status: v.status,
      totalExpenses,
      // agingStatus and suggestions are computed client-side in AgingDashboard
      agingStatus: { level: 'ok', label: 'OK', color: '#22C55E', badgeVariant: 'success', days: v.days_in_stock ?? 0 },
      suggestions: [],
      missingPurchasePrice: !v.purchase_price || v.purchase_price === 0,
    }
  })

  const vehicleDays = vehicles.map(v => v.days_in_stock)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Giro de Estoque</h1>
        <p className="text-foreground-muted text-sm mt-1">
          Monitore o tempo de permanência dos veículos e tome ações antes que o custo aumente
        </p>
      </div>

      <AgingDashboard vehicles={vehicles} />

      <AgingSettings vehicleDays={vehicleDays} />
    </div>
  )
}
