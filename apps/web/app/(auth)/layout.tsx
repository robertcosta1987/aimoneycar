export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-2">
            <div className="bg-white rounded-2xl p-3 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="CogniVenda AI" className="h-36 w-auto" />
            </div>
          </div>
          <p className="text-foreground-muted text-sm">Inteligência para sua revenda</p>
        </div>
        {children}
      </div>
    </div>
  )
}
