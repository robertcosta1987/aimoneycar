import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import MDBReader from 'mdb-reader'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  let buffer: Buffer

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const { storagePath } = await req.json()
    if (!storagePath) return NextResponse.json({ error: 'No storagePath' }, { status: 400 })
    const { data, error } = await svc.storage.from('imports').download(storagePath)
    if (error || !data) return NextResponse.json({ error: 'Failed to fetch file' }, { status: 400 })
    buffer = Buffer.from(await data.arrayBuffer())
    // Clean up temp file
    svc.storage.from('imports').remove([storagePath]).catch(() => {})
  } else {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    buffer = Buffer.from(await file.arrayBuffer())
  }
  const reader = new MDBReader(buffer)
  const tableNames = reader.getTableNames().filter(t => !t.startsWith('MSys'))

  const result: Record<string, any> = { tables: tableNames, samples: {} }

  for (const table of tableNames) {
    try {
      const rows = reader.getTable(table).getData() as Record<string, any>[]
      if (rows.length === 0) {
        result.samples[table] = { count: 0, columns: [], firstRow: null }
        continue
      }

      const firstRow = rows[0]
      // Show column name, value, and JS type for each field
      const columns = Object.entries(firstRow).map(([col, val]) => ({
        col,
        type: val instanceof Date ? 'Date' : typeof val,
        value: val instanceof Date
          ? `${val.toISOString().slice(0, 10)} (year: ${val.getFullYear()})`
          : val === null ? 'null'
          : String(val).slice(0, 80),
      }))

      result.samples[table] = {
        count: rows.length,
        columns,
        // Also show second row to catch variation
        secondRow: rows[1] ? Object.entries(rows[1]).map(([col, val]) => ({
          col,
          value: val instanceof Date
            ? `${val.toISOString().slice(0, 10)} (year: ${val.getFullYear()})`
            : val === null ? 'null'
            : String(val).slice(0, 80),
        })) : null,
      }
    } catch (e: any) {
      result.samples[table] = { error: e.message }
    }
  }

  return NextResponse.json(result, { status: 200 })
}
