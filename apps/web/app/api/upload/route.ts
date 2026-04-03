import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import MDBReader from 'mdb-reader'

// Maps Portuguese/common field names from various dealership software to our schema
function mapRow(row: Record<string, any>, dealershipId: string): Record<string, any> | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
      if (val !== undefined && val !== null && val !== '') return val
    }
    return undefined
  }

  const brand = get('marca', 'brand', 'MARCA', 'fabricante', 'FABRICANTE')
  const model = get('modelo', 'model', 'MODELO')
  if (!brand && !model) return null

  const parseYear = (v: any) => {
    if (!v) return new Date().getFullYear()
    const n = parseInt(String(v).slice(0, 4))
    return isNaN(n) ? new Date().getFullYear() : n
  }

  const parseNum = (v: any) => {
    if (!v) return 0
    const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''))
    return isNaN(n) ? 0 : n
  }

  const parseDate = (v: any): string => {
    if (!v) return new Date().toISOString().split('T')[0]
    if (v instanceof Date) return v.toISOString().split('T')[0]
    const s = String(v)
    // Try dd/mm/yyyy
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`
    // Try yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return new Date().toISOString().split('T')[0]
  }

  const yearRaw = get('ano', 'year', 'ANO', 'ano_fab', 'ano fabricacao', 'ANO_FAB')
  const yearModelRaw = get('ano_modelo', 'ano modelo', 'ANO_MODELO', 'year_model', 'modelo_ano')
  const year = parseYear(yearRaw)
  const yearModel = parseYear(yearModelRaw ?? yearRaw)

  const plate = get('placa', 'plate', 'PLACA')
  const externalId = get('id', 'codigo', 'CODIGO', 'cod', 'COD', 'external_id', 'ID')

  return {
    dealership_id: dealershipId,
    plate: plate ? String(plate).toUpperCase().trim() : null,
    brand: String(brand || 'Desconhecido').trim(),
    model: String(model || 'Desconhecido').trim(),
    version: get('versao', 'version', 'VERSAO', 'VERSÃO', 'versão', 'complemento') ?? null,
    year_fab: year,
    year_model: yearModel,
    color: get('cor', 'color', 'COR') ?? null,
    mileage: parseNum(get('km', 'quilometragem', 'KM', 'QUILOMETRAGEM', 'odometro', 'ODOMETRO', 'mileage')),
    fuel: get('combustivel', 'combustível', 'fuel', 'COMBUSTIVEL') ?? null,
    transmission: get('cambio', 'câmbio', 'transmissao', 'transmission', 'CAMBIO') ?? null,
    purchase_price: parseNum(get('valor_compra', 'preco_compra', 'custo', 'purchase_price', 'VALOR_COMPRA', 'PRECO_COMPRA', 'custo_total', 'CUSTO')),
    sale_price: parseNum(get('valor_venda', 'preco_venda', 'sale_price', 'VALOR_VENDA', 'PRECO_VENDA', 'preco')) || null,
    purchase_date: parseDate(get('data_compra', 'purchase_date', 'DATA_COMPRA', 'data entrada', 'DATA_ENTRADA')),
    status: 'available' as const,
    source: 'import',
    photos: [],
    external_id: externalId ? String(externalId) : null,
  }
}

function parseCSV(text: string): Record<string, any>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  // Detect delimiter
  const firstLine = lines[0]
  const delimiter = firstLine.includes(';') ? ';' : ','

  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))

  return lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, any> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  }).filter(row => Object.values(row).some(v => v !== ''))
}

function parseMDB(buffer: Buffer): { rows: Record<string, any>[]; tableNames: string[] } {
  const reader = new MDBReader(buffer)
  const tableNames = reader.getTableNames()

  // Look for the most likely vehicle table
  const vehicleKeywords = ['veiculo', 'veiculo', 'veículos', 'carro', 'estoque', 'stock', 'vehicle', 'auto']
  let targetTable = tableNames.find(t =>
    vehicleKeywords.some(k => t.toLowerCase().includes(k))
  ) ?? tableNames.find(t => !t.startsWith('MSys')) ?? tableNames[0]

  if (!targetTable) return { rows: [], tableNames }

  const table = reader.getTable(targetTable)
  const rows = table.getData() as Record<string, any>[]
  return { rows, tableNames }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc
    .from('users').select('dealership_id').eq('id', user.id).single()
  if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const dealershipId = profile.dealership_id

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const { data: importRecord, error: importErr } = await svc
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

  const buffer = Buffer.from(await file.arrayBuffer())
  let rawRows: Record<string, any>[] = []
  const errors: string[] = []
  let tableNames: string[] = []

  try {
    const name = file.name.toLowerCase()
    if (name.endsWith('.mdb') || name.endsWith('.accdb')) {
      const result = parseMDB(buffer)
      rawRows = result.rows
      tableNames = result.tableNames
    } else if (name.endsWith('.csv')) {
      rawRows = parseCSV(buffer.toString('utf-8'))
    } else if (name.endsWith('.json')) {
      rawRows = JSON.parse(buffer.toString('utf-8'))
    } else {
      // Try CSV as fallback
      rawRows = parseCSV(buffer.toString('utf-8'))
    }
  } catch (e: any) {
    errors.push(`Parse error: ${e.message}`)
  }

  let recordsImported = 0

  if (rawRows.length > 0) {
    const mapped = rawRows
      .map(r => mapRow(r, dealershipId))
      .filter((r): r is Record<string, any> => r !== null)

    if (mapped.length > 0) {
      // Batch upsert in chunks of 100
      for (let i = 0; i < mapped.length; i += 100) {
        const chunk = mapped.slice(i, i + 100)
        const { data: inserted, error: insertErr } = await svc
          .from('vehicles')
          .upsert(chunk, { onConflict: 'dealership_id,external_id', ignoreDuplicates: false })
          .select('id')

        if (insertErr) errors.push(`Batch ${i / 100 + 1}: ${insertErr.message}`)
        else recordsImported += inserted?.length ?? 0
      }
    } else {
      errors.push(`Parsed ${rawRows.length} rows but none matched expected columns. Tables found: ${tableNames.join(', ')}. First row keys: ${Object.keys(rawRows[0] ?? {}).join(', ')}`)
    }
  }

  await svc
    .from('imports')
    .update({
      status: errors.length > 0 && recordsImported === 0 ? 'error' : 'complete',
      records_imported: recordsImported,
      errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', (importRecord as any).id)

  return NextResponse.json({
    import_id: (importRecord as any).id,
    records_imported: recordsImported,
    total_rows_parsed: rawRows.length,
    errors,
  })
}
