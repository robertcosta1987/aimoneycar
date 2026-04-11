/**
 * app/(dashboard)/dashboard/custos/CustosPageClient.tsx
 *
 * Client wrapper for the Fleet Cost Analysis page.
 * Manages the CostEditModal state and optimistically updates vehicle data
 * after the user saves cost changes.
 */

'use client'
import { useState, useCallback } from 'react'
import { DollarSign } from 'lucide-react'
import { FleetCostAnalysis } from '@/components/cost/FleetCostAnalysis'
import { MarginTrendChart } from '@/components/cost/MarginTrendChart'
import { CostEditModal } from '@/components/cost/CostEditModal'
import type { VehicleForCost } from '@/types/cost'

interface CustosPageClientProps {
  vehicles: VehicleForCost[]
}

export function CustosPageClient({ vehicles: initialVehicles }: CustosPageClientProps) {
  const [vehicles, setVehicles] = useState<VehicleForCost[]>(initialVehicles)
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)

  const editingVehicle = vehicles.find(v => v.id === editingVehicleId) ?? null

  const handleSave = useCallback((updatedVehicle: VehicleForCost) => {
    setVehicles(prev =>
      prev.map(v => (v.id === updatedVehicle.id ? updatedVehicle : v))
    )
    setEditingVehicleId(null)
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-primary" />
          Análise de Custos — Frota
        </h1>
        <p className="text-foreground-muted text-sm mt-1">
          Custo real, margens e qualidade de dados para todos os {vehicles.length} veículos
        </p>
      </div>

      <FleetCostAnalysis
        vehicles={vehicles}
        onEditCosts={setEditingVehicleId}
      />

      <MarginTrendChart vehicles={vehicles} />

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
