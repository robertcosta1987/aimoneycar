'use client'
import { useState, useCallback } from 'react'
import type { ReportSchedule } from '@/types/report.types'

const DEFAULT_SCHEDULE: ReportSchedule = {
  enabled: false,
  recipientEmails: [],
  reportTypes: ['monthly'],
  deliveryConfig: { monthly: { day: 1 } },
  includeAttachment: true,
  emailSubject: 'Relatório Executivo — {dealership_name} | {period}',
  emailBody: '',
}

export function useReportSchedule() {
  const [schedule, setSchedule] = useState<ReportSchedule>(DEFAULT_SCHEDULE)
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [saved, setSaved]       = useState(false)

  const loadSchedule = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/executive-reports/schedule')
      if (!res.ok) throw new Error('Falha ao carregar configurações')
      const { schedule: data } = await res.json()
      setSchedule(data ?? DEFAULT_SCHEDULE)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveSchedule = useCallback(async (updates: ReportSchedule) => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/executive-reports/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Falha ao salvar')
      }
      setSchedule(updates)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSaving(false)
    }
  }, [])

  return { schedule, loading, saving, saved, error, loadSchedule, saveSchedule, setSchedule }
}
