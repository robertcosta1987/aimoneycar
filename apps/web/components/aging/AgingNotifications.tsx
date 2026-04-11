/**
 * components/aging/AgingNotifications.tsx
 * Client-side notification trigger for aging vehicles.
 * On mount, checks all available vehicles against aging thresholds and fires
 * Sonner toast notifications for new attention/critical vehicles.
 * Uses localStorage to ensure each vehicle triggers at most once per browser session.
 */

'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { getAgingStatus, loadThresholds } from '@/lib/aging'

interface AgingNotificationsProps {
  /** Lightweight vehicle list: only id + days_in_stock needed */
  vehicles: Array<{ id: string; days_in_stock: number }>
}

const SESSION_KEY = 'moneycar_aging_notified'

function getNotifiedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveNotifiedSet(ids: Set<string>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

export function AgingNotifications({ vehicles }: AgingNotificationsProps) {
  useEffect(() => {
    if (!vehicles || vehicles.length === 0) return

    const thresholds = loadThresholds()
    const notified = getNotifiedSet()

    const newAttention: string[] = []
    const newCritical: string[] = []

    vehicles.forEach(v => {
      if (notified.has(v.id)) return
      const status = getAgingStatus(v.days_in_stock, thresholds)
      if (status.level === 'critical') newCritical.push(v.id)
      else if (status.level === 'attention') newAttention.push(v.id)
    })

    // Fire toasts with a short delay so the page has time to render first
    const timer = setTimeout(() => {
      if (newCritical.length > 0) {
        toast.error(
          `🔴 ${newCritical.length} veículo${newCritical.length > 1 ? 's' : ''} em situação CRÍTICA — mais de ${thresholds.critical} dias em estoque`,
          {
            duration: 8000,
            action: { label: 'Ver Alertas', onClick: () => { window.location.href = '/dashboard/envelhecimento' } },
          }
        )
      }
      if (newAttention.length > 0) {
        toast.warning(
          `⚠️ ${newAttention.length} veículo${newAttention.length > 1 ? 's' : ''} precisam de atenção — mais de ${thresholds.attention} dias em estoque`,
          {
            duration: 6000,
            action: { label: 'Ver Alertas', onClick: () => { window.location.href = '/dashboard/envelhecimento' } },
          }
        )
      }

      // Mark all checked vehicles as notified for this session
      ;[...newAttention, ...newCritical].forEach(id => notified.add(id))
      saveNotifiedSet(notified)
    }, 1500)

    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
