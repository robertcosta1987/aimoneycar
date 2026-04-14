'use client'
import { Bell, Search, Car, User, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface HeaderProps {
  dealershipName?: string
  userName?: string
  alertCount?: number
}

interface SearchResult {
  vehicles: { id: string; brand: string; model: string; version: string | null; year_model: number | null; plate: string | null; status: string; sale_price: number | null }[]
  customers: { id: string; name: string; phone: string | null; city: string | null }[]
}

const STATUS_LABEL: Record<string, string> = {
  available: 'Disponível',
  sold: 'Vendido',
  reserved: 'Reservado',
  consigned: 'Consignado',
}

const STATUS_COLOR: Record<string, string> = {
  available: 'text-success',
  sold: 'text-foreground-muted',
  reserved: 'text-warning',
  consigned: 'text-primary',
}

export function Header({ dealershipName = 'Minha Revenda', userName = 'Usuário', alertCount = 0 }: HeaderProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult>({ vehicles: [], customers: [] })
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults({ vehicles: [], customers: [] }); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data: SearchResult = await res.json()
      setResults(data)
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 280)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }

  function clear() {
    setQuery('')
    setResults({ vehicles: [], customers: [] })
    setOpen(false)
    inputRef.current?.focus()
  }

  const hasResults = results.vehicles.length > 0 || results.customers.length > 0
  const noResults = open && !loading && query.length >= 2 && !hasResults

  return (
    <header className="h-32 border-b border-border bg-background-paper px-4 md:px-6 flex items-center justify-between gap-3">
      {/* Mobile: app name */}
      <div className="flex items-center gap-2 md:hidden">
        <span className="font-black text-[34px] text-primary tracking-tight">Moneycar <span className="text-foreground">IA</span></span>
      </div>

      {/* Desktop: search */}
      <div className="hidden md:block flex-1 max-w-md relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => { if (hasResults) setOpen(true) }}
            placeholder="Buscar veículo, placa, cliente..."
            className="pl-9 pr-8 h-9 text-sm"
            autoComplete="off"
          />
          {query && (
            <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {(open || noResults) && (
          <div
            ref={dropdownRef}
            className="absolute top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-card-hover z-50 overflow-hidden"
          >
            {loading && (
              <div className="px-4 py-3 text-sm text-foreground-muted flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Buscando...
              </div>
            )}

            {!loading && noResults && (
              <div className="px-4 py-3 text-sm text-foreground-muted">
                Nenhum resultado para <strong>"{query}"</strong>
              </div>
            )}

            {!loading && results.vehicles.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-foreground-subtle uppercase tracking-wider border-b border-border bg-background-paper">
                  Veículos
                </div>
                {results.vehicles.map(v => (
                  <Link
                    key={v.id}
                    href="/dashboard/veiculos"
                    onClick={() => { setOpen(false); setQuery('') }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-background-hover transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                      <Car className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {v.brand} {v.model}{v.version ? ` ${v.version}` : ''}{v.year_model ? ` ${v.year_model}` : ''}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {v.plate ?? 'Sem placa'}
                        {v.sale_price ? ` · R$ ${v.sale_price.toLocaleString('pt-BR')}` : ''}
                      </p>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${STATUS_COLOR[v.status] ?? 'text-foreground-muted'}`}>
                      {STATUS_LABEL[v.status] ?? v.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {!loading && results.customers.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-foreground-subtle uppercase tracking-wider border-b border-border bg-background-paper">
                  Clientes
                </div>
                {results.customers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setOpen(false); setQuery('') }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-background-hover transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5 text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-foreground-muted">
                        {c.phone ?? '—'}{c.city ? ` · ${c.city}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
