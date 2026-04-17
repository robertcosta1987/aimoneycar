import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
  if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const D = profile.dealership_id
  const { table, rows, conflictKey, deleteFirst, insertOnly } = await req.json()

  if (!table || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing table or rows' }, { status: 400 })
  }

  // Security: force dealership_id on all rows to prevent cross-tenant injection
  const secureRows = (rows as Record<string, any>[]).map(r => ({ ...r, dealership_id: D }))

  const errors: string[] = []

  if (deleteFirst) {
    const { error: delErr } = await svc.from(table).delete().eq('dealership_id', D)
    if (delErr) errors.push(`${table} delete: ${delErr.message}`)
  }

  let count = 0

  if (insertOnly) {
    const BATCH_SIZE = 500
    for (let i = 0; i < secureRows.length; i += BATCH_SIZE) {
      const chunk = secureRows.slice(i, i + BATCH_SIZE)
      const { error } = await svc.from(table).insert(chunk)
      if (error) errors.push(`${table} insert ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      else count += chunk.length
    }
  } else {
    const BATCH_SIZE = 1000
    const CONCURRENCY = 3
    const batches: Record<string, any>[][] = []
    for (let i = 0; i < secureRows.length; i += BATCH_SIZE) batches.push(secureRows.slice(i, i + BATCH_SIZE))
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const group = batches.slice(i, i + CONCURRENCY)
      const results = await Promise.all(group.map(async (chunk, j) => {
        const { error } = await svc.from(table).upsert(chunk, { onConflict: conflictKey, ignoreDuplicates: false })
        if (error) { errors.push(`${table} batch ${i + j + 1}: ${error.message}`); return 0 }
        return chunk.length
      }))
      count += results.reduce((a, b) => a + b, 0)
    }
  }

  return NextResponse.json({ count, errors })
}
