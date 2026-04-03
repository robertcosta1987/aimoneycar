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
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setUserEmail(user.email ?? '')

      const { data: userData } = await supabase
        .from('users')
        .select('name, dealership_id, dealership:dealerships(id, name, phone, whatsapp, city, state)')
        .eq('id', user.id)
        .single()

      if (userData?.name) setUserName(userData.name)

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
    if (!form.name.trim()) {
      setStatus('Nome da revenda é obrigatório.')
      return
    }
    setSaving(true)
    setStatus('')

    if (dealershipId) {
      // Update existing dealership
      const supabase = createClient()
      const { error } = await supabase.from('dealerships').update(form).eq('id', dealershipId)
      setSaving(false)
      setStatus(error ? `Erro: ${error.message}` : 'Salvo com sucesso!')
    } else {
      // Create dealership via service-role API
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: userName || userEmail,
          email: userEmail,
          dealershipName: form.name,
        }),
      })
      setSaving(false)
      if (res.ok) {
        const { dealershipId: newId } = await res.json()
        setDealershipId(newId)
        setStatus('Revenda criada com sucesso!')
      } else {
        const { error } = await res.json()
        setStatus(`Erro: ${error}`)
      }
    }

    setTimeout(() => setStatus(''), 4000)
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
            {dealershipId ? 'Dados da Revenda' : 'Criar Revenda'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!dealershipId && (
            <p className="text-sm text-foreground-muted bg-background-elevated p-3 rounded-lg">
              Sua conta ainda não tem uma revenda vinculada. Preencha o nome abaixo para criar.
            </p>
          )}
          <div className="space-y-2">
            <Label>Nome da Revenda *</Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Silva Veículos"
            />
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
          {status && (
            <p className={`text-sm ${status.includes('Erro') ? 'text-danger' : 'text-success'}`}>
              {status}
            </p>
          )}
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : dealershipId ? 'Salvar' : 'Criar Revenda'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
