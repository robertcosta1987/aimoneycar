import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateDailyAlerts } from '@/lib/ai/alerts'
import { sendWhatsAppMessage, formatDailyAlertMessage } from '@/lib/whatsapp/evolution'
import type { Vehicle, Expense, Dealership } from '@/types'

export async function GET(req: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Fetch all active dealerships
  const { data: dealerships, error } = await supabase
    .from('dealerships')
    .select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ dealership: string; alerts: number; whatsapp: boolean }> = []

  for (const dealership of (dealerships as Dealership[])) {
    try {
      const [{ data: vehicles }, { data: expenses }] = await Promise.all([
        supabase
          .from('vehicles')
          .select('*')
          .eq('dealership_id', dealership.id)
          .eq('status', 'available'),
        supabase
          .from('expenses')
          .select('*')
          .eq('dealership_id', dealership.id),
      ])

      const alerts = await generateDailyAlerts(
        dealership.id,
        dealership.name,
        (vehicles as Vehicle[]) ?? [],
        (expenses as Expense[]) ?? []
      )

      if (alerts.length === 0) {
        results.push({ dealership: dealership.name, alerts: 0, whatsapp: false })
        continue
      }

      // Save alerts to DB
      await supabase.from('ai_alerts').insert(alerts)

      // Send WhatsApp if configured
      let whatsappSent = false
      const settings = dealership.settings as Record<string, unknown>
      const instanceName = settings?.evolution_instance_name as string | undefined
      const ownerPhone = dealership.whatsapp ?? dealership.phone

      if (instanceName && ownerPhone && process.env.EVOLUTION_API_URL) {
        const message = formatDailyAlertMessage(dealership.name, alerts)
        const result = await sendWhatsAppMessage(instanceName, ownerPhone, message)
        whatsappSent = result.success

        if (result.success) {
          const ids = alerts.map(a => a).filter(() => true)
          // Mark sent alerts
          await supabase
            .from('ai_alerts')
            .update({ sent_whatsapp: true })
            .eq('dealership_id', dealership.id)
            .eq('sent_whatsapp', false)
        }
      }

      results.push({ dealership: dealership.name, alerts: alerts.length, whatsapp: whatsappSent })
    } catch (err) {
      console.error(`Alert generation failed for ${dealership.name}:`, err)
      results.push({ dealership: dealership.name, alerts: -1, whatsapp: false })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
