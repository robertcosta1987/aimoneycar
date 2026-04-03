'use client'
import { useState, useEffect } from 'react'
import { Save, Building, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface DealershipStatus {
  userId: string
  userEmail: string
  userName: string
  dealershipId: string | null
  dealershipName: string | null
  dealershipLinked: boolean
}

export default function ConfigPage() {
  const [form, setForm] = useState({ name: '', phone: '', whatsapp: '', city: '', state: '' })
  const [status, setStatus] = useState<DealershipStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: userData } = await supabase
      .from('users')
      .select('name, dealership_id, dealership:dealerships(id, name, phone, whatsapp, city, state)')
      .eq('id', user.id)
      .single()

    const dealership = userData?.dealership as any

    setStatus({
      userId: user.id,
      userEmail: user.email ?? '',
      userName: userData?.name ?? '',
      dealershipId: dealership?.id ?? null,
      dealershipName: dealership?.name ?? null,
      dealershipLinked: !!dealership?.id,
    })

    if (dealership) {
      setForm({
        name: dealership.name || '',
        phone: dealership.phone || '',
        whatsapp: dealership.whatsapp || '',
        city: dealership.city || '',
        state: dealership.state || '',
      })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name.trim()) { setMsg('Nome da revenda é obrigatório.'); return }
    setSaving(true)
    setMsg('')

    if (status?.dealershipLinked) {
      const supabase = createClient()
      const { error } = await supabase.from('dealerships').update(form).eq('id', status.dealershipId!)
      setSaving(false)
      setMsg(error ? `Erro: ${error.message}` : 'Salvo com sucesso!')
    } else {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: status?.userId,
          name: status?.userName || status?.userEmail,
          email: status?.userEmail,
          dealershipName: form.name,
        }),
      })
      setSaving(false)
      if (res.ok) {
        setMsg('Revenda criada com sucesso!')
        await load()
      } else {
        const { error } = await res.json()
        setMsg(`Erro: ${error}`)
      }
    }
    setTimeout(() => setMsg(''), 5000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-foreground-muted text-sm mt-1">Configure sua revenda e preferências</p>
      </div>

      {/* Dealership status card */}
      <Card className={status?.dealershipLinked ? 'border-success/30' : 'border-warning/30'}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Building className="w-4 h-4 text-primary" />
              Status da Revenda
            </span>
            <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {loading ? (
            <p className="text-foreground-muted">Carregando...</p>
          ) : status ? (
            <>
              <div className="flex items-center gap-2">
                {status.dealershipLinked
                  ? <CheckCircle className="w-4 h-4 text-success shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-warning shrink-0" />}
                <span className="font-medium">
                  {status.dealershipLinked ? 'Revenda vinculada' : 'Nenhuma revenda vinculada'}
                </span>
                <Badge variant={status.dealershipLinked ? 'success' : 'warning'}>
                  {status.dealershipLinked ? 'OK' : 'Pendente'}
                </Badge>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-foreground-muted mt-2">
                <span>Usuário:</span><span className="text-foreground">{status.userEmail}</span>
                <span>User ID:</span><span className="text-foreground font-mono text-xs break-all">{status.userId}</span>
                {status.dealershipId && (
                  <>
                    <span>Revenda:</span><span className="text-foreground">{status.dealershipName}</span>
                    <span>Dealer ID:</span><span className="text-foreground font-mono text-xs break-all">{status.dealershipId}</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="text-foreground-muted">Não autenticado</p>
          )}
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="w-4 h-4 text-primary" />
            {status?.dealershipLinked ? 'Dados da Revenda' : 'Criar Revenda'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.dealershipLinked && (
            <p className="text-sm text-foreground-muted bg-background-elevated p-3 rounded-lg">
              Sua conta ainda não tem uma revenda vinculada. Preencha o nome abaixo para criar.
            </p>
          )}
          <div className="space-y-2">
            <Label>Nome da Revenda *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Silva Veículos" />
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
          {msg && (
            <p className={`text-sm ${msg.includes('Erro') ? 'text-danger' : 'text-success'}`}>{msg}</p>
          )}
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : status?.dealershipLinked ? 'Salvar' : 'Criar Revenda'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
