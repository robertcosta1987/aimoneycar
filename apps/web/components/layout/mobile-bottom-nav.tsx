'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Car, Bell, Receipt,
  BarChart3, Upload, Settings, LogOut, X, Menu, Zap, CalendarDays, Users, CalendarClock
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const primaryNav = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/veiculos', icon: Car, label: 'Veículos' },
  { href: '/dashboard/chat', icon: MessageSquare, label: 'Chat IA' },
  { href: '/dashboard/agenda', icon: CalendarDays, label: 'Agenda' },
]

const moreNav = [
  { href: '/dashboard/chat-clientes', icon: Users, label: 'Chat Clientes' },
  { href: '/dashboard/alertas', icon: Bell, label: 'Alertas' },
  { href: '/dashboard/despesas', icon: Receipt, label: 'Despesas' },
  { href: '/dashboard/relatorios', icon: BarChart3, label: 'Relatórios' },
  { href: '/dashboard/relatorios/agendar', icon: CalendarClock, label: 'Email Reports' },
  { href: '/dashboard/importar', icon: Upload, label: 'Importar' },
  { href: '/dashboard/config', icon: Settings, label: 'Configurações' },
]

interface MobileBottomNavProps {
  alertCount?: number
}

export function MobileBottomNav({ alertCount = 0 }: MobileBottomNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    setMenuOpen(false)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isMoreActive = moreNav.some(item => pathname.startsWith(item.href))

  return (
    <>
      {/* Overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* More menu slide-up */}
      {menuOpen && (
        <div className="fixed bottom-16 left-0 right-0 z-50 md:hidden bg-background-paper border-t border-border rounded-t-2xl p-4 space-y-1 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-bold text-sm text-foreground">Moneycar <span className="text-primary">AI</span></span>
            </div>
            <button onClick={() => setMenuOpen(false)} className="p-1 rounded-lg text-foreground-muted hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {moreNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground-muted hover:bg-background-elevated hover:text-foreground'
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            )
          })}

          <div className="pt-2 border-t border-border mt-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-foreground-muted hover:bg-danger/10 hover:text-danger transition-colors"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">Sair</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background-paper border-t border-border">
        <div className="flex items-stretch h-16">
          {primaryNav.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors',
                  active ? 'text-primary' : 'text-foreground-subtle'
                )}
              >
                <div className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.href === '/dashboard/alertas' && alertCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-[10px] bg-danger text-white rounded-full flex items-center justify-center leading-none">
                      {alertCount > 9 ? '9+' : alertCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full" />
                )}
              </Link>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
              isMoreActive || menuOpen ? 'text-primary' : 'text-foreground-subtle'
            )}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Mais</span>
            {(isMoreActive || menuOpen) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        </div>
      </nav>
    </>
  )
}
