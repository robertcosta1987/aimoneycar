import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { ChatClientesClient } from './client'

export default async function ChatClientesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('dealership_id, dealership:dealerships(name, slug)')
    .eq('id', user.id)
    .single()

  const dealership = userData?.dealership as any
  if (!dealership?.slug) redirect('/dashboard')

  // Base URL from request headers
  const headersList = headers()
  const host = headersList.get('host') || 'localhost:3000'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`

  // Recent widget conversations
  const { data: conversations } = await supabase
    .from('widget_conversas')
    .select('id, lead_nome, lead_telefone, lead_email, qualificado, temperatura, convertido, dados_qualificacao, started_at, agendamento_id')
    .eq('dealership_id', userData!.dealership_id)
    .order('started_at', { ascending: false })
    .limit(20)

  return (
    <ChatClientesClient
      dealershipName={dealership.name}
      slug={dealership.slug}
      baseUrl={baseUrl}
      conversations={conversations || []}
    />
  )
}
