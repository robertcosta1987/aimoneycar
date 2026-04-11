'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Car, Bell, Receipt,
  BarChart3, Upload, Settings, LogOut, Zap, ChevronLeft, ChevronRight,
  CalendarDays, Users, CalendarClock, Timer, DollarSign, FileBarChart2,
  MessageCircle, Sparkles, ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type NavItem = { href: string; icon: React.ElementType; label: string }
type NavGroup = { label: string; items: NavItem[] }

// Standalone items (not grouped)
const standaloneTop: NavItem[] = [
  { href: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/chat', icon: MessageSquare,   label: 'Chat IA'   },
]

const standaloneBottom: NavItem[] = [
  { href: '/dashboard/importar', icon: Upload, label: 'Importar' },
]

const groups: NavGroup[] = [
  {
    label: 'Clientes',
    items: [
      { href: '/dashboard/whatsapp',       icon: MessageCircle, label: 'WhatsApp'      },
      { href: '/dashboard/chat-clientes',  icon: Users,         label: 'Chat Clientes' },
      { href: '/dashboard/agenda',         icon: CalendarDays,  label: 'Agenda'        },
    ],
  },
  {
    label: 'Carros',
    items: [
      { href: '/dashboard/veiculos',       icon: Car,           label: 'Veículos'      },
      { href: '/dashboard/envelhecimento', icon: Timer,         label: 'Giro de Estoque' },
      { href: '/dashboard/custos',         icon: DollarSign,    label: 'Custos & Margem' },
      { href: '/dashboard/alertas',        icon: Bell,          label: 'Alertas'       },
      { href: '/dashboard/despesas',       icon: Receipt,       label: 'Despesas'      },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { href: '/dashboard/relatorios',                        icon: BarChart3,     label: 'Performance'   },
      { href: '/dashboard/relatorios-executivos',             icon: FileBarChart2, label: 'Rel. Executivo' },
      { href: '/dashboard/relatorios/roi-valor-agregado',     icon: Sparkles,      label: 'ROI & Valor'   },
      { href: '/dashboard/relatorios/agendar',                icon: CalendarClock, label: 'Email Reports' },
    ],
  },
]

const bottomItems: NavItem[] = [
  { href: '/dashboard/config', icon: Settings, label: 'Configurações' },
]

// Derive which group hrefs belong to, to auto-expand on active route
function groupIsActive(group: NavGroup, pathname: string) {
  return group.items.some(item =>
    pathname === item.href || (pathname?.startsWith(item.href) && item.href !== '/dashboard')
  )
}

function NavLink({ item, collapsed, active }: { item: NavItem; collapsed: boolean; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-150',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground-muted hover:bg-background-elevated hover:text-foreground'
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className={cn('w-4 h-4 flex-shrink-0', active && 'text-primary')} />
      {!collapsed && <span className="text-[14px] font-bold">{item.label}</span>}
    </Link>
  )
}

export function Sidebar() {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createClient()
  const [collapsed, setCollapsed] = useState(false)

  // Each group starts open if a child is active, otherwise closed
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(g => [g.label, groupIsActive(g, pathname ?? '')]))
  )

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className={cn(
      'relative hidden md:flex flex-col h-full bg-background-paper border-r border-border transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 h-16 border-b border-border">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-foreground text-sm">Moneycar</span>
            <span className="text-primary font-bold text-sm"> AI</span>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-background-elevated border border-border flex items-center justify-center hover:bg-background-hover transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* Standalone top items */}
        {standaloneTop.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/dashboard' && (pathname ?? '').startsWith(item.href))
          return <NavLink key={item.href} item={item} collapsed={collapsed} active={active} />
        })}

        {/* Grouped sections */}
        {groups.map(group => {
          const isOpen   = openGroups[group.label] ?? false
          const hasActive = groupIsActive(group, pathname ?? '')

          return (
            <div key={group.label} className="pt-1">
              {/* Group header */}
              {!collapsed ? (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors',
                    hasActive
                      ? 'text-primary'
                      : 'text-foreground-subtle hover:text-foreground-muted'
                  )}
                >
                  <span className="text-[16px] font-bold">
                    {group.label}
                  </span>
                  <ChevronDown className={cn(
                    'w-3 h-3 transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )} />
                </button>
              ) : (
                // Collapsed: show a thin divider instead of the label
                <div className="mx-3 my-1 border-t border-border/60" />
              )}

              {/* Group items */}
              {(isOpen || collapsed) && (
                <div className={cn('space-y-0.5', !collapsed && 'pl-2')}>
                  {group.items.map(item => {
                    const active = pathname === item.href ||
                      (pathname ?? '').startsWith(item.href)
                    return <NavLink key={item.href} item={item} collapsed={collapsed} active={active} />
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Standalone bottom items */}
        <div className="pt-1">
          {!collapsed && (
            <div className="px-3 py-1.5">
              <span className="text-[16px] font-bold text-foreground-subtle">
                Dados
              </span>
            </div>
          )}
          {standaloneBottom.map(item => {
            const active = (pathname ?? '') === item.href
            return <NavLink key={item.href} item={item} collapsed={collapsed} active={active} />
          })}
        </div>
      </nav>

      {/* Bottom */}
      <div className="p-3 space-y-0.5 border-t border-border">
        {bottomItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-150',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground-muted hover:bg-background-elevated hover:text-foreground'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="text-[14px] font-bold">{item.label}</span>}
            </Link>
          )
        })}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-foreground-muted hover:bg-danger/10 hover:text-danger transition-all duration-200"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  )
}
