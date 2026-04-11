/**
 * lib/wasender/client.ts
 * WASenderAPI REST client — send messages, check status, typing indicators.
 */

import type { WASenderSendParams, WASenderResponse } from '@/types/whatsapp'

const BASE = 'https://www.wasenderapi.com/api'

export async function sendWhatsAppMessage(
  params: WASenderSendParams & { apiKey: string }
): Promise<WASenderResponse> {
  const { apiKey, to, text, image, video, document, audio, caption, filename } = params

  const body: Record<string, string> = { to }
  if (text)     { body.text     = text }
  if (image)    { body.image    = image;    if (caption)  body.caption  = caption }
  if (video)    { body.video    = video;    if (caption)  body.caption  = caption }
  if (document) { body.document = document; if (filename) body.filename = filename }
  if (audio)    { body.audio    = audio }

  try {
    const res = await fetch(`${BASE}/send-message`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.message || `HTTP ${res.status}` }
    return { success: true, data: data.data }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error'
    console.error('[WASender] sendMessage error:', msg)
    return { success: false, error: msg }
  }
}

export async function checkSessionStatus(apiKey: string): Promise<{
  connected: boolean
  phone?: string
  name?: string
}> {
  try {
    const res = await fetch(`${BASE}/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const text = await res.text()
    console.log('[WASender] status check:', res.status, text.slice(0, 200))
    if (!res.ok) return { connected: false }
    let data: any
    try { data = JSON.parse(text) } catch { return { connected: false } }
    return {
      connected: data.success === true && (data.data?.status === 'connected' || data.data?.connected === true),
      phone: data.data?.phone ?? data.data?.phoneNumber,
      name:  data.data?.name  ?? data.data?.pushName,
    }
  } catch (e) {
    console.error('[WASender] status check error:', e)
    return { connected: false }
  }
}

export async function getSessionQRCode(
  sessionApiKey: string,
): Promise<{ qrCode?: string; error?: string }> {
  const url = `${BASE}/qrcode`
  console.log('[WASender] QR code fetch URL:', url)
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${sessionApiKey}` },
    })
    const text = await res.text()
    console.log('[WASender] QR response status:', res.status, 'body:', text.slice(0, 300))

    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 120)}` }

    let data: any
    try { data = JSON.parse(text) } catch {
      return { error: `Invalid JSON (status ${res.status})` }
    }

    if (data.success && data.data?.qrcode)   return { qrCode: data.data.qrcode }
    if (data.success && data.data?.qr_code)  return { qrCode: data.data.qr_code }
    if (data.success && data.data?.base64)   return { qrCode: data.data.base64 }
    return { error: data.message || data.error || JSON.stringify(data).slice(0, 120) }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

export async function sendPresenceUpdate(
  apiKey: string,
  to: string,
  presence: 'composing' | 'recording' | 'paused'
): Promise<void> {
  try {
    await fetch(`${BASE}/send-presence-update`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, presence }),
    })
  } catch (e) {
    console.error('[WASender] presence update error:', e)
  }
}

export async function markMessageAsRead(
  apiKey: string,
  remoteJid: string,
  msgId: string
): Promise<void> {
  try {
    await fetch(`${BASE}/messages/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ remoteJid, msgId }),
    })
  } catch (e) {
    console.error('[WASender] mark-as-read error:', e)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function formatPhoneForWASender(phone: string): string {
  const cleaned = cleanPhoneNumber(phone)
  if (!cleaned.startsWith('55') && cleaned.length === 11) return `+55${cleaned}`
  return `+${cleaned}`
}
