'use client'
import { useState, useEffect } from 'react'
import { AlertTriangle, Bell, CheckCircle, Info, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const alertConfig: Record<string, { icon: any; color: string; bg: string; badge: string }> = {
  critical: { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger/10 border-danger/20', badge: 'destructive' },
  warning: { icon: Bell, color: 'text-warning', bg: 'bg-warning/10 border-warning/20', badge: 'warning' },
  success: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10 border-success/20', badge: 'success' },
  info: { icon: Info, color: 'text-primary', bg: 'bg-primary/10 border-primary/20', badge: 'default' },
}

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadAlerts()
  }, [])

  const loadAlerts = async () => {
    setLoading(true)
    const { data: userData } = await supabase.from('users').select('dealership_id').single()
    const { data } = await supabase
      .from('ai_alerts')
      .select('*, vehicle:vehicles(brand, model, plate)')
      .eq('dealership_id', userData?.dealership_id)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
    setAlerts(data || [])
    setLoading(false)
  }

  const dismiss = async (id: string) => {
    await supabase.from('ai_alerts').update({ is_dismissed: true }).eq('id', id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const markRead = async (id: string) => {
    await supabase.from('ai_alerts').update({ is_read: true }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
  }

  const counts = {
    all: alerts.length,
    critical: alerts.filter(a => a.type === 'critical').length,
    warning: alerts.filter(a => a.type === 'warning').length,
    success: alerts.filter(a => a.type === 'success').length,
    info: alerts.filter(a => a.type === 'info').length,
  }

  const renderAlerts = (filtered: any[]) => (
    <div className="space-y-3 mt-4">
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-foreground-muted">✅ Nenhum alerta nesta categoria</div>
      ) : (
        filtered.map((alert) => {
          const cfg = alertConfig[alert.type] || alertConfig.info
          const Icon = cfg.icon
          const vehicle = alert.vehicle as any
          return (
            <div
              key={alert.id}
              className={`p-4 rounded-xl border flex gap-4 ${cfg.bg} ${!alert.is_read ? 'ring-1 ring-inset ring-current/10' : ''}`}
              onClick={() => markRead(alert.id)}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm text-foreground">{alert.title}</p>
                  {!alert.is_read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                </div>
                <p className="text-sm text-foreground-muted mt-1">{alert.message}</p>
                {vehicle && (
                  <p className="text-xs text-foreground-subtle mt-1">
                    🚗 {vehicle.brand} {vehicle.model} {vehicle.plate && `· ${vehicle.plate}`}
                  </p>
                )}
                <p className="text-xs text-foreground-subtle mt-1">
                  {new Date(alert.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 w-7 h-7 hover:bg-background-elevated/50"
                onClick={(e) => { e.stopPropagation(); dismiss(alert.id) }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alertas IA</h1>
        <p className="text-foreground-muted text-sm mt-1">Recomendações geradas automaticamente</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Críticos', count: counts.critical, color: 'text-danger', bg: 'bg-danger/10' },
          { label: 'Atenção', count: counts.warning, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'Positivos', count: counts.success, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Informativos', count: counts.info, color: 'text-primary', bg: 'bg-primary/10' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-foreground-muted mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos ({counts.all})</TabsTrigger>
          <TabsTrigger value="critical">Críticos ({counts.critical})</TabsTrigger>
          <TabsTrigger value="warning">Atenção ({counts.warning})</TabsTrigger>
          <TabsTrigger value="success">Positivos ({counts.success})</TabsTrigger>
        </TabsList>
        <TabsContent value="all">{renderAlerts(alerts)}</TabsContent>
        <TabsContent value="critical">{renderAlerts(alerts.filter(a => a.type === 'critical'))}</TabsContent>
        <TabsContent value="warning">{renderAlerts(alerts.filter(a => a.type === 'warning'))}</TabsContent>
        <TabsContent value="success">{renderAlerts(alerts.filter(a => a.type === 'success'))}</TabsContent>
      </Tabs>
    </div>
  )
}
