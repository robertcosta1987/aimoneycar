import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import MDBReader from 'mdb-reader'

// Status translation: Portuguese Moneycar values → our schema
function parseStatus(v: any): 'available' | 'reserved' | 'sold' {
  const s = String(v ?? '').toLowerCase().trim()
  if (s.includes('vend') || s === '3' || s === 'sold') return 'sold'
  if (s.includes('reserv') || s === '2' || s === 'reserved') return 'reserved'
  return 'available'
}

function parseNum(v: any): number {
  if (!v) return 0
  const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseYear(v: any, fallback = new Date().getFullYear()): number {
  if (!v) return fallback
  const n = parseInt(String(v).slice(0, 4))
  return isNaN(n) ? fallback : n
}

function parseDate(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().split('T')[0]
  const s = String(v).trim()
  if (!s || s === 'null') return null
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

// Maps a raw row to our vehicles schema.
// Supports both the 'veiculos' flat table (MARCA/MODELO columns) and
// the normalized 'tbVeiculo' table (_brandName/_modelName injected from joins).
function mapVehicleRow(row: Record<string, any>, dealershipId: string): Record<string, any> | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
      if (val !== undefined && val !== null && val !== '') return val
    }
    return undefined
  }

  // Brand: direct column first, then join-resolved _brandName
  const brand = get('MARCA', 'marca', 'Marca', '_brandName', 'brand', 'fabricante', 'Fabricante', 'NomeFabricante')
  // Model: direct column first, then join-resolved, then description field
  const model = get('MODELO', 'modelo', 'Modelo', '_modelName', 'carDescri', 'model', 'NomeModelo')

  // Only skip fully empty rows (no brand, no model, no plate)
  const plate = get('PLACA', 'placa', 'Placa', 'carPlaca', 'plate')
  const externalId = get('ID', 'id', 'carID', 'carid', 'CarId', 'IDCarro', 'codigo', 'Codigo', 'external_id')
  if (!brand && !model && !plate && !externalId) return null

  const yearFab = parseYear(get('ANO_FAB', 'ano_fab', 'carAno', 'ano', 'Ano', 'AnoFab'))
  const yearModelRaw = get('ANO_MOD', 'ano_mod', 'carAnoModelo', 'anomodelo', 'AnoModelo', 'ano_modelo')
  const yearModel = parseYear(yearModelRaw ?? null, yearFab)

  const rawStatus = get('STATUS', 'status', 'Status', 'carStatus', 'SITUACAO', 'situacao')
  const status = parseStatus(rawStatus)

  // Purchase date: DATA_COMPRA is the correct field in the flat 'veiculos' table
  const rawDate = get('DATA_COMPRA', 'data_compra', '_purchaseDate', 'carCertificadoData',
    'carDataEntrada', 'datacompra', 'DataCompra', 'dataentrada', 'DataEntrada', 'purchase_date')
  const purchaseDate = parseDate(rawDate) ?? `${yearFab}-01-01`

  // Sale date
  const rawSaleDate = get('DATA_VENDA', 'data_venda', 'datavenda', 'DataVenda', 'carDataVenda', 'sale_date')
  const saleDate = parseDate(rawSaleDate)

  return {
    dealership_id: dealershipId,
    plate: plate ? String(plate).toUpperCase().trim() : null,
    brand: String(brand || 'Desconhecido').trim(),
    model: String(model || 'Desconhecido').trim(),
    version: get('VERSAO', 'versao', 'Versão', 'Versao', 'version', 'complemento', 'Complemento') ?? null,
    year_fab: yearFab,
    year_model: yearModel,
    color: get('COR', 'cor', 'Cor', 'carCor', 'color') ?? null,
    mileage: parseNum(get('KM', 'km', 'Km', 'quilometragem', 'Quilometragem', 'carKm', 'carQuilometragem', 'mileage')),
    fuel: get('COMBUSTIVEL', 'combustivel', 'Combustível', '_fuelName', 'fuel', 'TipoCombustivel') ?? null,
    transmission: get('CAMBIO', 'cambio', 'Câmbio', 'transmissao', 'carCambio', 'transmission') ?? null,
    purchase_price: parseNum(get('VALOR_COMPRA', 'valor_compra', 'carValorCompra', 'valorcompra', 'ValorCompra', 'custo', 'purchase_price')),
    sale_price: parseNum(get('VALOR_VENDA', 'valor_venda', 'carValorWeb', 'carValorTabela', 'valorvenda', 'ValorVenda', 'sale_price')) || null,
    purchase_date: purchaseDate,
    sale_date: saleDate,
    status,
    source: get('ORIGEM', 'origem', 'Origem', 'source') ?? 'import',
    notes: get('OBS', 'obs', 'Obs', 'observacoes', 'Observacoes', 'carMotor', 'notes') ?? null,
    photos: [],
    external_id: externalId ? String(externalId) : null,
  }
}

// Maps a raw expense row to our expenses schema.
// vehicleIdByExternal maps original vehicle ID → our UUID
function mapExpenseRow(
  row: Record<string, any>,
  dealershipId: string,
  vehicleIdByExternal: Record<string, string>
): Record<string, any> | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
      if (val !== undefined && val !== null && val !== '') return val
    }
    return undefined
  }

  const amount = parseNum(get('VALOR', 'valor', 'Valor', 'amount'))
  if (!amount) return null

  const rawVehicleId = get('VEICULO_ID', 'veiculo_id', 'veiculoid', 'VeiculoId', 'vehicle_id', 'vehicleId')
  const vehicleUUID = rawVehicleId ? vehicleIdByExternal[String(rawVehicleId)] ?? null : null

  const rawDate = parseDate(get('DATA', 'data', 'Data', 'date'))

  return {
    dealership_id: dealershipId,
    vehicle_id: vehicleUUID,
    category: String(get('CATEGORIA', 'categoria', 'Categoria', 'category') ?? 'Outros').toUpperCase().trim(),
    description: get('DESCRICAO', 'descricao', 'Descrição', 'Descricao', 'description') ?? null,
    amount,
    date: rawDate ?? new Date().toISOString().split('T')[0],
    vendor_name: get('FORNECEDOR', 'fornecedor', 'Fornecedor', 'vendor_name', 'vendor') ?? null,
    payment_method: get('FORMA_PGTO', 'forma_pgto', 'formapgto', 'FormaPgto', 'payment_method') ?? null,
    external_id: get('ID', 'id') ? String(get('ID', 'id')) : null,
  }
}

function parseCSV(text: string): Record<string, any>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
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

interface ParsedMDB {
  vehicleRows: Record<string, any>[]
  expenseRows: Record<string, any>[]
  saleRows: Record<string, any>[]
  tableNames: string[]
  targetTable: string
  meta: Record<string, any>
}

function parseMDB(buffer: Buffer): ParsedMDB {
  const reader = new MDBReader(buffer)
  const tableNames = reader.getTableNames()

  // Priority: flat 'veiculos' table first (has MARCA/MODELO direct), then normalized tbVeiculo
  const vehiclePriority = ['veiculos', 'Veiculos', 'VEICULOS', 'tbVeiculo', 'tbVeiculos', 'Veiculo', 'Veiculos', 'tblVeiculo']
  const vehicleKeywords = ['veiculo', 'carro', 'estoque', 'vehicle', 'auto', 'stock']

  const targetTable =
    vehiclePriority.find(p => tableNames.includes(p)) ??
    tableNames.find(t => vehicleKeywords.some(k => t.toLowerCase().includes(k))) ??
    tableNames.find(t => !t.startsWith('MSys')) ??
    tableNames[0]

  if (!targetTable) return { vehicleRows: [], expenseRows: [], saleRows: [], tableNames, targetTable: '', meta: {} }

  const rawVehicles = reader.getTable(targetTable).getData() as Record<string, any>[]

  // ── Brand lookup (only needed for normalized tbVeiculo style) ──
  const brandMap: Record<string | number, string> = {}
  const brandTable = tableNames.find(t => /^tbFabricante/i.test(t))
  if (brandTable) {
    reader.getTable(brandTable).getData().forEach((r: any) => {
      const id = r['fabID'] ?? r['id']
      const name = r['fabNome'] ?? r['fabDescri'] ?? r['Nome'] ?? r['Descri'] ?? r['nome'] ?? r['descri']
      if (id !== undefined && id !== null && name) brandMap[id] = String(name)
    })
  }

  // ── Model lookup ──
  const modelMap: Record<string | number, string> = {}
  const modelTable = tableNames.find(t => /modelo/i.test(t))
  if (modelTable) {
    reader.getTable(modelTable).getData().forEach((r: any) => {
      const id = r['modID'] ?? r['id']
      const name = r['modNome'] ?? r['modDescri'] ?? r['Nome'] ?? r['Descri'] ?? r['nome'] ?? r['descri']
      if (id !== undefined && id !== null && name) modelMap[id] = String(name)
    })
  }

  // ── Fuel lookup ──
  const fuelMap: Record<string | number, string> = {}
  const fuelTable = tableNames.find(t => /combustivel|combust|tbgaz/i.test(t))
  if (fuelTable) {
    reader.getTable(fuelTable).getData().forEach((r: any) => {
      const id = r['gazID'] ?? r['combID'] ?? r['id']
      const name = r['gazNome'] ?? r['combNome'] ?? r['gazDescri'] ?? r['Nome'] ?? r['Descri'] ?? r['nome'] ?? r['descri']
      if (id !== undefined && id !== null && name) fuelMap[id] = String(name)
    })
  }

  // Detect date columns in first row for purchase date fallback
  const firstRow = rawVehicles[0] ?? {}
  const dateCols = Object.entries(firstRow)
    .filter(([, v]) => v instanceof Date && !isNaN((v as Date).getTime()))
    .map(([k]) => k)

  // Enrich vehicle rows with resolved lookups
  const vehicleRows = rawVehicles.map(r => {
    const purchaseDateHint = dateCols.reduce<Date | null>((found, col) => {
      if (found) return found
      const d = r[col]
      return d instanceof Date && !isNaN(d.getTime()) ? d : null
    }, null)

    return {
      ...r,
      _brandName: r['fabID'] !== undefined ? (brandMap[r['fabID']] ?? null) : null,
      _modelName: r['modID'] !== undefined ? (modelMap[r['modID']] ?? null) : null,
      _fuelName: r['gazID'] !== undefined ? (fuelMap[r['gazID']] ?? null) : null,
      _purchaseDate: r['DATA_COMPRA'] instanceof Date ? r['DATA_COMPRA']
        : r['carCertificadoData'] instanceof Date ? r['carCertificadoData']
        : purchaseDateHint,
    }
  })

  // ── Expenses table ──
  const expenseTable = tableNames.find(t =>
    ['despesas', 'Despesas', 'DESPESAS', 'tbDespesa', 'tbDespesas', 'expenses'].includes(t) ||
    /despesa/i.test(t)
  )
  const expenseRows = expenseTable ? reader.getTable(expenseTable).getData() as Record<string, any>[] : []

  // ── Sales table ──
  const saleTable = tableNames.find(t =>
    ['vendas', 'Vendas', 'VENDAS', 'tbVenda', 'tbVendas', 'sales'].includes(t) ||
    /venda/i.test(t)
  )
  const saleRows = saleTable ? reader.getTable(saleTable).getData() as Record<string, any>[] : []

  return {
    vehicleRows,
    expenseRows,
    saleRows,
    tableNames,
    targetTable,
    meta: {
      brandMapSize: Object.keys(brandMap).length,
      modelMapSize: Object.keys(modelMap).length,
      fuelMapSize: Object.keys(fuelMap).length,
      expenseTable: expenseTable ?? null,
      saleTable: saleTable ?? null,
    },
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
  let vehicleRawRows: Record<string, any>[] = []
  let expenseRawRows: Record<string, any>[] = []
  const errors: string[] = []
  let debugInfo: Record<string, any> = {}

  try {
    const name = file.name.toLowerCase()
    if (name.endsWith('.mdb') || name.endsWith('.accdb')) {
      const result = parseMDB(buffer)
      vehicleRawRows = result.vehicleRows
      expenseRawRows = result.expenseRows
      debugInfo = { targetTable: result.targetTable, allTables: result.tableNames, ...result.meta }
    } else if (name.endsWith('.csv')) {
      vehicleRawRows = parseCSV(buffer.toString('utf-8'))
    } else if (name.endsWith('.json')) {
      vehicleRawRows = JSON.parse(buffer.toString('utf-8'))
    } else {
      vehicleRawRows = parseCSV(buffer.toString('utf-8'))
    }
  } catch (e: any) {
    errors.push(`Parse error: ${e.message}`)
  }

  let vehiclesImported = 0
  let expensesImported = 0
  let sampleMapped: Record<string, any>[] = []

  // ── Import vehicles ──
  if (vehicleRawRows.length > 0) {
    const mapped = vehicleRawRows
      .map(r => mapVehicleRow(r, dealershipId))
      .filter((r): r is Record<string, any> => r !== null)

    sampleMapped = mapped.slice(0, 3)

    if (mapped.length > 0) {
      for (let i = 0; i < mapped.length; i += 100) {
        const chunk = mapped.slice(i, i + 100)
        const { data: inserted, error: insertErr } = await svc
          .from('vehicles')
          .upsert(chunk, { onConflict: 'dealership_id,external_id', ignoreDuplicates: false })
          .select('id')

        if (insertErr) errors.push(`Veículos batch ${i / 100 + 1}: ${insertErr.message}`)
        else vehiclesImported += inserted?.length ?? 0
      }

      // Refresh days_in_stock after import
      try { await svc.rpc('refresh_days_in_stock', { d_id: dealershipId }) } catch { /* may not exist */ }
    } else {
      errors.push(`${vehicleRawRows.length} linhas lidas mas nenhuma correspondeu às colunas esperadas. Tabela: ${debugInfo.targetTable}. Colunas da primeira linha: ${Object.keys(vehicleRawRows[0] ?? {}).filter(k => !k.startsWith('_')).slice(0, 20).join(', ')}`)
    }
  }

  // ── Import expenses (if MDB had a despesas table) ──
  if (expenseRawRows.length > 0 && vehiclesImported > 0) {
    // Build external_id → UUID map for vehicles just imported
    const { data: vehMap } = await svc
      .from('vehicles')
      .select('id, external_id')
      .eq('dealership_id', dealershipId)
      .not('external_id', 'is', null)

    const vehicleIdByExternal: Record<string, string> = {}
    ;(vehMap || []).forEach((v: any) => { vehicleIdByExternal[v.external_id] = v.id })

    const mappedExpenses = expenseRawRows
      .map(r => mapExpenseRow(r, dealershipId, vehicleIdByExternal))
      .filter((r): r is Record<string, any> => r !== null)

    if (mappedExpenses.length > 0) {
      // Remove external_id before insert (no unique constraint on expenses)
      const expensesToInsert = mappedExpenses.map(({ external_id: _eid, ...rest }) => rest)

      // Only insert if there are no existing imported expenses for this dealership
      const { count } = await svc
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('dealership_id', dealershipId)

      if ((count ?? 0) === 0) {
        for (let i = 0; i < expensesToInsert.length; i += 100) {
          const chunk = expensesToInsert.slice(i, i + 100)
          const { data: inserted, error: expErr } = await svc
            .from('expenses')
            .insert(chunk as any)
            .select('id')

          if (expErr) errors.push(`Despesas batch ${i / 100 + 1}: ${expErr.message}`)
          else expensesImported += inserted?.length ?? 0
        }
      }
    }
  }

  const totalImported = vehiclesImported + expensesImported

  await svc
    .from('imports')
    .update({
      status: errors.length > 0 && vehiclesImported === 0 ? 'error' : 'complete',
      records_imported: totalImported,
      errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', (importRecord as any).id)

  return NextResponse.json({
    import_id: (importRecord as any).id,
    vehicles_imported: vehiclesImported,
    expenses_imported: expensesImported,
    records_imported: totalImported,
    total_rows_parsed: vehicleRawRows.length,
    errors,
    debug: debugInfo,
    sample: sampleMapped,
  })
}
