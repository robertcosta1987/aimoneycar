'use client'
import { useState, useCallback } from 'react'
import type { ExecutiveReport, ReportType } from '@/types/report.types'

interface State {
  reports: ExecutiveReport[]
  loading: boolean
  generating: boolean
  error: string | null
}

export function useReportData() {
  const [state, setState] = useState<State>({
    reports: [],
    loading: false,
    generating: false,
    error: null,
  })

  const loadReports = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch('/api/executive-reports')
      if (!res.ok) throw new Error('Falha ao carregar relatórios')
      const { reports } = await res.json()
      setState(s => ({ ...s, reports: reports ?? [], loading: false }))
    } catch (e: unknown) {
      setState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }))
    }
  }, [])

  const generateReport = useCallback(async (type: ReportType): Promise<ExecutiveReport | null> => {
    setState(s => ({ ...s, generating: true, error: null }))
    try {
      const res = await fetch('/api/executive-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Falha ao gerar relatório')
      }
      const { report } = await res.json()
      setState(s => ({ ...s, generating: false, reports: [report, ...s.reports] }))
      return report
    } catch (e: unknown) {
      setState(s => ({ ...s, generating: false, error: e instanceof Error ? e.message : 'Erro desconhecido' }))
      return null
    }
  }, [])

  const deleteReport = useCallback(async (id: string) => {
    const res = await fetch(`/api/executive-reports/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setState(s => ({ ...s, reports: s.reports.filter(r => r.id !== id) }))
    }
  }, [])

  const fetchReport = useCallback(async (id: string): Promise<ExecutiveReport | null> => {
    try {
      const res = await fetch(`/api/executive-reports/${id}`)
      if (!res.ok) return null
      const { report } = await res.json()
      return report
    } catch {
      return null
    }
  }, [])

  return {
    ...state,
    loadReports,
    generateReport,
    deleteReport,
    fetchReport,
  }
}
