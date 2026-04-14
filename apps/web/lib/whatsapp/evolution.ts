export interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

function getEvolutionBase() {
  return process.env.EVOLUTION_API_URL ?? ''
}

function getEvolutionKey() {
  return process.env.EVOLUTION_API_KEY ?? ''
}

export async function sendWhatsAppMessage(
  instanceName: string,
  phone: string,
  text: string
): Promise<SendMessageResult> {
  const base = getEvolutionBase()
  if (!base) return { success: false, error: 'EVOLUTION_API_URL not set' }

  // Normalize phone: remove non-digits, ensure country code
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('55') ? digits : `55${digits}`

  try {
    const res = await fetch(`${base}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getEvolutionKey(),
      },
      body: JSON.stringify({
        number: `${normalized}@s.whatsapp.net`,
        options: { delay: 1200 },
        textMessage: { text },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { success: false, error: `HTTP ${res.status}: ${body}` }
    }

    const data = await res.json() as { key?: { id: string } }
    return { success: true, messageId: data.key?.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function formatDailyAlertMessage(
  dealershipName: string,
  alerts: Array<{ type: string; title: string; message: string }>
): string {
  const date = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const lines: string[] = [
    `🚗 *${dealershipName} — Moneycar IA*`,
    `📅 ${date}`,
    '',
    '*Alertas do dia:*',
  ]

  const icons: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    info: '🔵',
    success: '🟢',
  }

  alerts.forEach(a => {
    const icon = icons[a.type] ?? '⚪'
    lines.push(`${icon} *${a.title}*`)
    lines.push(`   ${a.message}`)
  })

  lines.push('')
  lines.push('_Acesse o painel para mais detalhes: moneycar.ai_')

  return lines.join('\n')
}
