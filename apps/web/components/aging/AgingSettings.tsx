/**
 * components/aging/AgingSettings.tsx
 * Manager panel to customise attention/critical thresholds.
 * Persists to localStorage via useAgingThresholds hook.
 * Includes a live preview showing how the current inventory distributes under new thresholds.
 */

'use client'
import { useState } from 'react'
import { Settings2, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useAgingThresholds } from '@/hooks/use-aging-thresholds'
import { getAgingStatus } from '@/lib/aging'

interface AgingSettingsProps {
  /** Pass current vehicle day counts for the live preview */
  vehicleDays: number[]
}

export function AgingSettings({ vehicleDays }: AgingSettingsProps) {
  const { thresholds, setThresholds, loaded } = useAgingThresholds()
  const [draft, setDraft] = useState(thresholds)
  const [saved, setSaved] = useState(false)

  if (!loaded) return null

  const preview = {
    ok: vehicleDays.filter(d => getAgingStatus(d, draft).level === 'ok').length,
    attention: vehicleDays.filter(d => getAgingStatus(d, draft).level === 'attention').length,
    critical: vehicleDays.filter(d => getAgingStatus(d, draft).level === 'critical').length,
  }

  const valid = draft.attention >= 1 && draft.critical > draft.attention

  function handleSave() {
    if (!valid) return
    setThresholds(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    const defaults = { attention: 45, critical: 90 }
    setDraft(defaults)
    setThresholds(defaults)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          Configuração de Alertas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="att-threshold" className="text-xs text-foreground-muted">
              Limite de Atenção (dias)
            </Label>
            <Input
              id="att-threshold"
              type="number"
              min={1}
              max={draft.critical - 1}
              value={draft.attention}
              onChange={e => setDraft(d => ({ ...d, attention: parseInt(e.target.value) || 0 }))}
              className="w-full"
              aria-describedby="att-help"
            />
            <p id="att-help" className="text-xs text-foreground-subtle">
              Veículos acima deste limite recebem status ⚠️ Atenção
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="crit-threshold" className="text-xs text-foreground-muted">
              Limite Crítico (dias)
            </Label>
            <Input
              id="crit-threshold"
              type="number"
              min={draft.attention + 1}
              value={draft.critical}
              onChange={e => setDraft(d => ({ ...d, critical: parseInt(e.target.value) || 0 }))}
              className="w-full"
              aria-describedby="crit-help"
            />
            <p id="crit-help" className="text-xs text-foreground-subtle">
              Veículos acima deste limite recebem status 🔴 Crítico
            </p>
          </div>
        </div>

        {!valid && (
          <p className="text-xs text-danger" role="alert">
            O limite crítico deve ser maior que o limite de atenção.
          </p>
        )}

        {/* Live preview */}
        {vehicleDays.length > 0 && (
          <div className="rounded-xl bg-background-elevated p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground-muted flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Pré-visualização com os novos limites ({vehicleDays.length} veículos)
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success" className="gap-1">
                🟢 {preview.ok} OK
                <span className="text-[10px] opacity-70">(0–{draft.attention - 1}d)</span>
              </Badge>
              <Badge variant="warning" className="gap-1">
                🟡 {preview.attention} Atenção
                <span className="text-[10px] opacity-70">({draft.attention}–{draft.critical - 1}d)</span>
              </Badge>
              <Badge variant="destructive" className="gap-1">
                🔴 {preview.critical} Crítico
                <span className="text-[10px] opacity-70">({draft.critical}+d)</span>
              </Badge>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={!valid} size="sm" className="gap-2">
            {saved ? '✓ Salvo' : 'Salvar Configuração'}
          </Button>
          <Button onClick={handleReset} variant="ghost" size="sm">
            Restaurar Padrão
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
