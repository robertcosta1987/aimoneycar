'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, MessageSquare, Receipt, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/demo/relatorios', icon: BarChart3, label: 'Relatórios' },
  { href: '/demo/despesas', icon: Receipt, label: 'Despesas' },
  { href: '/demo/chat', icon: MessageSquare, label: 'Chat IA' },
  { href: '/demo/importar', icon: Upload, label: 'Importar' },
]

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="flex flex-col w-64 h-full bg-background-paper border-r border-border">
        <div className="flex items-center justify-between px-4 py-3 h-32 border-b border-border">
          <span className="font-black text-[34px] text-primary tracking-tight">Moneycar <span className="text-foreground">IA</span></span>
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Demo</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground-muted hover:bg-background-elevated hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border space-y-2">
          <p className="text-xs text-foreground-muted text-center">Dados fictícios para demonstração</p>
          <Button asChild className="w-full" size="sm">
            <Link href="/register">Criar conta grátis</Link>
          </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-background-paper">
          <p className="text-sm text-foreground-muted">
            Modo demonstração — <span className="text-foreground">dados fictícios</span>
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/register">Começar grátis</Link>
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
