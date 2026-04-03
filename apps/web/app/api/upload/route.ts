import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Vehicle } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('dealership_id').eq('id', user.id).single()
  if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const dealershipId = profile.dealership_id

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Create import record
  const { data: importRecord, error: importErr } = await supabase
    .from('imports')
    .insert({
      dealership_id: dealershipId,
      filename: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      status: 'processing',
      records_imported: 0,
      errors: [],
      created_by: user.id,
    } as any)
    .select()
    .single()

  if (importErr) return NextResponse.json({ error: importErr.message }, { status: 500 })

  // Upload file to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer())
  const storagePath = `imports/${dealershipId}/${importRecord.id}/${file.name}`

  const { error: storageErr } = await supabase.storage
    .from('uploads')
    .upload(storagePath, buffer, { contentType: file.type })

  if (storageErr) {
    await supabase.from('imports').update({ status: 'error', errors: [storageErr.message] }).eq('id', importRecord.id)
    return NextResponse.json({ error: storageErr.message }, { status: 500 })
  }

  // Process CSV/JSON files synchronously (simple case)
  let recordsImported = 0
  const errors: string[] = []

  if (file.name.endsWith('.json') || file.type === 'application/json') {
    try {
      const text = buffer.toString('utf-8')
      const records = JSON.parse(text) as Partial<Vehicle>[]
      const inserts = records.map(r => ({
        ...r,
        dealership_id: dealershipId,
        external_id: r.external_id ?? null,
        source: r.source ?? 'import',
        photos: r.photos ?? [],
        mileage: r.mileage ?? 0,
        purchase_price: r.purchase_price ?? 0,
        year_fab: r.year_fab ?? new Date().getFullYear(),
        year_model: r.year_model ?? new Date().getFullYear(),
        brand: r.brand ?? 'Desconhecido',
        model: r.model ?? 'Desconhecido',
        purchase_date: r.purchase_date ?? new Date().toISOString().split('T')[0],
        status: 'available' as const,
      }))

      const { data: inserted, error: insertErr } = await supabase
        .from('vehicles')
        .upsert(inserts, { onConflict: 'external_id' })
        .select()

      if (insertErr) errors.push(insertErr.message)
      else recordsImported = inserted?.length ?? 0
    } catch (e) {
      errors.push(`JSON parse error: ${String(e)}`)
    }
  }

  await supabase
    .from('imports')
    .update({
      status: errors.length > 0 && recordsImported === 0 ? 'error' : 'complete',
      records_imported: recordsImported,
      errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importRecord.id)

  return NextResponse.json({
    import_id: importRecord.id,
    records_imported: recordsImported,
    errors,
  })
}
