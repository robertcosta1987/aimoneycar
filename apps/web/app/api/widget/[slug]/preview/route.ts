import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { data: dealership } = await supabase
    .from('dealerships')
    .select('name, widget_color:calendario_config(widget_cor)')
    .eq('slug', params.slug)
    .single()

  const origin = req.nextUrl.origin
  const color = (dealership as any)?.widget_color?.[0]?.widget_cor || '#00D9FF'
  const name = dealership?.name || 'Revenda'

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview Widget — ${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: linear-gradient(135deg, #f0f4f8 0%, #e8ecf0 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 40px 20px;
    }
    .card {
      background: white; border-radius: 16px;
      padding: 32px; max-width: 460px; width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      text-align: center;
    }
    .logo {
      width: 52px; height: 52px; border-radius: 50%;
      background: ${color}22; display: flex; align-items: center; justify-content: center;
      font-size: 26px; margin: 0 auto 16px;
    }
    h1 { font-size: 20px; color: #111; margin-bottom: 8px; }
    p { font-size: 14px; color: #666; line-height: 1.6; }
    .arrow {
      margin-top: 28px;
      display: flex; align-items: center; justify-content: flex-end; gap: 8px;
      color: #999; font-size: 13px; padding-right: 12px;
    }
    .arrow svg { animation: bounce-x 1.5s infinite ease-in-out; }
    @keyframes bounce-x {
      0%, 100% { transform: translateX(0); }
      50% { transform: translateX(5px); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🚗</div>
    <h1>${name}</h1>
    <p>Este é o preview do widget de chat para clientes.<br>
    Clique no botão abaixo para interagir como um cliente real.</p>
    <div class="arrow">
      Clique aqui para abrir o chat
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="12 5 19 12 12 19"/>
      </svg>
    </div>
  </div>
  <script
    src="${origin}/widget.js"
    data-dealership="${params.slug}"
    data-color="${color}"
    data-api="${origin}"
    data-greeting="Olá! Sou o assistente virtual. Como posso ajudar? 🚗"
  ></script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
