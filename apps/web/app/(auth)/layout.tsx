export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-3xl font-bold text-foreground">Moneycar</span>
            <span className="text-3xl font-bold text-primary">AI</span>
          </div>
          <p className="text-foreground-muted text-sm">Inteligência para sua revenda</p>
        </div>
        {children}
      </div>
    </div>
  )
}
