'use client'
import { Bell, Search, Zap } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface HeaderProps {
  dealershipName?: string
  userName?: string
  alertCount?: number
}

export function Header({ dealershipName = 'Minha Revenda', userName = 'Usuário', alertCount = 0 }: HeaderProps) {
  return (
    <header className="h-14 md:h-16 border-b border-border bg-background-paper px-4 md:px-6 flex items-center justify-between gap-3">
      {/* Mobile: logo | Desktop: search bar */}
      <div className="flex items-center gap-2 md:hidden">
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="font-bold text-sm text-foreground">Moneycar <span className="text-primary">AI</span></span>
      </div>

      <div className="hidden md:block flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" />
          <Input placeholder="Buscar veículo, placa, cliente..." className="pl-9 h-9 text-sm" />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Alert bell — hidden on mobile (alerts accessible via bottom nav) */}
        <Link href="/dashboard/alertas" className="hidden md:block">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 text-xs bg-danger text-white rounded-full flex items-center justify-center">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs bg-primary/20 text-primary">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-foreground leading-none">{userName}</p>
            <p className="text-xs text-foreground-subtle mt-0.5">{dealershipName}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
