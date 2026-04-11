/**
 * hooks/use-aging-thresholds.ts
 * React hook for reading and persisting aging thresholds to localStorage.
 * Shared between AgingDashboard, AgingSettings, and AgingWidget.
 */

'use client'
import { useState, useEffect } from 'react'
import { loadThresholds, saveThresholds } from '@/lib/aging'
import type { AgingThresholds } from '@/types/aging'

export function useAgingThresholds() {
  const [thresholds, setThresholdsState] = useState<AgingThresholds>({ attention: 30, critical: 60 })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setThresholdsState(loadThresholds())
    setLoaded(true)
  }, [])

  function setThresholds(t: AgingThresholds) {
    setThresholdsState(t)
    saveThresholds(t)
  }

  return { thresholds, setThresholds, loaded }
}
