'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Vehicle } from '@/types'

export function useVehicles(options?: { status?: string; search?: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (options?.status && options.status !== 'all') params.set('status', options.status)
      if (options?.search) params.set('search', options.search)

      const res = await window.fetch(`/api/vehicles?${params}`)
      if (!res.ok) throw new Error(await res.text())
      setVehicles(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [options?.status, options?.search])

  useEffect(() => { fetch() }, [fetch])

  return { vehicles, loading, error, refetch: fetch }
}

export function useVehicleRealtime(dealershipId: string, onUpdate: () => void) {
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('vehicles-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vehicles',
        filter: `dealership_id=eq.${dealershipId}`,
      }, onUpdate)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [dealershipId, onUpdate])
}
