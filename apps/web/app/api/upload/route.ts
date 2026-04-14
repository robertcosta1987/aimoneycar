import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import MDBReader from 'mdb-reader'

export const maxDuration = 300 // Allow up to 5 min for large MDB imports (Vercel Pro)

// ─── Parse helpers ─────────────────────────────────────────────────────────────

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
    return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    if (parseInt(s.slice(0, 4)) < 1990) return null
    return s.slice(0, 10)
  }
  return null
}

function str(v: any, max = 255): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim().slice(0, max) || null
}

// ─── MDB parser ────────────────────────────────────────────────────────────────

interface MDBData {
  vehicleRows: Record<string, any>[]
  expenseRows: Record<string, any>[]
  rawTables: Record<string, Record<string, any>[]>
  tableNames: string[]
}

function parseMDB(buffer: Buffer): MDBData {
  const reader = new MDBReader(buffer)
  const tableNames = reader.getTableNames()

  // Build raw tables map — single read per table, reused throughout
  const rawTables: Record<string, Record<string, any>[]> = {}
  for (const name of tableNames) {
    try { rawTables[name] = reader.getTable(name).getData() as Record<string, any>[] } catch { rawTables[name] = [] }
  }
  const t = (name: string) => rawTables[name] ?? []

  // Lookup maps (use already-loaded rawTables — no second read)
  const brandMap: Record<number, string> = {}
  t('tbFabricantes').forEach((r: any) => {
    if (r.fabID !== undefined && r.fabNome) brandMap[r.fabID] = String(r.fabNome)
  })

  const fuelMap: Record<number, string> = {}
  t('tbCombustivel').forEach((r: any) => {
    if (r.gazID !== undefined && r.gazDescri) fuelMap[r.gazID] = String(r.gazDescri)
  })

  const planMap: Record<number, string> = {}
  t('tbPlanoContas').forEach((r: any) => {
    if (r.plaID !== undefined && r.PlaNome) planMap[r.plaID] = String(r.PlaNome)
  })

  const purchaseMap: Record<number, { date: any; km: any; valor: any }> = {}
  t('tbDadosCompra').forEach((r: any) => {
    if (r.carID) purchaseMap[r.carID] = { date: r.cData, km: r.cKM, valor: r.cValor }
  })

  const saleMap: Record<number, { date: any; km: any; valor: any; cliID: any }> = {}
  t('tbDadosVenda').forEach((r: any) => {
    if (r.carID) saleMap[r.carID] = { date: r.vData, km: r.vKM, valor: r.vValorVenda, cliID: r.cliID }
  })

  const rawVehicles = t('tbVeiculo')
  const vehicleRows = rawVehicles.map(r => ({
    ...r,
    _brand: r.fabID !== undefined ? (brandMap[r.fabID] ?? null) : null,
    _fuel: r.gazID !== undefined ? (fuelMap[r.gazID] ?? null) : null,
    _purchase: purchaseMap[r.carID] ?? null,
    _sale: saleMap[r.carID] ?? null,
  }))

  const EXCLUDE_PLANS = ['VEICULO', 'VEÍCULO', 'COMPRA', 'VENDA']
  const expenseRows = t('tbMovimento')
    .filter((r: any) => {
      if (!r.carReferencia || r.carReferencia === 0) return false
      if (parseNum(r.movValor) <= 0) return false
      const plan = (planMap[r.plaID] ?? '').toUpperCase()
      if (EXCLUDE_PLANS.some(ex => plan.includes(ex))) return false
      return true
    })
    .map((r: any) => ({ ...r, _planName: planMap[r.plaID] ?? 'Outros' }))

  return { vehicleRows, expenseRows, rawTables, tableNames }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapVehicleRow(row: Record<string, any>, dealershipId: string): Record<string, any> | null {
  const carId = row.carID
  if (!carId) return null

  const purchase = row._purchase
  const sale = row._sale
  const rawPlate = String(row.carPlaca ?? '').trim()
  const plate = rawPlate.replace(/\/\d+$/, '').toUpperCase() || null
  const brand = row._brand ?? 'Desconhecido'
  const model = String(row.carDescri ?? 'Desconhecido').trim()
  const yearFab = parseYear(row.carAno)
  const yearModel = parseYear(row.carAnoModelo ?? null, yearFab)
  const purchaseDate = parseDate(purchase?.date) ?? `${yearFab}-01-01`
  const saleDate = parseDate(sale?.date)
  const status: 'available' | 'reserved' | 'sold' = saleDate ? 'sold' : 'available'
  const mileage = parseNum(purchase?.km ?? 0)
  const purchasePrice = parseNum(row.carValorCompra)
  const actualSalePrice = saleDate ? parseNum(sale?.valor) : 0
  const askingPrice = parseNum(row.carValorTabela)
  const salePrice = actualSalePrice > 0 ? actualSalePrice : (askingPrice > 0 ? askingPrice : null)

  return {
    dealership_id: dealershipId,
    external_id: String(carId),
    plate,
    chassis: str(row.carChassi),
    renavam: str(row.carRenavan),
    brand: String(brand).trim(),
    model,
    version: null,
    year_fab: yearFab,
    year_model: yearModel,
    color: str(row.carCor),
    mileage,
    fuel: row._fuel ?? null,
    transmission: null,
    purchase_price: purchasePrice,
    sale_price: salePrice,
    purchase_date: purchaseDate,
    sale_date: saleDate,
    status,
    source: 'import',
    notes: str(row.carMotor),
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
  const vehicleUUID = row.carReferencia ? (vehicleIdByExternal[String(row.carReferencia)] ?? null) : null
  const date = parseDate(row.movData) ?? new Date().toISOString().split('T')[0]
  return {
    dealership_id: dealershipId,
    external_id: str(row.movID),
    vehicle_id: vehicleUUID,
    category: String(row._planName ?? 'Outros').toUpperCase().trim(),
    description: str(row.movDescri),
    amount,
    date,
    vendor_name: null,
    payment_method: null,
  }
}

// ─── Generic upsert helper ─────────────────────────────────────────────────────

async function upsertBatch(
  svc: any,
  table: string,
  rows: Record<string, any>[],
  conflictKey: string,
  errors: string[]
): Promise<number> {
  if (!rows.length) return 0
  let count = 0
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await svc.from(table).upsert(chunk, { onConflict: conflictKey, ignoreDuplicates: false })
    if (error) errors.push(`${table} batch ${Math.floor(i / 100) + 1}: ${error.message}`)
    else count += chunk.length
  }
  return count
}

async function insertBatch(
  svc: any,
  table: string,
  rows: Record<string, any>[],
  errors: string[]
): Promise<number> {
  if (!rows.length) return 0
  let count = 0
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await svc.from(table).insert(chunk)
    if (error) errors.push(`${table} insert batch ${Math.floor(i / 100) + 1}: ${error.message}`)
    else count += chunk.length
  }
  return count
}

// ─── CSV parser ────────────────────────────────────────────────────────────────

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

// ─── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc.from('users').select('dealership_id').eq('id', user.id).single()
  if (!profile?.dealership_id) return NextResponse.json({ error: 'No dealership' }, { status: 400 })

  const dealershipId = profile.dealership_id
  const D = dealershipId

  // Support both direct FormData upload (small files) and Supabase Storage path (large files)
  const contentType = req.headers.get('content-type') ?? ''
  let filename = 'upload'
  let fileType = 'application/octet-stream'
  let fileSize = 0
  let buffer: Buffer
  let storagePath: string | null = null

  if (contentType.includes('application/json')) {
    // Large file path: file already uploaded to Supabase Storage by client
    const body = await req.json()
    storagePath = body.storagePath as string
    filename = body.filename as string ?? 'upload'
    fileType = body.fileType as string ?? 'application/octet-stream'
    if (!storagePath) return NextResponse.json({ error: 'No storagePath provided' }, { status: 400 })
    const { data: storageData, error: storageErr } = await svc.storage.from('imports').download(storagePath)
    if (storageErr || !storageData) return NextResponse.json({ error: 'Failed to fetch uploaded file' }, { status: 400 })
    const arrayBuffer = await storageData.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
    fileSize = buffer.length
  } else {
    // Small file path: direct FormData upload
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    filename = file.name
    fileType = file.type || 'application/octet-stream'
    fileSize = file.size
    buffer = Buffer.from(await file.arrayBuffer())
  }

  const { data: importRecord, error: importErr } = await svc
    .from('imports')
    .insert({
      dealership_id: D,
      filename,
      file_type: fileType,
      file_size: fileSize,
      status: 'processing',
      records_imported: 0,
      errors: [],
      created_by: user.id,
    })
    .select().single()

  if (importErr) return NextResponse.json({ error: importErr.message }, { status: 500 })
  const errors: string[] = []
  const counts: Record<string, number> = {}
  const isMdb = filename.toLowerCase().endsWith('.mdb') || filename.toLowerCase().endsWith('.accdb')
  let mdbData: MDBData | null = null

  if (isMdb) {
    try {
      mdbData = parseMDB(buffer)
    } catch (e: any) {
      errors.push(`Parse error: ${e.message}`)
      await svc.from('imports').update({ status: 'error', errors, completed_at: new Date().toISOString() }).eq('id', (importRecord as any).id)
      return NextResponse.json({ error: errors[0] }, { status: 400 })
    }

    const { rawTables } = mdbData!

    // ── Step 1: Lookup / reference tables (no FK deps) ────────────────────────

    counts.manufacturers = await upsertBatch(svc, 'manufacturers',
      (rawTables['tbFabricantes'] ?? []).filter(r => r.fabID && r.fabNome).map(r => ({
        dealership_id: D, external_id: String(r.fabID), name: str(r.fabNome)!,
      })), 'dealership_id,external_id', errors)

    counts.fuel_types = await upsertBatch(svc, 'fuel_types',
      (rawTables['tbCombustivel'] ?? []).filter(r => r.gazID && r.gazDescri).map(r => ({
        dealership_id: D, external_id: String(r.gazID), name: str(r.gazDescri)!,
      })), 'dealership_id,external_id', errors)

    counts.plan_accounts = await upsertBatch(svc, 'plan_accounts',
      (rawTables['tbPlanoContas'] ?? []).filter(r => r.plaID && r.PlaNome).map(r => ({
        dealership_id: D, external_id: String(r.plaID), name: str(r.PlaNome)!,
        category: str(r.plaCategoria), type: str(r.plaTipo),
      })), 'dealership_id,external_id', errors)

    counts.customer_origins = await upsertBatch(svc, 'customer_origins',
      (rawTables['tbOrigemCliente'] ?? []).filter(r => r.oriID).map(r => ({
        dealership_id: D, external_id: String(r.oriID),
        name: str(r.oriDescri) ?? str(r.oriNome) ?? 'Sem nome',
      })), 'dealership_id,external_id', errors)

    counts.cancellation_reasons = await upsertBatch(svc, 'cancellation_reasons',
      (rawTables['tbMotivoCancelamento'] ?? []).filter(r => r.mcanID).map(r => ({
        dealership_id: D, external_id: String(r.mcanID),
        description: str(r.mcanDescri) ?? str(r.mcanNome) ?? 'Sem descrição',
      })), 'dealership_id,external_id', errors)

    counts.standard_pendencies = await upsertBatch(svc, 'standard_pendencies',
      (rawTables['tbPendenciaPadrao'] ?? []).filter(r => r.ppnID).map(r => ({
        dealership_id: D, external_id: String(r.ppnID),
        description: str(r.ppnDescri) ?? str(r.ppnNome) ?? 'Sem descrição',
        category: str(r.ppnCategoria),
      })), 'dealership_id,external_id', errors)

    counts.standard_expenses = await upsertBatch(svc, 'standard_expenses',
      (rawTables['tbDespesaPadrao'] ?? []).filter(r => r.dpaID).map(r => ({
        dealership_id: D, external_id: String(r.dpaID),
        description: str(r.dpaDescri) ?? str(r.dpaNome) ?? 'Sem descrição',
        plan_account_external_id: r.plaID ? String(r.plaID) : null,
        amount: r.dpaValor ? parseNum(r.dpaValor) : null,
      })), 'dealership_id,external_id', errors)

    counts.optionals = await upsertBatch(svc, 'optionals',
      (rawTables['tbOpcionais'] ?? []).filter(r => r.opcID).map(r => ({
        dealership_id: D, external_id: String(r.opcID),
        name: str(r.opcDescri) ?? str(r.opcNome) ?? 'Sem nome',
        category: str(r.opcCategoria),
      })), 'dealership_id,external_id', errors)

    counts.general_enumerations = await upsertBatch(svc, 'general_enumerations',
      (rawTables['tbEnumGeral'] ?? []).filter(r => r.enuID).map(r => ({
        dealership_id: D, external_id: String(r.enuID),
        type: str(r.enuTipo) ?? 'GERAL',
        code: str(r.enuCodigo),
        description: str(r.enuDescri) ?? str(r.enuNome) ?? 'Sem descrição',
      })), 'dealership_id,external_id', errors)

    counts.text_configurations = await upsertBatch(svc, 'text_configurations',
      (rawTables['tbCadastroTextos'] ?? []).filter(r => r.texID).map(r => ({
        dealership_id: D, external_id: String(r.texID),
        key: str(r.texDescri) ?? str(r.texNome) ?? String(r.texID),
        content: str(r.texConteudo, 10000), type: str(r.texTipo),
      })), 'dealership_id,external_id', errors)

    counts.ncm = await upsertBatch(svc, 'ncm',
      (rawTables['tbNCM'] ?? []).filter(r => r.ncmID).map(r => ({
        dealership_id: D, external_id: String(r.ncmID),
        code: str(r.ncmCodigo) ?? String(r.ncmID), description: str(r.ncmDescri),
      })), 'dealership_id,external_id', errors)

    counts.nature_of_operation = await upsertBatch(svc, 'nature_of_operation',
      (rawTables['tbNaturezaOp'] ?? []).filter(r => r.natID).map(r => ({
        dealership_id: D, external_id: String(r.natID),
        description: str(r.natDescri) ?? str(r.natNome) ?? 'Sem descrição',
        cfop: str(r.natCFOP),
      })), 'dealership_id,external_id', errors)

    counts.banks = await upsertBatch(svc, 'banks',
      (rawTables['tbBancosCadastro'] ?? []).filter(r => r.bancID).map(r => ({
        dealership_id: D, external_id: String(r.bancID),
        name: str(r.bancNome) ?? str(r.bancDescri) ?? 'Sem nome',
        code: str(r.bancCodigo), agency: str(r.bancAgencia), account: str(r.bancConta),
      })), 'dealership_id,external_id', errors)

    // ── Step 2: Customers ─────────────────────────────────────────────────────

    counts.customers = await upsertBatch(svc, 'customers',
      (rawTables['tbCliente'] ?? []).filter(r => r.cliID).map(r => ({
        dealership_id: D, external_id: String(r.cliID),
        name: str(r.cliNome) ?? str(r.cliRazaoSocial) ?? 'Sem nome',
        phone: str(r.cliTelefone) ?? str(r.cliTelResidencial),
        email: str(r.cliEmail), cpf: str(r.cliCPF), cnpj: str(r.cliCNPJ),
        rg: str(r.cliRG), birth_date: parseDate(r.cliDataNasc ?? r.cliNascimento),
        address: str(r.cliEndereco ?? r.cliLogradouro), neighborhood: str(r.cliBairro),
        city: str(r.cliCidade), state: str(r.cliEstado, 2), zip_code: str(r.cliCEP),
        origin_external_id: r.oriID ? String(r.oriID) : null,
        source: r.oriID ? String(r.oriID) : null,
        notes: str(r.cliObservacoes ?? r.cliObs, 1000),
      })), 'dealership_id,external_id', errors)

    // Build customer UUID map
    const { data: custMap } = await svc.from('customers').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null)
    const customerIdByExternal: Record<string, string> = {}
    ;(custMap ?? []).forEach((c: any) => { customerIdByExternal[c.external_id] = c.id })

    // tbClienteComplemento — delete+insert (no unique key on row level)
    const complRows = (rawTables['tbClienteComplemento'] ?? []).filter(r => r.cliID)
    if (complRows.length > 0) {
      await svc.from('customer_complements').delete().eq('dealership_id', D)
      counts.customer_complements = await insertBatch(svc, 'customer_complements', complRows.map(r => ({
        dealership_id: D, customer_external_id: String(r.cliID),
        customer_id: customerIdByExternal[String(r.cliID)] ?? null,
        father_name: str(r.cliPai), mother_name: str(r.cliMae),
        spouse_name: str(r.cliConjuge ?? r.cliEsposo), spouse_cpf: str(r.cliCPFConjuge),
        monthly_income: r.cliRenda ? parseNum(r.cliRenda) : null,
        profession: str(r.cliProfissao), employer: str(r.cliEmpresa),
        employer_phone: str(r.cliTelEmpresa), employer_address: str(r.cliEndEmpresa),
        employer_city: str(r.cliCidEmpresa),
      })), errors)
    }

    // tbClienteDadosComerciais
    const commData = (rawTables['tbClienteDadosComerciais'] ?? []).filter(r => r.cliID)
    if (commData.length > 0) {
      await svc.from('customer_commercial_data').delete().eq('dealership_id', D)
      counts.customer_commercial_data = await insertBatch(svc, 'customer_commercial_data', commData.map(r => ({
        dealership_id: D, customer_external_id: String(r.cliID),
        customer_id: customerIdByExternal[String(r.cliID)] ?? null,
        company_name: str(r.cliRazaoSocial ?? r.cliEmpresa), cnpj: str(r.cliCNPJ),
        activity: str(r.cliAtividade), monthly_revenue: r.cliFaturamento ? parseNum(r.cliFaturamento) : null,
        address: str(r.cliEndereco), city: str(r.cliCidade), state: str(r.cliEstado, 2), phone: str(r.cliTelefone),
      })), errors)
    }

    // tbClienteReferenciasBens
    const assetRows = (rawTables['tbClienteReferenciasBens'] ?? []).filter(r => r.cliID)
    if (assetRows.length > 0) {
      await svc.from('customer_asset_references').delete().eq('dealership_id', D)
      counts.customer_asset_references = await insertBatch(svc, 'customer_asset_references', assetRows.map(r => ({
        dealership_id: D, external_id: r.refID ? String(r.refID) : null,
        customer_external_id: String(r.cliID), customer_id: customerIdByExternal[String(r.cliID)] ?? null,
        type: str(r.refTipo), description: str(r.refDescri),
        value: r.refValor ? parseNum(r.refValor) : null,
        financing_bank: str(r.refBanco), monthly_payment: r.refParcela ? parseNum(r.refParcela) : null,
      })), errors)
    }

    // ── Step 3: Vendors ───────────────────────────────────────────────────────

    counts.vendors = await upsertBatch(svc, 'vendors',
      (rawTables['tbFornecedor'] ?? []).filter(r => r.forID).map(r => ({
        dealership_id: D, external_id: String(r.forID),
        name: str(r.forNome) ?? str(r.forRazaoSocial) ?? 'Sem nome',
        category: str(r.forCategoria), phone: str(r.forTelefone), email: str(r.forEmail),
        cnpj: str(r.forCNPJ), address: str(r.forEndereco ?? r.forLogradouro),
        neighborhood: str(r.forBairro), city: str(r.forCidade),
        state: str(r.forEstado, 2), zip_code: str(r.forCEP),
        notes: str(r.forObservacoes ?? r.forObs, 1000),
      })), 'dealership_id,external_id', errors)

    // ── Step 4: Employees ─────────────────────────────────────────────────────

    counts.employees = await upsertBatch(svc, 'employees',
      (rawTables['tbFuncionario'] ?? []).filter(r => r.funID).map(r => ({
        dealership_id: D, external_id: String(r.funID),
        name: str(r.funNome) ?? 'Sem nome', cpf: str(r.funCPF), rg: str(r.funRG),
        role: str(r.funCargo), email: str(r.funEmail), phone: str(r.funTelefone),
        address: str(r.funEndereco ?? r.funLogradouro), city: str(r.funCidade),
        state: str(r.funEstado, 2), zip_code: str(r.funCEP),
        hire_date: parseDate(r.funDataAdmissao), termination_date: parseDate(r.funDataDemissao),
        base_salary: r.funSalario ? parseNum(r.funSalario) : null,
        commission_percent: r.funComissao ? parseNum(r.funComissao) : null,
        is_active: !parseDate(r.funDataDemissao),
        notes: str(r.funObservacoes ?? r.funObs, 1000),
      })), 'dealership_id,external_id', errors)

    // Build employee UUID map
    const { data: empMap } = await svc.from('employees').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null)
    const employeeIdByExternal: Record<string, string> = {}
    ;(empMap ?? []).forEach((e: any) => { employeeIdByExternal[e.external_id] = e.id })

    counts.employee_salaries = await upsertBatch(svc, 'employee_salaries',
      (rawTables['tbfuncionarioSalario'] ?? []).filter(r => r.salID).map(r => ({
        dealership_id: D, external_id: String(r.salID),
        employee_external_id: r.funID ? String(r.funID) : null,
        employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
        date: parseDate(r.salData), amount: r.salValor ? parseNum(r.salValor) : null,
        type: str(r.salTipo) ?? str(r.salDescri), description: str(r.salDescri ?? r.salObservacoes),
      })), 'dealership_id,external_id', errors)

    counts.commission_standards = await upsertBatch(svc, 'commission_standards',
      (rawTables['tbComissaoPadrao'] ?? []).filter(r => r.cpaID).map(r => ({
        dealership_id: D, external_id: String(r.cpaID),
        employee_external_id: r.funID ? String(r.funID) : null,
        employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
        percent: r.cpaPercentual ? parseNum(r.cpaPercentual) : null,
        min_value: r.cpaValorMin ? parseNum(r.cpaValorMin) : null,
        max_value: r.cpaValorMax ? parseNum(r.cpaValorMax) : null, type: str(r.cpaTipo),
      })), 'dealership_id,external_id', errors)

    // ── Step 5: Bank accounts ─────────────────────────────────────────────────

    counts.bank_accounts = await upsertBatch(svc, 'bank_accounts',
      (rawTables['tbContasCorrentes'] ?? []).filter(r => r.ctaID).map(r => ({
        dealership_id: D, external_id: String(r.ctaID),
        name: str(r.ctaNome) ?? str(r.ctaDescri) ?? String(r.ctaID),
        bank_external_id: r.bancID ? String(r.bancID) : null,
        agency: str(r.ctaAgencia), account: str(r.ctaConta),
        balance: r.ctaSaldo ? parseNum(r.ctaSaldo) : 0,
      })), 'dealership_id,external_id', errors)

    // ── Step 6: Vehicles ──────────────────────────────────────────────────────

    const mappedVehicles = mdbData.vehicleRows
      .map(r => mapVehicleRow(r, D))
      .filter((r): r is Record<string, any> => r !== null)

    counts.vehicles = await upsertBatch(svc, 'vehicles', mappedVehicles, 'dealership_id,external_id', errors)

    // Build vehicle UUID map
    const { data: vehMap } = await svc.from('vehicles').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null)
    const vehicleIdByExternal: Record<string, string> = {}
    ;(vehMap ?? []).forEach((v: any) => { vehicleIdByExternal[v.external_id] = v.id })

    // ── Step 7: Purchase & sale raw data ──────────────────────────────────────

    counts.purchase_data = await upsertBatch(svc, 'purchase_data',
      (rawTables['tbDadosCompra'] ?? []).filter(r => r.carID).map(r => ({
        dealership_id: D, vehicle_external_id: String(r.carID),
        vehicle_id: vehicleIdByExternal[String(r.carID)] ?? null,
        purchase_date: parseDate(r.cData), mileage: r.cKM ? Math.round(parseNum(r.cKM)) : null,
        purchase_price: r.cValor ? parseNum(r.cValor) : null,
        supplier_external_id: r.forID ? String(r.forID) : null,
        payment_method: str(r.cFormaPagamento), notes: str(r.cObservacoes ?? r.cObs, 1000),
      })), 'dealership_id,vehicle_external_id', errors)

    counts.sale_data = await upsertBatch(svc, 'sale_data',
      (rawTables['tbDadosVenda'] ?? []).filter(r => r.carID).map(r => ({
        dealership_id: D, vehicle_external_id: String(r.carID),
        vehicle_id: vehicleIdByExternal[String(r.carID)] ?? null,
        sale_date: parseDate(r.vData), mileage: r.vKM ? Math.round(parseNum(r.vKM)) : null,
        sale_price: r.vValorVenda ? parseNum(r.vValorVenda) : null,
        customer_external_id: r.cliID ? String(r.cliID) : null,
        customer_id: r.cliID ? (customerIdByExternal[String(r.cliID)] ?? null) : null,
        payment_method: str(r.vFormaPagamento), notes: str(r.vObservacoes ?? r.vObs, 1000),
      })), 'dealership_id,vehicle_external_id', errors)

    // ── Step 8: Expenses ──────────────────────────────────────────────────────

    const mappedExpenses = mdbData.expenseRows
      .map(r => mapExpenseRow(r, D, vehicleIdByExternal))
      .filter((r): r is Record<string, any> => r !== null)

    const withId = mappedExpenses.filter(e => e.external_id)
    const withoutId = mappedExpenses.filter(e => !e.external_id)
    counts.expenses = await upsertBatch(svc, 'expenses', withId, 'dealership_id,external_id', errors)
    if (withoutId.length > 0) {
      const { count } = await svc.from('expenses').select('id', { count: 'exact', head: true }).eq('dealership_id', D)
      if ((count ?? 0) === 0) counts.expenses = (counts.expenses ?? 0) + await insertBatch(svc, 'expenses', withoutId, errors)
    }

    // ── Step 9: Vehicle-linked tables ─────────────────────────────────────────

    counts.vehicle_fines = await upsertBatch(svc, 'vehicle_fines',
      (rawTables['tbVeiculoMulta'] ?? []).filter(r => r.mulID).map(r => ({
        dealership_id: D, external_id: String(r.mulID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        date: parseDate(r.mulData), description: str(r.mulDescri),
        amount: r.mulValor ? parseNum(r.mulValor) : null,
        issuing_agency: str(r.mulOrgao), infraction_code: str(r.mulCodigo),
        is_paid: !!r.mulPago, paid_date: parseDate(r.mulDataPagamento),
        notes: str(r.mulObservacoes ?? r.mulObs, 1000),
      })), 'dealership_id,external_id', errors)

    counts.vehicle_documents = await upsertBatch(svc, 'vehicle_documents',
      (rawTables['tbVeiculoDocumento'] ?? []).filter(r => r.docID).map(r => ({
        dealership_id: D, external_id: String(r.docID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        type: str(r.docTipo), number: str(r.docNumero),
        issue_date: parseDate(r.docData), expiry_date: parseDate(r.docValidade),
        file_url: str(r.docArquivo), notes: str(r.docObservacoes ?? r.docObs, 1000),
      })), 'dealership_id,external_id', errors)

    counts.vehicle_purchase_documents = await upsertBatch(svc, 'vehicle_purchase_documents',
      (rawTables['tbVeiculoDocumentoCompra'] ?? []).filter(r => r.dcoID).map(r => ({
        dealership_id: D, external_id: String(r.dcoID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        type: str(r.dcoTipo), number: str(r.dcoNumero), issue_date: parseDate(r.dcoData),
        amount: r.dcoValor ? parseNum(r.dcoValor) : null, file_url: str(r.dcoArquivo),
        notes: str(r.dcoObservacoes ?? r.dcoObs, 1000),
      })), 'dealership_id,external_id', errors)

    counts.vehicle_optionals = await upsertBatch(svc, 'vehicle_optionals',
      (rawTables['tbVeiculoOpcionais'] ?? []).filter(r => r.carID && r.voID).map(r => ({
        dealership_id: D, external_id: String(r.voID),
        vehicle_external_id: String(r.carID),
        vehicle_id: vehicleIdByExternal[String(r.carID)] ?? null,
        optional_external_id: r.opcID ? String(r.opcID) : null,
        name: str(r.voDescri) ?? str(r.opcDescri),
      })), 'dealership_id,external_id', errors)

    counts.vehicle_pendencies = await upsertBatch(svc, 'vehicle_pendencies',
      (rawTables['tbVeiculoPendencia'] ?? []).filter(r => r.vpnID).map(r => ({
        dealership_id: D, external_id: String(r.vpnID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        standard_pendency_external_id: r.ppnID ? String(r.ppnID) : null,
        description: str(r.vpnDescri), status: str(r.vpnStatus) ?? 'pending',
        date: parseDate(r.vpnData), amount: r.vpnValor ? parseNum(r.vpnValor) : null,
        resolved_date: parseDate(r.vpnDataResolucao ?? r.vpnDataFim),
        notes: str(r.vpnObservacoes ?? r.vpnObs, 1000),
      })), 'dealership_id,external_id', errors)

    counts.vehicle_delivery_protocols = await upsertBatch(svc, 'vehicle_delivery_protocols',
      (rawTables['tbVeiculoProtocoloEntrega'] ?? []).filter(r => r.proID).map(r => ({
        dealership_id: D, external_id: String(r.proID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        customer_external_id: r.cliID ? String(r.cliID) : null,
        customer_id: r.cliID ? (customerIdByExternal[String(r.cliID)] ?? null) : null,
        delivery_date: parseDate(r.proData), mileage: r.proKM ? Math.round(parseNum(r.proKM)) : null,
        fuel_level: str(r.proNivelCombustivel ?? r.proCombustivel),
        description: str(r.proDescri, 2000), signature_url: str(r.proAssinatura),
        notes: str(r.proObservacoes ?? r.proObs, 1000),
      })), 'dealership_id,external_id', errors)

    counts.vehicle_trades = await upsertBatch(svc, 'vehicle_trades',
      (rawTables['tbveiculoTroca'] ?? []).filter(r => r.trcID).map(r => ({
        dealership_id: D, external_id: String(r.trcID),
        incoming_vehicle_external_id: r.carID ? String(r.carID) : null,
        incoming_vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        outgoing_vehicle_external_id: r.carIDEntregue ? String(r.carIDEntregue) : null,
        outgoing_vehicle_id: r.carIDEntregue ? (vehicleIdByExternal[String(r.carIDEntregue)] ?? null) : null,
        customer_external_id: r.cliID ? String(r.cliID) : null,
        customer_id: r.cliID ? (customerIdByExternal[String(r.cliID)] ?? null) : null,
        trade_date: parseDate(r.trcData),
        trade_in_value: r.trcValorEntrada ? parseNum(r.trcValorEntrada) : null,
        difference_amount: r.trcDiferenca ? parseNum(r.trcDiferenca) : null,
        notes: str(r.trcObservacoes ?? r.trcObs, 1000),
      })), 'dealership_id,external_id', errors)

    counts.vehicle_apportionment = await upsertBatch(svc, 'vehicle_apportionment',
      (rawTables['tbRateioVeiculo'] ?? []).filter(r => r.ratID).map(r => ({
        dealership_id: D, external_id: String(r.ratID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        plan_account_external_id: r.plaID ? String(r.plaID) : null,
        amount: r.ratValor ? parseNum(r.ratValor) : null, date: parseDate(r.ratData),
        description: str(r.ratDescri, 1000),
      })), 'dealership_id,external_id', errors)

    counts.post_sale_expenses = await upsertBatch(svc, 'post_sale_expenses',
      (rawTables['tbDespesaPosVenda'] ?? []).filter(r => r.dpvID).map(r => ({
        dealership_id: D, external_id: String(r.dpvID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        description: str(r.dpvDescri), amount: r.dpvValor ? parseNum(r.dpvValor) : null,
        date: parseDate(r.dpvData), plan_account_external_id: r.plaID ? String(r.plaID) : null,
      })), 'dealership_id,external_id', errors)

    // ── Step 10: Financings & Insurances ──────────────────────────────────────

    counts.financings = await upsertBatch(svc, 'financings',
      (rawTables['tbFinanciamento'] ?? []).filter(r => r.finID).map(r => ({
        dealership_id: D, external_id: String(r.finID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        customer_external_id: r.cliID ? String(r.cliID) : null,
        customer_id: r.cliID ? (customerIdByExternal[String(r.cliID)] ?? null) : null,
        bank: str(r.finBanco), total_amount: r.finValor ? parseNum(r.finValor) : null,
        installments: r.finParcelas ? parseInt(String(r.finParcelas)) : null,
        interest_rate: r.finTaxa ? parseNum(r.finTaxa) : null,
        installment_amount: r.finValorParcela ? parseNum(r.finValorParcela) : null,
        down_payment: r.finEntrada ? parseNum(r.finEntrada) : null,
        start_date: parseDate(r.finData), contract_number: str(r.finContrato),
        notes: str(r.finObservacoes ?? r.finObs, 1000),
      })), 'dealership_id,external_id', errors)

    counts.insurances = await upsertBatch(svc, 'insurances',
      (rawTables['tbSeguro'] ?? []).filter(r => r.segID).map(r => ({
        dealership_id: D, external_id: String(r.segID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        customer_external_id: r.cliID ? String(r.cliID) : null,
        customer_id: r.cliID ? (customerIdByExternal[String(r.cliID)] ?? null) : null,
        insurer: str(r.segEmpresa), policy_number: str(r.segApolice),
        insured_value: r.segValor ? parseNum(r.segValor) : null,
        premium: r.segPremio ? parseNum(r.segPremio) : null,
        start_date: parseDate(r.segDataInicio), end_date: parseDate(r.segDataFim),
        coverage_type: str(r.segTipoCobertura), notes: str(r.segObservacoes ?? r.segObs, 1000),
      })), 'dealership_id,external_id', errors)

    // ── Step 11: Commissions ──────────────────────────────────────────────────

    counts.commissions = await upsertBatch(svc, 'commissions',
      (rawTables['tbComissao'] ?? []).filter(r => r.comID).map(r => ({
        dealership_id: D, external_id: String(r.comID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        employee_external_id: r.funID ? String(r.funID) : null,
        employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
        amount: r.comValor ? parseNum(r.comValor) : null,
        percent: r.comPercentual ? parseNum(r.comPercentual) : null,
        date: parseDate(r.comData), paid_date: parseDate(r.comDataPagamento),
        is_paid: !!r.comPago, notes: str(r.comObservacoes ?? r.comObs, 1000),
      })), 'dealership_id,external_id', errors)

    // ── Step 12: Orders & follow-ups ──────────────────────────────────────────

    counts.orders = await upsertBatch(svc, 'orders',
      (rawTables['tbPedidosClientes'] ?? []).filter(r => r.pedID).map(r => ({
        dealership_id: D, external_id: String(r.pedID),
        customer_external_id: r.cliID ? String(r.cliID) : null,
        customer_id: r.cliID ? (customerIdByExternal[String(r.cliID)] ?? null) : null,
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        employee_external_id: r.funID ? String(r.funID) : null,
        employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
        order_date: parseDate(r.pedData), amount: r.pedValor ? parseNum(r.pedValor) : null,
        status: str(r.pedStatus) ?? 'open', payment_method: str(r.pedFormaPagamento),
        down_payment: r.pedEntrada ? parseNum(r.pedEntrada) : null,
        notes: str(r.pedObservacoes ?? r.pedObs, 1000),
      })), 'dealership_id,external_id', errors)

    const { data: ordMap } = await svc.from('orders').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null)
    const orderIdByExternal: Record<string, string> = {}
    ;(ordMap ?? []).forEach((o: any) => { orderIdByExternal[o.external_id] = o.id })

    counts.order_followups = await upsertBatch(svc, 'order_followups',
      (rawTables['tbPedidosFollowUp'] ?? []).filter(r => r.fupID).map(r => ({
        dealership_id: D, external_id: String(r.fupID),
        order_external_id: r.pedID ? String(r.pedID) : null,
        order_id: r.pedID ? (orderIdByExternal[String(r.pedID)] ?? null) : null,
        employee_external_id: r.funID ? String(r.funID) : null,
        employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
        date: parseDate(r.fupData), description: str(r.fupDescri, 2000),
        status: str(r.fupStatus), next_contact: parseDate(r.fupProximoContato ?? r.fupDataRetorno),
      })), 'dealership_id,external_id', errors)

    // ── Step 13: NFe fiscal data ──────────────────────────────────────────────

    counts.nfe_ide = await upsertBatch(svc, 'nfe_ide',
      (rawTables['tbNFe ide'] ?? []).filter(r => r.nfeID).map(r => ({
        dealership_id: D, external_id: String(r.nfeID),
        access_key: str(r.nfeChave ?? r.chNFe),
        nfe_number: str(r.nNF ?? r.nfeNumero), series: str(r.serie ?? r.nfeSerie),
        model: str(r.mod ?? r.nfeModelo), issue_date: parseDate(r.dhEmi ?? r.nfeDataEmissao),
        nature_of_operation: str(r.natOp),
        operation_type: r.tpNF !== undefined ? parseInt(String(r.tpNF)) : null,
        total_value: r.vNF ? parseNum(r.vNF) : null, status: str(r.nfeStatus) ?? 'pending',
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
      })), 'dealership_id,external_id', errors)

    const { data: nfeMap } = await svc.from('nfe_ide').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null)
    const nfeIdByExternal: Record<string, string> = {}
    ;(nfeMap ?? []).forEach((n: any) => { nfeIdByExternal[n.external_id] = n.id })

    counts.nfe_emit = await upsertBatch(svc, 'nfe_emit',
      (rawTables['tbNFe emit'] ?? []).filter(r => r.nfeID).map(r => ({
        dealership_id: D, external_id: str(r.nfeEmitID) ?? `emit-${r.nfeID}`,
        nfe_external_id: String(r.nfeID), nfe_id: nfeIdByExternal[String(r.nfeID)] ?? null,
        cnpj: str(r.cnpj ?? r.CNPJ), name: str(r.xNome), trade_name: str(r.xFant),
        address: str(r.xLgr ?? r.endereco), city: str(r.xMun ?? r.cidade),
        state: str(r.UF ?? r.estado, 2), zip_code: str(r.CEP),
        phone: str(r.fone ?? r.telefone), ie: str(r.IE),
      })), 'dealership_id,external_id', errors)

    counts.nfe_dest = await upsertBatch(svc, 'nfe_dest',
      (rawTables['tbNFe dest'] ?? []).filter(r => r.nfeID).map(r => ({
        dealership_id: D, external_id: str(r.nfeDestID) ?? `dest-${r.nfeID}`,
        nfe_external_id: String(r.nfeID), nfe_id: nfeIdByExternal[String(r.nfeID)] ?? null,
        cpf_cnpj: str(r.CPF ?? r.CNPJ ?? r.cpfCNPJ), name: str(r.xNome),
        address: str(r.xLgr ?? r.endereco), city: str(r.xMun ?? r.cidade),
        state: str(r.UF ?? r.estado, 2), zip_code: str(r.CEP),
        phone: str(r.fone ?? r.telefone), email: str(r.email), ie: str(r.IE),
      })), 'dealership_id,external_id', errors)

    counts.nfe_prod = await upsertBatch(svc, 'nfe_prod',
      (rawTables['tbNFe prod'] ?? []).filter(r => r.nfeProdID).map(r => ({
        dealership_id: D, external_id: String(r.nfeProdID),
        nfe_external_id: r.nfeID ? String(r.nfeID) : null,
        nfe_id: r.nfeID ? (nfeIdByExternal[String(r.nfeID)] ?? null) : null,
        product_code: str(r.cProd), ean: str(r.cEAN), description: str(r.xProd),
        ncm_code: str(r.NCM), cfop: str(r.CFOP), unit: str(r.uCom),
        quantity: r.qCom ? parseNum(r.qCom) : null,
        unit_value: r.vUnCom ? parseNum(r.vUnCom) : null,
        total_value: r.vProd ? parseNum(r.vProd) : null,
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
      })), 'dealership_id,external_id', errors)

    try { await svc.rpc('refresh_days_in_stock', { d_id: D }) } catch { /* optional */ }

  } else {
    // CSV / JSON legacy path (vehicles only)
    let vehicleRawRows: Record<string, any>[] = []
    try {
      vehicleRawRows = filename.toLowerCase().endsWith('.json')
        ? JSON.parse(buffer.toString('utf-8'))
        : parseCSV(buffer.toString('utf-8'))
    } catch (e: any) { errors.push(`Parse error: ${e.message}`) }

    if (vehicleRawRows.length > 0) {
      const mapped = vehicleRawRows
        .map((r: any) => mapVehicleRow({ ...r, _brand: null, _fuel: null, _purchase: null, _sale: null }, D))
        .filter((r): r is Record<string, any> => r !== null)
      counts.vehicles = await upsertBatch(svc, 'vehicles', mapped, 'dealership_id,external_id', errors)
    }
  }

  const totalImported = Object.values(counts).reduce((a, b) => a + b, 0)

  await svc
    .from('imports')
    .update({
      status: errors.length > 0 && (counts.vehicles ?? 0) === 0 ? 'error' : 'complete',
      records_imported: totalImported,
      errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', (importRecord as any).id)

  // Clean up temporary storage file after processing
  if (storagePath) {
    try { await svc.storage.from('imports').remove([storagePath]) } catch { /* non-critical */ }
  }

  return NextResponse.json({
    import_id: (importRecord as any).id,
    // Legacy fields the import UI reads
    vehicles_imported: counts.vehicles ?? 0,
    expenses_imported: counts.expenses ?? 0,
    records_imported: totalImported,
    total_rows_parsed: mdbData?.vehicleRows.length ?? 0,
    vehicles_mapped: counts.vehicles ?? 0,
    // Full breakdown
    counts,
    total_imported: totalImported,
    errors,
  })
}
