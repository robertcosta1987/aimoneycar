'use client'
import { useState, useEffect } from 'react'
import { Bell, Sun, Moon } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface HeaderProps {
  dealershipName?: string
  userName?: string
  alertCount?: number
}

export function Header({ dealershipName = 'Minha Revenda', userName = 'Usuário', alertCount = 0 }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <header className="h-12 px-4 md:px-5 flex items-center justify-between gap-3 header-glass sticky top-0 z-20">

      {/* Mobile branding */}
      <div className="flex items-center gap-2 md:hidden">
        <span className="font-black text-sm tracking-tight">
          <span className="text-primary">Money</span><span className="text-foreground">car</span>
          <span className="ml-1 text-[9px] font-semibold tracking-widest uppercase text-foreground-subtle">IA</span>
        </span>
      </div>

      {/* Slogan */}
      <div className="flex-1 flex justify-center">
        <p className="text-[11px] font-medium text-foreground-subtle text-center hidden sm:block tracking-wide">
          Seus dados viram decisões.{' '}
          <span className="text-primary font-semibold">Sua revenda vira máquina.</span>
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-muted hover:text-foreground hover:bg-background-elevated transition-all duration-150"
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark'
              ? <Sun className="w-4 h-4" />
              : <Moon className="w-4 h-4" />
            }
          </button>
        )}

        {/* Alerts */}
        <Link href="/dashboard/alertas" className="hidden md:block">
          <Button variant="ghost" size="icon" className="relative w-8 h-8">
            <Bell className="w-4 h-4" />
            {alertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-[9px] font-bold bg-danger text-white rounded-full flex items-center justify-center">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </Button>
        </Link>

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 bg-border mx-0.5" />

        {/* User */}
        <div className="flex items-center gap-2">
          <Avatar className="w-7 h-7">
            <AvatarFallback className="text-[10px] font-semibold bg-primary/15 text-primary">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-foreground leading-none">{userName}</p>
            <p className="text-[10px] text-foreground-subtle mt-0.5 leading-none">{dealershipName}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
