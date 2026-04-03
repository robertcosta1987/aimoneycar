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

  // _brandName/_modelName/_fuelName are injected by parseMDB after joining lookup tables
  const brand = get('_brandName', 'marca', 'Marca', 'brand', 'MARCA', 'fabricante', 'Fabricante', 'FABRICANTE', 'NomeFabricante', 'nomefabricante')
  // carDescri holds the model/version description in tbVeiculo
  const model = get('_modelName', 'carDescri', 'modelo', 'Modelo', 'model', 'MODELO', 'NomeModelo', 'nomemodelo')
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

  const parseDate = (v: any): string | null => {
    if (!v) return null
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null
      return v.toISOString().split('T')[0]
    }
    const s = String(v).trim()
    if (!s || s === 'null' || s === 'undefined') return null
    // Try dd/mm/yyyy
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`
    // Try yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return null
  }

  // tbVeiculo uses carAno/carAnoModelo; fallback to generic names for CSV
  const yearRaw = get('carAno', 'ano', 'Ano', 'AnoFab', 'anofab', 'ANO', 'ano_fab', 'AnoFabricacao', 'anofabricacao')
  const yearModelRaw = get('carAnoModelo', 'anomodelo', 'AnoModelo', 'ano_modelo', 'ANO_MODELO', 'year_model')
  const year = parseYear(yearRaw)
  const yearModel = parseYear(yearModelRaw ?? yearRaw)

  const plate = get('carPlaca', 'placa', 'Placa', 'plate', 'PLACA')
  const externalId = get('carID', 'carid', 'CarId', 'IDCarro', 'idcarro', 'id', 'ID', 'codigo', 'Codigo', 'CODIGO', 'external_id')

  // version: for CSV use versao; for MDB carDescri is the model so skip re-assigning
  const version = get('versao', 'Versao', 'Versão', 'version', 'VERSAO', 'complemento', 'Complemento', 'descricao', 'Descricao') ?? null

  // Purchase date: try all date fields. carCertificadoData = DUT/CRV transfer date (best proxy)
  // Fallback: Jan of car's year_fab — at least gives different ages per car rather than all = today
  const rawDate = get('_purchaseDate', 'carCertificadoData', 'carDataEntrada', 'datacompra',
    'DataCompra', 'data_compra', 'dataentrada', 'DataEntrada', 'purchase_date', 'DATA_COMPRA')
  const purchaseDate = parseDate(rawDate) ?? `${year}-01-01`

  return {
    dealership_id: dealershipId,
    plate: plate ? String(plate).toUpperCase().trim() : null,
    brand: String(brand || 'Desconhecido').trim(),
    model: String(model || 'Desconhecido').trim(),
    version,
    year_fab: year,
    year_model: yearModel,
    color: get('carCor', 'cor', 'Cor', 'color', 'COR', 'Cores') ?? null,
    mileage: parseNum(get('carKm', 'carQuilometragem', 'km', 'Km', 'KM', 'quilometragem', 'Quilometragem', 'odometro', 'Odometro', 'mileage')),
    fuel: get('_fuelName', 'combustivel', 'Combustivel', 'Combustível', 'fuel', 'COMBUSTIVEL', 'TipoCombustivel') ?? null,
    transmission: get('carCambio', 'cambio', 'Cambio', 'Câmbio', 'transmissao', 'Transmissao', 'transmission', 'CAMBIO', 'TipoCambio') ?? null,
    purchase_price: parseNum(get('carValorCompra', 'valorcompra', 'ValorCompra', 'valor_compra', 'custocompra', 'CustoCompra', 'custo', 'Custo', 'CUSTO', 'purchase_price', 'precoCusto', 'PrecoCusto')),
    sale_price: parseNum(get('carValorWeb', 'carValorTabela', 'valorvenda', 'ValorVenda', 'valor_venda', 'precovenda', 'PrecoVenda', 'sale_price', 'VALORVENDA', 'preco', 'Preco')) || null,
    purchase_date: purchaseDate,
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

function parseMDB(buffer: Buffer): {
  rows: Record<string, any>[]
  tableNames: string[]
  targetTable: string
  brandMapSize: number
  modelMapSize: number
  fuelMapSize: number
} {
  const reader = new MDBReader(buffer)
  const tableNames = reader.getTableNames()

  const priority = ['tbVeiculo', 'tbVeiculos', 'Veiculo', 'Veiculos', 'tblVeiculo']
  const keywords = ['veiculo', 'carro', 'estoque', 'vehicle', 'auto', 'stock']

  const targetTable =
    priority.find(p => tableNames.includes(p)) ??
    tableNames.find(t => keywords.some(k => t.toLowerCase().includes(k))) ??
    tableNames.find(t => !t.startsWith('MSys')) ??
    tableNames[0]

  if (!targetTable) return { rows: [], tableNames, targetTable: '', brandMapSize: 0, modelMapSize: 0, fuelMapSize: 0 }

  const rows = reader.getTable(targetTable).getData() as Record<string, any>[]

  // Build brand lookup: try both tbFabricante and tbFabricantes
  const brandMap: Record<string | number, string> = {}
  const brandTable = tableNames.find(t => /^tbFabricante/i.test(t))
  if (brandTable) {
    const fabRows = reader.getTable(brandTable).getData() as Record<string, any>[]
    fabRows.forEach(r => {
      const id = r['fabID'] ?? r['id']
      const name = r['fabNome'] ?? r['fabDescri'] ?? r['Nome'] ?? r['Descri'] ?? r['nome'] ?? r['descri']
      if (id !== undefined && id !== null && name) brandMap[id] = String(name)
    })
  }

  // Build model lookup from tbModelo(s) if it exists
  const modelMap: Record<string | number, string> = {}
  const modelTable = tableNames.find(t => /modelo/i.test(t))
  if (modelTable) {
    const modRows = reader.getTable(modelTable).getData() as Record<string, any>[]
    modRows.forEach(r => {
      const id = r['modID'] ?? r['id']
      const name = r['modNome'] ?? r['modDescri'] ?? r['Nome'] ?? r['Descri'] ?? r['nome'] ?? r['descri']
      if (id !== undefined && id !== null && name) modelMap[id] = String(name)
    })
  }

  // Build fuel lookup from tbCombustivel / tbGasolina / tbGaz
  const fuelMap: Record<string | number, string> = {}
  const fuelTable = tableNames.find(t => /combustivel|combust|gasolina|tbgaz/i.test(t))
  if (fuelTable) {
    const fuelRows = reader.getTable(fuelTable).getData() as Record<string, any>[]
    fuelRows.forEach(r => {
      const id = r['gazID'] ?? r['combID'] ?? r['id']
      const name = r['gazNome'] ?? r['combNome'] ?? r['gazDescri'] ?? r['Nome'] ?? r['Descri'] ?? r['nome'] ?? r['descri']
      if (id !== undefined && id !== null && name) fuelMap[id] = String(name)
    })
  }

  // Find the best available date field across all rows (scan first row's keys for Date objects)
  const firstRow = rows[0] ?? {}
  const dateCols = Object.entries(firstRow)
    .filter(([, v]) => v instanceof Date && !isNaN((v as Date).getTime()))
    .map(([k]) => k)

  // Enrich each vehicle row
  const enriched = rows.map(r => {
    // Pick first available real date as purchase date hint
    const purchaseDateHint = dateCols.reduce<Date | null>((found, col) => {
      if (found) return found
      const d = r[col]
      if (d instanceof Date && !isNaN(d.getTime())) return d
      return null
    }, null)

    return {
      ...r,
      _brandName: r['fabID'] !== undefined ? (brandMap[r['fabID']] ?? null) : null,
      _modelName: r['modID'] !== undefined ? (modelMap[r['modID']] ?? null) : null,
      _fuelName: r['gazID'] !== undefined ? (fuelMap[r['gazID']] ?? null) : null,
      _purchaseDate: r['carCertificadoData'] instanceof Date ? r['carCertificadoData']
        : purchaseDateHint,
    }
  })

  return {
    rows: enriched,
    tableNames,
    targetTable,
    brandMapSize: Object.keys(brandMap).length,
    modelMapSize: Object.keys(modelMap).length,
    fuelMapSize: Object.keys(fuelMap).length,
  }
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
  let debugInfo: Record<string, any> = {}

  try {
    const name = file.name.toLowerCase()
    if (name.endsWith('.mdb') || name.endsWith('.accdb')) {
      const result = parseMDB(buffer)
      rawRows = result.rows
      tableNames = result.tableNames
      debugInfo = {
        targetTable: result.targetTable,
        allTables: result.tableNames,
        brandMapSize: result.brandMapSize,
        modelMapSize: result.modelMapSize,
        fuelMapSize: result.fuelMapSize,
      }
      if (result.targetTable) tableNames = [`target: ${result.targetTable}`, ...tableNames]
    } else if (name.endsWith('.csv')) {
      rawRows = parseCSV(buffer.toString('utf-8'))
    } else if (name.endsWith('.json')) {
      rawRows = JSON.parse(buffer.toString('utf-8'))
    } else {
      rawRows = parseCSV(buffer.toString('utf-8'))
    }
  } catch (e: any) {
    errors.push(`Parse error: ${e.message}`)
  }

  let recordsImported = 0
  let sampleMapped: Record<string, any>[] = []

  if (rawRows.length > 0) {
    const mapped = rawRows
      .map(r => mapRow(r, dealershipId))
      .filter((r): r is Record<string, any> => r !== null)

    sampleMapped = mapped.slice(0, 3)

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

      // Refresh days_in_stock for all vehicles in this dealership after import
      // (handles upsert cases where trigger may not recalculate on updates)
      try { await svc.rpc('refresh_days_in_stock', { d_id: dealershipId }) } catch { /* function may not exist yet */ }
    } else {
      errors.push(`Parsed ${rawRows.length} rows but none matched expected columns. Tables: ${tableNames.join(', ')}. First row keys: ${Object.keys(rawRows[0] ?? {}).join(', ')}`)
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
    debug: debugInfo,
    sample: sampleMapped,
  })
}
