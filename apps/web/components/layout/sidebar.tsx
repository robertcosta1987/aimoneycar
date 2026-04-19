'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Car, Bell, Receipt,
  BarChart3, Upload, Settings, LogOut, ChevronLeft, ChevronRight,
  CalendarDays, Users, CalendarClock, Timer, DollarSign, FileBarChart2,
  MessageCircle, Sparkles, ChevronDown, BrainCircuit,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type NavItem = { href: string; icon: React.ElementType; label: string }
type NavGroup = { label: string; items: NavItem[] }

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
      { href: '/dashboard/relatorios',                    icon: BarChart3,     label: 'Performance'    },
      { href: '/dashboard/relatorios-executivos',         icon: FileBarChart2, label: 'Rel. Executivo' },
      { href: '/dashboard/inteligencia',                  icon: BrainCircuit,  label: 'Inteligência'   },
      { href: '/dashboard/relatorios/roi-valor-agregado', icon: Sparkles,      label: 'ROI & Valor'    },
      { href: '/dashboard/relatorios/agendar',            icon: CalendarClock, label: 'Email Reports'  },
    ],
  },
]

const bottomItems: NavItem[] = [
  { href: '/dashboard/config', icon: Settings, label: 'Configurações' },
]

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
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
        active
          ? [
              'bg-gradient-to-r from-primary/[0.15] to-primary/[0.04]',
              'text-primary font-medium',
              'border-l-2 border-primary shadow-[inset_0_0_16px_rgb(var(--primary)/0.05)]',
              'pl-[10px]', // compensate for 2px border-left
            ]
          : 'text-foreground-muted hover:bg-background-elevated hover:text-foreground font-normal'
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-primary' : 'text-foreground-subtle')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)

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
      'relative hidden md:flex flex-col h-full border-r border-border transition-all duration-300',
      'bg-background-paper',
      collapsed ? 'w-[60px]' : 'w-60'
    )}>

      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-border h-12 px-4',
        collapsed ? 'justify-center' : 'gap-2'
      )}>
        {collapsed ? (
          <span className="font-black text-base text-primary tracking-tighter">M</span>
        ) : (
          <span className="font-black text-[17px] tracking-tight leading-none">
            <span className="text-primary">Money</span><span className="text-foreground">car</span>
            <span className="ml-1 text-[10px] font-semibold tracking-widest uppercase text-foreground-subtle align-middle">IA</span>
          </span>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'absolute -right-3 top-[52px] w-6 h-6 rounded-full z-10',
          'bg-background-paper border border-border',
          'flex items-center justify-center',
          'text-foreground-muted hover:text-foreground hover:border-border-hover',
          'transition-all duration-150 shadow-card'
        )}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {standaloneTop.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/dashboard' && (pathname ?? '').startsWith(item.href))
          return <NavLink key={item.href} item={item} collapsed={collapsed} active={active} />
        })}

        {groups.map(group => {
          const isOpen    = openGroups[group.label] ?? false
          const hasActive = groupIsActive(group, pathname ?? '')

          return (
            <div key={group.label} className="pt-3">
              {!collapsed ? (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1 rounded-md mb-0.5 transition-colors',
                    hasActive ? 'text-primary' : 'text-foreground-subtle hover:text-foreground-muted'
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em]">
                    {group.label}
                  </span>
                  <ChevronDown className={cn(
                    'w-3 h-3 transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )} />
                </button>
              ) : (
                <div className="mx-2 mb-1 border-t border-border/50" />
              )}

              {(isOpen || collapsed) && (
                <div className="space-y-0.5">
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

        {/* Import CTA */}
        <div className="pt-3">
          {!collapsed && (
            <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle">
              Dados
            </span>
          )}
          {standaloneBottom.map(item => (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 mt-0.5',
                'bg-primary text-white hover:bg-primary/90',
                'shadow-[0_1px_2px_rgba(0,0,0,0.15),0_0_0_1px_rgb(var(--primary)/0.3)]',
                'hover:shadow-[0_4px_16px_rgb(var(--primary)/0.35)]',
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-2 py-2 border-t border-border space-y-0.5">
        {bottomItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                active
                  ? 'bg-gradient-to-r from-primary/[0.15] to-primary/[0.04] text-primary font-medium border-l-2 border-primary pl-[10px]'
                  : 'text-foreground-muted hover:bg-background-elevated hover:text-foreground'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
            'text-foreground-muted hover:bg-danger/10 hover:text-danger'
          )}
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  )
}
