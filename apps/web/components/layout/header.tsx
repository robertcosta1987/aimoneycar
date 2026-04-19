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
    <header className="h-12 border-b border-border bg-background-paper px-4 md:px-6 flex items-center justify-between gap-3">
      {/* Mobile: app name */}
      <div className="flex items-center gap-2 md:hidden">
        <span className="font-black text-sm text-primary tracking-tight">Moneycar <span className="text-foreground">IA</span></span>
      </div>

      {/* Slogan — centered */}
      <div className="flex-1 flex justify-center">
        <p className="text-xs font-medium text-foreground-muted italic text-center hidden sm:block">
          Seus dados viram decisões.{' '}
          <span className="text-primary not-italic">Sua revenda vira máquina.</span>
        </p>
      </div>

      {/* Theme toggle */}
      {mounted && (
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-background-hover transition-colors"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      )}

      <div className="flex items-center gap-2 md:gap-3">
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
