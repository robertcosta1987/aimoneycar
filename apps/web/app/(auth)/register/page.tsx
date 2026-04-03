'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '', dealershipName: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    // Sign up with Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name } },
    })

    if (authErr || !authData.user) {
      setError(authErr?.message || 'Erro ao criar conta')
      setLoading(false)
      return
    }

    // Create dealership
    const slug = form.dealershipName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const { data: dealership, error: dealErr } = await supabase
      .from('dealerships')
      .insert({ name: form.dealershipName, slug } as any)
      .select()
      .single()

    if (dealErr) {
      setError('Erro ao criar revenda. Tente outro nome.')
      setLoading(false)
      return
    }

    // Create user record
    await supabase.from('users').insert({
      id: authData.user.id,
      dealership_id: (dealership as any).id,
      name: form.name,
      email: form.email,
      role: 'owner',
    } as any)

    router.push('/dashboard')
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Comece seu teste grátis de 14 dias</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input placeholder="João Silva" value={form.name} onChange={set('name')} required disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label>Nome da Revenda</Label>
            <Input placeholder="Silva Veículos" value={form.dealershipName} onChange={set('dealershipName')} required disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" placeholder="joao@silvacar.com" value={form.email} onChange={set('email')} required disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label>Senha</Label>
            <Input type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required disabled={loading} minLength={6} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Criando...</> : 'Criar conta grátis'}
          </Button>
        </form>
        <p className="text-center text-sm text-foreground-muted mt-4">
          Já tem conta?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">Entrar</Link>
        </p>
      </CardContent>
    </Card>
  )
}
