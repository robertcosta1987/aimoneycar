import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import MDBReader from 'mdb-reader'

function parseNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseYear(v: any, fallback = new Date().getFullYear()): number {
  if (!v) return fallback
  const n = parseInt(String(v).slice(0, 4))
  return isNaN(n) ? fallback : n
}

// Reject Access null dates (1899-12-30) and anything before 1990
function parseDate(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) {
    if (isNaN(v.getTime()) || v.getFullYear() < 1990) return null
    return v.toISOString().split('T')[0]
  }
  const s = String(v).trim()
  if (!s || s === 'null') return null
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) {
    if (parseInt(br[3]) < 1990) return null
    return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    if (parseInt(s.slice(0, 4)) < 1990) return null
    return s.slice(0, 10)
  }
  return null
}

interface MDBData {
  vehicleRows: Record<string, any>[]
  expenseRows: Record<string, any>[]
  tableNames: string[]
  meta: Record<string, any>
}

function parseMDB(buffer: Buffer): MDBData {
  const reader = new MDBReader(buffer)
  const tableNames = reader.getTableNames()

  const readTable = (name: string): Record<string, any>[] => {
    if (!tableNames.includes(name)) return []
    try { return reader.getTable(name).getData() as Record<string, any>[] } catch { return [] }
  }

  // ── Lookup tables ──────────────────────────────────────────────────────────

  // fabID → brand name
  const brandMap: Record<number, string> = {}
  readTable('tbFabricantes').forEach((r: any) => {
    if (r.fabID !== undefined && r.fabNome) brandMap[r.fabID] = String(r.fabNome)
  })

  // gazID → fuel name
  const fuelMap: Record<number, string> = {}
  readTable('tbCombustivel').forEach((r: any) => {
    if (r.gazID !== undefined && r.gazDescri) fuelMap[r.gazID] = String(r.gazDescri)
  })

  // plaID → plan/category name (for expenses)
  const planMap: Record<number, string> = {}
  readTable('tbPlanoContas').forEach((r: any) => {
    if (r.plaID !== undefined && r.PlaNome) planMap[r.plaID] = String(r.PlaNome)
  })

  // carID → purchase data { date, km, valor }
  const purchaseMap: Record<number, { date: any; km: any; valor: any }> = {}
  readTable('tbDadosCompra').forEach((r: any) => {
    if (r.carID) purchaseMap[r.carID] = { date: r.cData, km: r.cKM, valor: r.cValor }
  })

  // carID → sale data { date, km, valor, cliID }
  const saleMap: Record<number, { date: any; km: any; valor: any; cliID: any }> = {}
  readTable('tbDadosVenda').forEach((r: any) => {
    if (r.carID) saleMap[r.carID] = { date: r.vData, km: r.vKM, valor: r.vValorVenda, cliID: r.cliID }
  })

  // ── Vehicle rows ───────────────────────────────────────────────────────────
  const rawVehicles = readTable('tbVeiculo')
  const vehicleRows = rawVehicles.map(r => ({
    ...r,
    _brand: r.fabID !== undefined ? (brandMap[r.fabID] ?? null) : null,
    _fuel: r.gazID !== undefined ? (fuelMap[r.gazID] ?? null) : null,
    _purchase: purchaseMap[r.carID] ?? null,
    _sale: saleMap[r.carID] ?? null,
  }))

  // ── Expense rows (tbMovimento) ─────────────────────────────────────────────
  // Exclude vehicle purchase/sale entries (plan names containing VEICULO/COMPRA/VENDA)
  const EXCLUDE_PLANS = ['VEICULO', 'VEÍCULO', 'COMPRA', 'VENDA']
  const expenseRows = readTable('tbMovimento')
    .filter((r: any) => {
      if (!r.carReferencia || r.carReferencia === 0) return false
      if (parseNum(r.movValor) <= 0) return false
      const plan = (planMap[r.plaID] ?? '').toUpperCase()
      if (EXCLUDE_PLANS.some(ex => plan.includes(ex))) return false
      return true
    })
    .map((r: any) => ({
      ...r,
      _planName: planMap[r.plaID] ?? 'Outros',
    }))

  return {
    vehicleRows,
    expenseRows,
    tableNames,
    meta: {
      targetTable: 'tbVeiculo',
      vehicleCount: rawVehicles.length,
      brandMapSize: Object.keys(brandMap).length,
      fuelMapSize: Object.keys(fuelMap).length,
      planMapSize: Object.keys(planMap).length,
      purchaseRecords: Object.keys(purchaseMap).length,
      saleRecords: Object.keys(saleMap).length,
      expenseCount: expenseRows.length,
    },
  }
}

function mapVehicleRow(row: Record<string, any>, dealershipId: string): Record<string, any> | null {
  const carId = row.carID
  if (!carId) return null

  const purchase = row._purchase
  const sale = row._sale

  // Plate: strip Moneycar's internal suffix (e.g. "SHI-4C15/01" → "SHI-4C15")
  const rawPlate = String(row.carPlaca ?? '').trim()
  const plate = rawPlate.replace(/\/\d+$/, '').toUpperCase() || null

  const brand = row._brand ?? 'Desconhecido'
  const model = String(row.carDescri ?? 'Desconhecido').trim()
  const yearFab = parseYear(row.carAno)
  const yearModel = parseYear(row.carAnoModelo ?? null, yearFab)

  // Purchase date comes from tbDadosCompra.cData — not tbVeiculo
  const purchaseDate = parseDate(purchase?.date) ?? `${yearFab}-01-01`

  // Sale date from tbDadosVenda.vData (1900-01-01 = not sold → null)
  const saleDate = parseDate(sale?.date)

  // Status: sold if there's a real sale date
  const status: 'available' | 'reserved' | 'sold' = saleDate ? 'sold' : 'available'

  // KM: from tbDadosCompra.cKM (mileage when acquired)
  const mileage = parseNum(purchase?.km ?? 0)

  // Prices
  const purchasePrice = parseNum(row.carValorCompra)
  // Sale price: use actual sale price if sold, else asking price (carValorTabela)
  const actualSalePrice = saleDate ? parseNum(sale?.valor) : 0
  const askingPrice = parseNum(row.carValorTabela)
  const salePrice = actualSalePrice > 0 ? actualSalePrice : (askingPrice > 0 ? askingPrice : null)

  return {
    dealership_id: dealershipId,
    external_id: String(carId),
    plate,
    chassis: row.carChassi ? String(row.carChassi).trim() : null,
    renavam: row.carRenavan ? String(row.carRenavan).trim() : null,
    brand: String(brand).trim(),
    model,
    version: null,
    year_fab: yearFab,
    year_model: yearModel,
    color: row.carCor ? String(row.carCor).trim() : null,
    mileage,
    fuel: row._fuel ?? null,
    transmission: null,
    purchase_price: purchasePrice,
    sale_price: salePrice,
    purchase_date: purchaseDate,
    sale_date: saleDate,
    status,
    source: 'import',
    notes: row.carMotor ? String(row.carMotor).trim() : null,
    photos: [],
  }
}

function mapExpenseRow(
  row: Record<string, any>,
  dealershipId: string,
  vehicleIdByExternal: Record<string, string>
): Record<string, any> | null {
  const amount = parseNum(row.movValor)
  if (!amount) return null

  const vehicleUUID = row.carReferencia
    ? (vehicleIdByExternal[String(row.carReferencia)] ?? null)
    : null

  const date = parseDate(row.movData) ?? new Date().toISOString().split('T')[0]

  return {
    dealership_id: dealershipId,
    external_id: String(row.movID ?? ''),
    vehicle_id: vehicleUUID,
    category: String(row._planName ?? 'Outros').toUpperCase().trim(),
    description: row.movDescri ? String(row.movDescri).slice(0, 255) : null,
    amount,
    date,
    vendor_name: null,
    payment_method: null,
  }
}

function parseCSV(text: string): Record<string, any>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const delimiter = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, any> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  }).filter(row => Object.values(row).some(v => v !== ''))
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
    .select().single()

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
      debugInfo = result.meta
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
  let vehiclesMapped = 0
  let expensesImported = 0
  const sampleMapped: Record<string, any>[] = []

  // ── Import vehicles ────────────────────────────────────────────────────────
  if (vehicleRawRows.length > 0) {
    const mapped = vehicleRawRows
      .map(r => mapVehicleRow(r, dealershipId))
      .filter((r): r is Record<string, any> => r !== null)

    vehiclesMapped = mapped.length
    sampleMapped.push(...mapped.slice(0, 3))

    if (mapped.length > 0) {
      for (let i = 0; i < mapped.length; i += 100) {
        const chunk = mapped.slice(i, i + 100)
        const { data: inserted, error: insertErr } = await svc
          .from('vehicles')
          .upsert(chunk, { onConflict: 'dealership_id,external_id', ignoreDuplicates: false })
          .select('id')
        if (insertErr) errors.push(`Veículos batch ${i / 100 + 1}: ${insertErr.message}`)
        else vehiclesImported += chunk.length
      }

      try { await svc.rpc('refresh_days_in_stock', { d_id: dealershipId }) } catch { /* may not exist */ }
    } else {
      errors.push(`Nenhum veículo mapeado de ${vehicleRawRows.length} linhas. Colunas: ${Object.keys(vehicleRawRows[0] ?? {}).filter(k => !k.startsWith('_')).slice(0, 20).join(', ')}`)
    }
  }

  // ── Import expenses ────────────────────────────────────────────────────────
  if (expenseRawRows.length > 0) {
    // Build carID → UUID map
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
      // Filter to expenses that have an external_id (movID) so we can upsert safely
      const withId = mappedExpenses.filter(e => e.external_id)
      const withoutId = mappedExpenses.filter(e => !e.external_id)

      for (let i = 0; i < withId.length; i += 100) {
        const chunk = withId.slice(i, i + 100)
        const { error: expErr } = await svc
          .from('expenses')
          .upsert(chunk as any, { onConflict: 'dealership_id,external_id', ignoreDuplicates: false })
        if (expErr) errors.push(`Despesas batch ${i / 100 + 1}: ${expErr.message}`)
        else expensesImported += chunk.length
      }

      // For expenses without movID, only insert if none exist yet
      if (withoutId.length > 0) {
        const { count } = await svc
          .from('expenses')
          .select('id', { count: 'exact', head: true })
          .eq('dealership_id', dealershipId)
        if ((count ?? 0) === 0) {
          for (let i = 0; i < withoutId.length; i += 100) {
            const chunk = withoutId.slice(i, i + 100)
            const { error: expErr } = await svc
              .from('expenses')
              .insert(chunk as any)
            if (expErr) errors.push(`Despesas (sem ID) batch ${i / 100 + 1}: ${expErr.message}`)
            else expensesImported += chunk.length
          }
        }
      }
    }
  }

  await svc
    .from('imports')
    .update({
      status: errors.length > 0 && vehiclesImported === 0 ? 'error' : 'complete',
      records_imported: vehiclesImported + expensesImported,
      errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', (importRecord as any).id)

  return NextResponse.json({
    import_id: (importRecord as any).id,
    vehicles_imported: vehiclesImported,
    vehicles_mapped: vehiclesMapped,
    expenses_imported: expensesImported,
    total_rows_parsed: vehicleRawRows.length,
    errors,
    debug: debugInfo,
    sample: sampleMapped,
  })
}
