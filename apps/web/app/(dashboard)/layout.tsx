import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user + dealership info
  const { data: userData } = await supabase
    .from('users')
    .select('name, dealership:dealerships(name)')
    .eq('id', user.id)
    .single()

  const dealership = userData?.dealership as any

  // Count unread alerts
  const { count: alertCount } = await supabase
    .from('ai_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('dealership_id', dealership?.id)
    .eq('is_read', false)
    .eq('is_dismissed', false)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          dealershipName={dealership?.name}
          userName={userData?.name}
          alertCount={alertCount || 0}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
      <MobileBottomNav alertCount={alertCount || 0} />
    </div>
  )
}
