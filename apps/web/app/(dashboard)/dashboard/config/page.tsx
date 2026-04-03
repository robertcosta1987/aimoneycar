'use client'
import { useState, useEffect } from 'react'
import { Save, Building } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ConfigPage() {
  const [form, setForm] = useState({ name: '', phone: '', whatsapp: '', city: '', state: '' })
  const [dealershipId, setDealershipId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('dealership_id, dealership:dealerships(id, name, phone, whatsapp, city, state)')
        .eq('id', user.id)
        .single()

      const dealership = userData?.dealership as any
      if (dealership) {
        setDealershipId(dealership.id)
        setForm({
          name: dealership.name || '',
          phone: dealership.phone || '',
          whatsapp: dealership.whatsapp || '',
          city: dealership.city || '',
          state: dealership.state || '',
        })
      }
    }
    load()
  }, [])

  const save = async () => {
    if (!dealershipId) return
    setSaving(true)
    setStatus('')
    const supabase = createClient()
    const { error } = await supabase.from('dealerships').update(form).eq('id', dealershipId)
    setSaving(false)
    setStatus(error ? 'Erro ao salvar.' : 'Salvo com sucesso!')
    setTimeout(() => setStatus(''), 3000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-foreground-muted text-sm mt-1">Configure sua revenda e preferências</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="w-4 h-4 text-primary" />
            Dados da Revenda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da Revenda</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Sua Revenda Veículos" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 9999-9999" />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="(11) 99999-9999" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={2} placeholder="SP" />
            </div>
          </div>
          {status && <p className={`text-sm ${status.includes('Erro') ? 'text-danger' : 'text-success'}`}>{status}</p>}
          <Button onClick={save} disabled={saving || !dealershipId} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
