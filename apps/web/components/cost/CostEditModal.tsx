/**
 * components/cost/CostEditModal.tsx
 *
 * Focused modal for editing a vehicle's cost data:
 *  - Purchase price (required, must be > 0 to save)
 *  - Linked expenses mini-table (category | description | amount | date)
 *  - Add-expense inline form with validation
 *  - Delete expense with confirmation
 *  - Live preview: True Cost total + Projected Margin %
 *
 * Validation rules:
 *  - Purchase price must be > 0
 *  - Expense amount must be > 0
 *  - Expense date cannot be before vehicle purchase_date
 *
 * On save: updates Supabase directly via browser client, optimistically
 * updates parent state via onSave(), shows Sonner toast on success.
 *
 * Inputs:
 *   vehicle  – full VehicleForCost with expenses
 *   open     – controls Dialog visibility
 *   onClose  – called when modal closes
 *   onSave   – called with updated purchase_price + new expenses list after persist
 */

'use client'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Calculator, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'
import { calculateTrueCost, calculateGrossMargin } from '@/utils/vehicleCost'
import { EXPENSE_CATEGORIES } from '@/types/cost'
import { createClient } from '@/lib/supabase/client'
import type { VehicleForCost } from '@/types/cost'
import type { Expense } from '@/types/index'
import { cn } from '@/lib/utils'

interface CostEditModalProps {
  vehicle: VehicleForCost
  open: boolean
  onClose: () => void
  onSave: (updatedVehicle: VehicleForCost) => void
}

interface ExpenseDraft {
  category: string
  description: string
  amount: string
  date: string
}

const EMPTY_DRAFT: ExpenseDraft = {
  category: '',
  description: '',
  amount: '',
  date: new Date().toISOString().split('T')[0],
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(',', '.')) || 0
}

export function CostEditModal({ vehicle, open, onClose, onSave }: CostEditModalProps) {
  const supabase = createClient()

  const [purchasePriceRaw, setPurchasePriceRaw] = useState(
    vehicle.purchase_price > 0 ? String(vehicle.purchase_price) : ''
  )
  const [expenses, setExpenses] = useState<Expense[]>(vehicle.expenses)
  const [draft, setDraft] = useState<ExpenseDraft>(EMPTY_DRAFT)
  const [draftErrors, setDraftErrors] = useState<Partial<Record<keyof ExpenseDraft, string>>>({})
  const [purchaseError, setPurchaseError] = useState('')
  const [addingExpense, setAddingExpense] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const purchasePrice = parseAmount(purchasePriceRaw)

  // Live preview using current draft state
  const previewVehicle: VehicleForCost = useMemo(() => ({
    ...vehicle,
    purchase_price: purchasePrice,
    expenses,
  }), [vehicle, purchasePrice, expenses])

  const trueCost = useMemo(() => calculateTrueCost(previewVehicle), [previewVehicle])
  const grossMargin = useMemo(() => calculateGrossMargin(previewVehicle), [previewVehicle])
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses]
  )

  // ─── Validation ───────────────────────────────────────────────────────────

  function validateDraft(): boolean {
    const errors: Partial<Record<keyof ExpenseDraft, string>> = {}

    if (!draft.category) errors.category = 'Selecione uma categoria'
    if (parseAmount(draft.amount) <= 0) errors.amount = 'O valor deve ser maior que R$ 0'
    if (!draft.date) {
      errors.date = 'Informe a data'
    } else if (vehicle.purchase_date && draft.date < vehicle.purchase_date) {
      errors.date = `A data não pode ser anterior a ${formatDate(vehicle.purchase_date)}`
    }

    setDraftErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ─── Add expense (persist immediately) ───────────────────────────────────

  async function handleAddExpense() {
    if (!validateDraft()) return
    setAddingExpense(true)

    const { data: profile } = await supabase.from('users').select('dealership_id').single()

    const payload = {
      dealership_id: profile?.dealership_id,
      vehicle_id: vehicle.id,
      category: draft.category,
      description: draft.description || null,
      amount: parseAmount(draft.amount),
      date: draft.date,
    }

    const { data: newExpense, error } = await supabase
      .from('expenses')
      .insert(payload)
      .select()
      .single()

    if (error || !newExpense) {
      toast.error('Erro ao adicionar despesa: ' + (error?.message ?? 'Tente novamente'))
    } else {
      setExpenses(prev => [...prev, newExpense as Expense])
      setDraft(EMPTY_DRAFT)
      setDraftErrors({})
    }

    setAddingExpense(false)
  }

  // ─── Delete expense ───────────────────────────────────────────────────────

  async function handleDeleteExpense(id: string) {
    setDeletingId(id)
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) {
      toast.error('Erro ao remover despesa: ' + error.message)
    } else {
      setExpenses(prev => prev.filter(e => e.id !== id))
    }
    setDeletingId(null)
  }

  // ─── Save purchase price ──────────────────────────────────────────────────

  async function handleSave() {
    if (purchasePrice <= 0) {
      setPurchaseError('O preço de compra deve ser maior que R$ 0')
      return
    }
    setPurchaseError('')
    setSaving(true)

    const { error } = await supabase
      .from('vehicles')
      .update({ purchase_price: purchasePrice })
      .eq('id', vehicle.id)

    if (error) {
      toast.error('Erro ao salvar: ' + error.message)
      setSaving(false)
      return
    }

    toast.success('✅ Dados de custo atualizados — margem recalculada')
    onSave({ ...vehicle, purchase_price: purchasePrice, expenses })
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background-paper border border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Calculator className="w-5 h-5 text-primary" />
            Editar Dados de Custo — {vehicle.brand} {vehicle.model}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Purchase price */}
          <div className="space-y-2">
            <Label htmlFor="purchase-price" className="text-sm font-semibold text-foreground">
              Preço de Compra (R$) <span className="text-danger">*</span>
            </Label>
            <Input
              id="purchase-price"
              type="number"
              min="1"
              step="0.01"
              placeholder="Ex: 30000"
              value={purchasePriceRaw}
              onChange={e => {
                setPurchasePriceRaw(e.target.value)
                if (purchaseError) setPurchaseError('')
              }}
              className={cn('font-mono', purchaseError && 'border-danger focus-visible:ring-danger')}
              aria-describedby={purchaseError ? 'purchase-error' : undefined}
            />
            {purchaseError && (
              <p id="purchase-error" className="text-xs text-danger" role="alert">
                {purchaseError}
              </p>
            )}
          </div>

          {/* Live preview */}
          {purchasePrice > 0 && (
            <div className="rounded-xl bg-background-elevated p-4 space-y-2 border border-border">
              <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wide">
                Prévia em Tempo Real
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-foreground-muted">Custo Real</p>
                  <p className="font-bold text-foreground font-mono">{formatCurrency(trueCost)}</p>
                </div>
                {vehicle.sale_price ? (
                  <>
                    <div>
                      <p className="text-xs text-foreground-muted">Margem Projetada</p>
                      <p className={cn(
                        'font-bold font-mono',
                        grossMargin >= 15 ? 'text-success' :
                        grossMargin >= 5 ? 'text-secondary' :
                        grossMargin >= 0 ? 'text-warning' : 'text-danger'
                      )}>
                        {formatPercent(grossMargin)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted">Lucro Bruto</p>
                      <p className={cn(
                        'font-bold font-mono',
                        (vehicle.sale_price - trueCost) >= 0 ? 'text-success' : 'text-danger'
                      )}>
                        {formatCurrency(vehicle.sale_price - trueCost)}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <p className="text-xs text-foreground-muted">Preço de venda não definido</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Expense list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Despesas Vinculadas
                {expenses.length > 0 && (
                  <span className="ml-2 text-xs text-foreground-muted font-normal">
                    {expenses.length} item{expenses.length !== 1 ? 's'  : ''} ·{' '}
                    {formatCurrency(totalExpenses)}
                  </span>
                )}
              </p>
            </div>

            {expenses.length === 0 ? (
              <p className="text-sm text-foreground-muted py-3 text-center border border-dashed border-border rounded-xl">
                Nenhuma despesa registrada ainda
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2 text-xs text-foreground-muted font-medium">Data</th>
                      <th className="text-left px-3 py-2 text-xs text-foreground-muted font-medium">Categoria</th>
                      <th className="text-left px-3 py-2 text-xs text-foreground-muted font-medium hidden sm:table-cell">Descrição</th>
                      <th className="text-right px-3 py-2 text-xs text-foreground-muted font-medium">Valor</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id} className="border-b border-border last:border-0 hover:bg-background-elevated/40">
                        <td className="px-3 py-2 text-foreground-muted font-mono text-xs">
                          {formatDate(e.date)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {e.category}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-foreground-muted text-xs hidden sm:table-cell">
                          {e.description || '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-warning">
                          {formatCurrency(e.amount)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleDeleteExpense(e.id)}
                            disabled={deletingId === e.id}
                            aria-label="Remover despesa"
                            className="p-1 text-foreground-subtle hover:text-danger transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-foreground-muted">
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-warning">
                        {formatCurrency(totalExpenses)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Add expense form */}
            <div className="rounded-xl border border-border/50 bg-background-elevated/30 p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground-muted flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Adicionar Despesa
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="exp-category" className="text-xs text-foreground-muted">
                    Categoria <span className="text-danger">*</span>
                  </Label>
                  <Select
                    value={draft.category}
                    onValueChange={v => {
                      setDraft(d => ({ ...d, category: v }))
                      if (draftErrors.category) setDraftErrors(e => ({ ...e, category: undefined }))
                    }}
                  >
                    <SelectTrigger
                      id="exp-category"
                      className={cn('text-xs', draftErrors.category && 'border-danger')}
                    >
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat} className="text-xs">
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {draftErrors.category && (
                    <p className="text-xs text-danger" role="alert">{draftErrors.category}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="exp-description" className="text-xs text-foreground-muted">
                    Descrição
                  </Label>
                  <Input
                    id="exp-description"
                    placeholder="Opcional"
                    value={draft.description}
                    onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="exp-amount" className="text-xs text-foreground-muted">
                    Valor (R$) <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="exp-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Ex: 350"
                    value={draft.amount}
                    onChange={e => {
                      setDraft(d => ({ ...d, amount: e.target.value }))
                      if (draftErrors.amount) setDraftErrors(e => ({ ...e, amount: undefined }))
                    }}
                    className={cn('font-mono text-xs', draftErrors.amount && 'border-danger')}
                  />
                  {draftErrors.amount && (
                    <p className="text-xs text-danger" role="alert">{draftErrors.amount}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="exp-date" className="text-xs text-foreground-muted">
                    Data <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="exp-date"
                    type="date"
                    min={vehicle.purchase_date || undefined}
                    value={draft.date}
                    onChange={e => {
                      setDraft(d => ({ ...d, date: e.target.value }))
                      if (draftErrors.date) setDraftErrors(e => ({ ...e, date: undefined }))
                    }}
                    className={cn('text-xs', draftErrors.date && 'border-danger')}
                  />
                  {draftErrors.date && (
                    <p className="text-xs text-danger" role="alert">{draftErrors.date}</p>
                  )}
                </div>
              </div>

              <Button
                onClick={handleAddExpense}
                disabled={addingExpense}
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                {addingExpense ? 'Adicionando...' : 'Adicionar Despesa'}
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            <X className="w-4 h-4 mr-1" />
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || purchasePrice <= 0}
            size="sm"
            className="gap-1.5"
          >
            <Calculator className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
