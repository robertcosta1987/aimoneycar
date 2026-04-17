/**
 * app/(dashboard)/dashboard/custos/page.tsx
 *
 * Fleet Cost Analysis page — client component.
 * Fetches vehicles lazily with a status filter (default: available)
 * to avoid statement timeouts on large databases.
 */

'use client'
import { useState, useEffect, useCallback } from 'react'
import { DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FleetCostAnalysis } from '@/components/cost/FleetCostAnalysis'
import { MarginTrendChart } from '@/components/cost/MarginTrendChart'
import { CostEditModal } from '@/components/cost/CostEditModal'
import type { VehicleForCost } from '@/types/cost'
import type { Expense } from '@/types/index'

export default function CustosPage() {
  const [vehicles, setVehicles] = useState<VehicleForCost[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('available')
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const supabase = createClient()

  const editingVehicle = vehicles.find(v => v.id === editingVehicleId) ?? null

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.from('users').select('dealership_id').single()

      let query = supabase
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
        .eq('dealership_id', userData?.dealership_id)
        .order('days_in_stock', { ascending: false })

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)

      const data = await fetchAll(query)

      setVehicles(data.map((v: any) => ({
        ...v,
        purchase_price: v.purchase_price ?? 0,
        sale_price: v.sale_price ?? null,
        days_in_stock: v.days_in_stock ?? 0,
        purchase_date: v.purchase_date ?? '',
        photos: v.photos ?? [],
        expenses: (v.expenses || []) as Expense[],
      })))
      setLoading(false)
    }
    load()
  }, [statusFilter])

  const handleSave = useCallback((updatedVehicle: VehicleForCost) => {
    setVehicles(prev => prev.map(v => v.id === updatedVehicle.id ? updatedVehicle : v))
    setEditingVehicleId(null)
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" />
            Análise de Custos — Frota
          </h1>
          <p className="text-foreground-muted text-sm mt-1">
            {loading ? 'Carregando...' : `Custo real, margens e qualidade de dados para ${vehicles.length} veículos`}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="available">Disponível</SelectItem>
            <SelectItem value="reserved">Reservado</SelectItem>
            <SelectItem value="sold">Vendido</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-background-elevated animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <FleetCostAnalysis vehicles={vehicles} onEditCosts={setEditingVehicleId} />
          <MarginTrendChart vehicles={vehicles} />
        </>
      )}

      {editingVehicle && (
        <CostEditModal
          vehicle={editingVehicle}
          open={editingVehicleId !== null}
          onClose={() => setEditingVehicleId(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
