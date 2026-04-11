import Link from 'next/link'

export default function NotFound() {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#0A0E14', color: '#E2E8F0', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 72, fontWeight: 700, color: '#00D9FF', margin: 0 }}>404</p>
          <p style={{ fontSize: 18, color: '#8B9EB3', margin: '8px 0 24px' }}>Página não encontrada</p>
          <Link href="/dashboard" style={{ color: '#00D9FF', textDecoration: 'none', fontSize: 14 }}>
            Voltar ao Dashboard
          </Link>
        </div>
      </body>
    </html>
  )
}
