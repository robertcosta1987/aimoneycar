import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export async function DELETE() {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const azureUrl = process.env.NEXT_PUBLIC_IMPORT_SERVICE_URL?.replace('importMdb', 'clearData')
    if (!azureUrl) return NextResponse.json({ error: 'Import service not configured' }, { status: 500 })

    const res = await fetch(azureUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[clear-data]', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
