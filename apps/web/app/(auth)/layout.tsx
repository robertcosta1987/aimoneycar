export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <span className="font-black text-[34px] text-primary tracking-tight">Moneycar <span className="text-foreground">IA</span></span>
          </div>
          <p className="text-foreground-muted text-sm">Inteligência para sua revenda</p>
        </div>
        {children}
      </div>
    </div>
  )
}
