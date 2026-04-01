'use client'
import { useState, useEffect } from 'react'
import { Save, Bell, MessageSquare, User, Building } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ConfigPage() {
  const [form, setForm] = useState({ name: '', phone: '', whatsapp: '', city: '', state: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.from('users').select('dealership:dealerships(*)').single()
      const dealership = userData?.dealership as any
      if (dealership) {
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
    setSaving(true)
    const { data: userData } = await supabase.from('users').select('dealership_id').single()
    await supabase.from('dealerships').update(form).eq('id', userData?.dealership_id)
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-foreground-muted text-sm mt-1">Configure sua revenda e preferências</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building className="w-4 h-4 text-primary" />Dados da Revenda</CardTitle></CardHeader>
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
              <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={2} />
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
