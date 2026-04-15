import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { createClient } from '@supabase/supabase-js'
import MDBReader from 'mdb-reader'

// ─── Supabase service client (lazy — env vars not available at module load time) ─

let _svc: any = null
function getSvc(): any {
  if (!_svc) {
    _svc = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  }
  return _svc
}

// ─── Parse helpers ───────────────────────────────────────────────────────────

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

// ─── MDB parser ──────────────────────────────────────────────────────────────

function parseMDB(buffer: Buffer) {
  const reader = new MDBReader(buffer)
  const tableNames = reader.getTableNames()

  const tableCache: Record<string, Record<string, any>[]> = {}
  const t = (name: string): Record<string, any>[] => {
    if (!(name in tableCache)) {
      try { tableCache[name] = reader.getTable(name).getData() as Record<string, any>[] } catch { tableCache[name] = [] }
    }
    return tableCache[name]
  }

  const brandMap: Record<number, string> = {}
  t('tbFabricantes').forEach((r: any) => { if (r.fabID && r.fabNome) brandMap[r.fabID] = String(r.fabNome) })

  const fuelMap: Record<number, string> = {}
  t('tbCombustivel').forEach((r: any) => { if (r.gazID && r.gazDescri) fuelMap[r.gazID] = String(r.gazDescri) })

  const planMap: Record<number, string> = {}
  t('tbPlanoContas').forEach((r: any) => { if (r.plaID && r.PlaNome) planMap[r.plaID] = String(r.PlaNome) })

  const purchaseMap: Record<number, { date: any; km: any; valor: any }> = {}
  t('tbDadosCompra').forEach((r: any) => { if (r.carID) purchaseMap[r.carID] = { date: r.cData, km: r.cKM, valor: r.cValor } })

  const saleMap: Record<number, { date: any; km: any; valor: any; cliID: any }> = {}
  t('tbDadosVenda').forEach((r: any) => { if (r.carID) saleMap[r.carID] = { date: r.vData, km: r.vKM, valor: r.vValorVenda, cliID: r.cliID } })

  const vehicleRows = t('tbVeiculo').map((r: any) => ({
    carID: r.carID, carPlaca: r.carPlaca, carDescri: r.carDescri,
    carAno: r.carAno, carAnoModelo: r.carAnoModelo,
    carValorCompra: r.carValorCompra, carValorTabela: r.carValorTabela,
    carChassi: r.carChassi, carRenavan: r.carRenavan, carCor: r.carCor, carMotor: r.carMotor,
    _brand: brandMap[r.fabID] ?? null,
    _fuel: fuelMap[r.gazID] ?? null,
    _purchase: purchaseMap[r.carID] ?? null,
    _sale: saleMap[r.carID] ?? null,
  }))
  delete tableCache['tbVeiculo']

  const EXCLUDE_PLANS = ['VEICULO', 'VEÍCULO', 'COMPRA', 'VENDA']
  const expenseRows = t('tbMovimento')
    .filter((r: any) => {
      if (!r.carReferencia || r.carReferencia === 0) return false
      if (parseNum(r.movValor) <= 0) return false
      const plan = (planMap[r.plaID] ?? '').toUpperCase()
      return !EXCLUDE_PLANS.some(ex => plan.includes(ex))
    })
    .map((r: any) => ({
      movID: r.movID, movValor: r.movValor, carReferencia: r.carReferencia,
      movData: r.movData, movDescri: r.movDescri, _planName: planMap[r.plaID] ?? 'Outros',
    }))
  delete tableCache['tbMovimento']

  const rawTables = new Proxy<Record<string, Record<string, any>[]>>({}, {
    get: (_, name) => typeof name === 'string' ? t(name) : undefined,
  })

  return { vehicleRows, expenseRows, rawTables, tableNames }
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapVehicleRow(row: Record<string, any>, D: string): Record<string, any> | null {
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
    dealership_id: D, external_id: String(carId), plate,
    chassis: str(row.carChassi), renavam: str(row.carRenavan),
    brand: String(brand).trim(), model, version: null,
    year_fab: yearFab, year_model: yearModel, color: str(row.carCor),
    mileage, fuel: row._fuel ?? null, transmission: null,
    purchase_price: purchasePrice, sale_price: salePrice,
    purchase_date: purchaseDate, sale_date: saleDate, status,
    source: 'import', notes: str(row.carMotor), photos: [],
  }
}

function mapExpenseRow(
  row: Record<string, any>,
  D: string,
  vehicleIdByExternal: Record<string, string>
): Record<string, any> | null {
  const amount = parseNum(row.movValor)
  if (!amount) return null
  return {
    dealership_id: D, external_id: str(row.movID),
    vehicle_id: row.carReferencia ? (vehicleIdByExternal[String(row.carReferencia)] ?? null) : null,
    category: String(row._planName ?? 'Outros').toUpperCase().trim(),
    description: str(row.movDescri), amount,
    date: parseDate(row.movData) ?? new Date().toISOString().split('T')[0],
    vendor_name: null, payment_method: null,
  }
}

// ─── Batch helpers ────────────────────────────────────────────────────────────

async function upsertBatch(
  table: string, rows: Record<string, any>[], conflictKey: string, errors: string[]
): Promise<number> {
  if (!rows.length) return 0
  const BATCH_SIZE = 1000
  const CONCURRENCY = 3
  const batches: Record<string, any>[][] = []
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE))
  let count = 0
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY)
    const results = await Promise.all(group.map(async (chunk, j) => {
      const { error } = await getSvc().from(table).upsert(chunk, { onConflict: conflictKey, ignoreDuplicates: false })
      if (error) { errors.push(`${table} batch ${i + j + 1}: ${error.message}`); return 0 }
      return chunk.length
    }))
    count += results.reduce((a, b) => a + b, 0)
  }
  return count
}

async function insertBatch(
  table: string, rows: Record<string, any>[], errors: string[]
): Promise<number> {
  if (!rows.length) return 0
  let count = 0
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await getSvc().from(table).insert(chunk)
    if (error) errors.push(`${table} insert batch ${Math.floor(i / 100) + 1}: ${error.message}`)
    else count += chunk.length
  }
  return count
}

// ─── CORS helper ─────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim())
  const allowedOrigin = allowed.includes(origin) ? origin : (allowed[0] ?? '*')
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename',
    'Access-Control-Max-Age': '86400',
  }
}

function json(status: number, body: any, headers: Record<string, string>): HttpResponseInit {
  return {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function importMdbHandler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? ''
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') return { status: 204, headers: cors }

  try {

  // Auth: verify Supabase JWT
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(401, { error: 'Unauthorized' }, cors)

  const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!userRes.ok) return json(401, { error: 'Invalid token' }, cors)
  const user = await userRes.json() as { id: string }

  // Get dealership
  const { data: profile } = await getSvc().from('users').select('dealership_id').eq('id', user.id).single()
  if (!profile?.dealership_id) return json(400, { error: 'No dealership' }, cors)
  const D: string = profile.dealership_id

  // Read the raw MDB binary
  const filename = decodeURIComponent(req.headers.get('x-filename') ?? 'upload.mdb')
  const fileSize = parseInt(req.headers.get('content-length') ?? '0')

  let buffer: Buffer
  try {
    const ab = await req.arrayBuffer()
    buffer = Buffer.from(ab)
  } catch (e: any) {
    return json(400, { error: `Failed to read body: ${e.message}` }, cors)
  }

  ctx.log(`Processing MDB import: ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)} MB) for dealership ${D}`)

  // Create import record
  const { data: importRecord, error: importErr } = await getSvc()
    .from('imports')
    .insert({
      dealership_id: D,
      filename,
      file_type: 'application/msaccess',
      file_size: fileSize || buffer.length,
      status: 'processing',
      records_imported: 0,
      errors: [],
      created_by: user.id,
    })
    .select()
    .single()
  if (importErr) return json(500, { error: importErr.message }, cors)
  const importId = (importRecord as any).id

  const errors: string[] = []
  const counts: Record<string, number> = {}

  // Parse MDB
  let mdbData: ReturnType<typeof parseMDB>
  try {
    mdbData = parseMDB(buffer)
    ;(buffer as any) = null // free memory
  } catch (e: any) {
    errors.push(`Parse error: ${e.message}`)
    await getSvc().from('imports').update({ status: 'error', errors, completed_at: new Date().toISOString() }).eq('id', importId)
    return json(400, { error: errors[0] }, cors)
  }

  ctx.log(`MDB parsed. Tables: ${mdbData.tableNames.length}, Vehicles: ${mdbData.vehicleRows.length}, Expenses: ${mdbData.expenseRows.length}`)

  const { rawTables } = mdbData

  // ── Phase A: Reference tables (parallel) ────────────────────────────────

  const step1Results = await Promise.all([
    upsertBatch('manufacturers',
      (rawTables['tbFabricantes'] ?? []).filter((r: any) => r.fabID && r.fabNome).map((r: any) => ({
        dealership_id: D, external_id: String(r.fabID), name: str(r.fabNome)!,
      })), 'dealership_id,external_id', errors),
    upsertBatch('fuel_types',
      (rawTables['tbCombustivel'] ?? []).filter((r: any) => r.gazID && r.gazDescri).map((r: any) => ({
        dealership_id: D, external_id: String(r.gazID), name: str(r.gazDescri)!,
      })), 'dealership_id,external_id', errors),
    upsertBatch('plan_accounts',
      (rawTables['tbPlanoContas'] ?? []).filter((r: any) => r.plaID && r.PlaNome).map((r: any) => ({
        dealership_id: D, external_id: String(r.plaID), name: str(r.PlaNome)!,
        category: str(r.plaCategoria), type: str(r.plaTipo),
      })), 'dealership_id,external_id', errors),
    upsertBatch('customer_origins',
      (rawTables['tbOrigemCliente'] ?? []).filter((r: any) => r.oriID).map((r: any) => ({
        dealership_id: D, external_id: String(r.oriID),
        name: str(r.oriDescri) ?? str(r.oriNome) ?? 'Sem nome',
      })), 'dealership_id,external_id', errors),
    upsertBatch('cancellation_reasons',
      (rawTables['tbMotivoCancelamento'] ?? []).filter((r: any) => r.mcanID).map((r: any) => ({
        dealership_id: D, external_id: String(r.mcanID),
        description: str(r.mcanDescri) ?? str(r.mcanNome) ?? 'Sem descrição',
      })), 'dealership_id,external_id', errors),
    upsertBatch('standard_pendencies',
      (rawTables['tbPendenciaPadrao'] ?? []).filter((r: any) => r.ppnID).map((r: any) => ({
        dealership_id: D, external_id: String(r.ppnID),
        description: str(r.ppnDescri) ?? str(r.ppnNome) ?? 'Sem descrição',
        category: str(r.ppnCategoria),
      })), 'dealership_id,external_id', errors),
    upsertBatch('standard_expenses',
      (rawTables['tbDespesaPadrao'] ?? []).filter((r: any) => r.dpaID).map((r: any) => ({
        dealership_id: D, external_id: String(r.dpaID),
        description: str(r.dpaDescri) ?? str(r.dpaNome) ?? 'Sem descrição',
        plan_account_external_id: r.plaID ? String(r.plaID) : null,
        amount: r.dpaValor ? parseNum(r.dpaValor) : null,
      })), 'dealership_id,external_id', errors),
    upsertBatch('optionals',
      (rawTables['tbOpcionais'] ?? []).filter((r: any) => r.opcID).map((r: any) => ({
        dealership_id: D, external_id: String(r.opcID),
        name: str(r.opcDescri) ?? str(r.opcNome) ?? 'Sem nome',
        category: str(r.opcCategoria),
      })), 'dealership_id,external_id', errors),
    upsertBatch('general_enumerations',
      (rawTables['tbEnumGeral'] ?? []).filter((r: any) => r.enuID).map((r: any) => ({
        dealership_id: D, external_id: String(r.enuID),
        type: str(r.enuTipo) ?? 'GERAL', code: str(r.enuCodigo),
        description: str(r.enuDescri) ?? str(r.enuNome) ?? 'Sem descrição',
      })), 'dealership_id,external_id', errors),
    upsertBatch('text_configurations',
      (rawTables['tbCadastroTextos'] ?? []).filter((r: any) => r.texID).map((r: any) => ({
        dealership_id: D, external_id: String(r.texID),
        key: str(r.texDescri) ?? str(r.texNome) ?? String(r.texID),
        content: str(r.texConteudo, 10000), type: str(r.texTipo),
      })), 'dealership_id,external_id', errors),
    upsertBatch('ncm',
      (rawTables['tbNCM'] ?? []).filter((r: any) => r.ncmID).map((r: any) => ({
        dealership_id: D, external_id: String(r.ncmID),
        code: str(r.ncmCodigo) ?? String(r.ncmID), description: str(r.ncmDescri),
      })), 'dealership_id,external_id', errors),
    upsertBatch('nature_of_operation',
      (rawTables['tbNaturezaOp'] ?? []).filter((r: any) => r.natID).map((r: any) => ({
        dealership_id: D, external_id: String(r.natID),
        description: str(r.natDescri) ?? str(r.natNome) ?? 'Sem descrição', cfop: str(r.natCFOP),
      })), 'dealership_id,external_id', errors),
    upsertBatch('banks',
      (rawTables['tbBancosCadastro'] ?? []).filter((r: any) => r.bancID).map((r: any) => ({
        dealership_id: D, external_id: String(r.bancID),
        name: str(r.bancNome) ?? str(r.bancDescri) ?? 'Sem nome',
        code: str(r.bancCodigo), agency: str(r.bancAgencia), account: str(r.bancConta),
      })), 'dealership_id,external_id', errors),
  ])
  ;[
    counts.manufacturers, counts.fuel_types, counts.plan_accounts,
    counts.customer_origins, counts.cancellation_reasons, counts.standard_pendencies,
    counts.standard_expenses, counts.optionals, counts.general_enumerations,
    counts.text_configurations, counts.ncm, counts.nature_of_operation, counts.banks,
  ] = step1Results
  ctx.log(`Phase A done. Ref tables: ${step1Results.reduce((a, b) => a + b, 0)}`)

  // ── Phase B: Main entities (parallel) ───────────────────────────────────

  const mappedVehicles = mdbData.vehicleRows
    .map(r => mapVehicleRow(r, D))
    .filter((r): r is Record<string, any> => r !== null)
  mdbData.vehicleRows = []

  ;[counts.customers, counts.vendors, counts.employees, counts.bank_accounts, counts.vehicles] =
    await Promise.all([
      upsertBatch('customers',
        (rawTables['tbCliente'] ?? []).filter((r: any) => r.cliID).map((r: any) => ({
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
        })), 'dealership_id,external_id', errors),
      upsertBatch('vendors',
        (rawTables['tbFornecedor'] ?? []).filter((r: any) => r.forID).map((r: any) => ({
          dealership_id: D, external_id: String(r.forID),
          name: str(r.forNome) ?? str(r.forRazaoSocial) ?? 'Sem nome',
          category: str(r.forCategoria), phone: str(r.forTelefone), email: str(r.forEmail),
          cnpj: str(r.forCNPJ), address: str(r.forEndereco ?? r.forLogradouro),
          neighborhood: str(r.forBairro), city: str(r.forCidade),
          state: str(r.forEstado, 2), zip_code: str(r.forCEP),
          notes: str(r.forObservacoes ?? r.forObs, 1000),
        })), 'dealership_id,external_id', errors),
      upsertBatch('employees',
        (rawTables['tbFuncionario'] ?? []).filter((r: any) => r.funID).map((r: any) => ({
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
        })), 'dealership_id,external_id', errors),
      upsertBatch('bank_accounts',
        (rawTables['tbContasCorrentes'] ?? []).filter((r: any) => r.ctaID).map((r: any) => ({
          dealership_id: D, external_id: String(r.ctaID),
          name: str(r.ctaNome) ?? str(r.ctaDescri) ?? String(r.ctaID),
          bank_external_id: r.bancID ? String(r.bancID) : null,
          agency: str(r.ctaAgencia), account: str(r.ctaConta),
          balance: r.ctaSaldo ? parseNum(r.ctaSaldo) : 0,
        })), 'dealership_id,external_id', errors),
      upsertBatch('vehicles', mappedVehicles, 'dealership_id,external_id', errors),
    ])
  ctx.log(`Phase B done. Vehicles: ${counts.vehicles}, Customers: ${counts.customers}`)

  // ── Phase C: UUID maps ──────────────────────────────────────────────────

  const [{ data: custMap }, { data: empMap }, { data: vehMap }] = await Promise.all([
    getSvc().from('customers').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null),
    getSvc().from('employees').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null),
    getSvc().from('vehicles').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null),
  ])
  const customerIdByExternal: Record<string, string> = {}
  ;(custMap ?? []).forEach((c: any) => { customerIdByExternal[c.external_id] = c.id })
  const employeeIdByExternal: Record<string, string> = {}
  ;(empMap ?? []).forEach((e: any) => { employeeIdByExternal[e.external_id] = e.id })
  const vehicleIdByExternal: Record<string, string> = {}
  ;(vehMap ?? []).forEach((v: any) => { vehicleIdByExternal[v.external_id] = v.id })

  // ── Phase D: Dependent tables (parallel with sequential inner chains) ────

  const [
    phD_custCompl, phD_custComm, phD_custAsset,
    phD_empSal, phD_commStd,
    phD_purchase, phD_sale,
    phD_exp,
    phD_fines, phD_docs, phD_purchDocs, phD_opts, phD_pend, phD_deliv, phD_trades, phD_apportion, phD_postSale,
    phD_fin, phD_ins,
    phD_comm,
    phD_orders,
    phD_nfe,
  ] = await Promise.all([
    // Customer sub-tables
    (async () => {
      const rows = (rawTables['tbClienteComplemento'] ?? []).filter((r: any) => r.cliID)
      if (!rows.length) return 0
      await getSvc().from('customer_complements').delete().eq('dealership_id', D)
      return insertBatch('customer_complements', rows.map((r: any) => ({
        dealership_id: D, customer_external_id: String(r.cliID),
        customer_id: customerIdByExternal[String(r.cliID)] ?? null,
        father_name: str(r.cliPai), mother_name: str(r.cliMae),
        spouse_name: str(r.cliConjuge ?? r.cliEsposo), spouse_cpf: str(r.cliCPFConjuge),
        monthly_income: r.cliRenda ? parseNum(r.cliRenda) : null,
        profession: str(r.cliProfissao), employer: str(r.cliEmpresa),
        employer_phone: str(r.cliTelEmpresa), employer_address: str(r.cliEndEmpresa),
        employer_city: str(r.cliCidEmpresa),
      })), errors)
    })(),
    (async () => {
      const rows = (rawTables['tbClienteDadosComerciais'] ?? []).filter((r: any) => r.cliID)
      if (!rows.length) return 0
      await getSvc().from('customer_commercial_data').delete().eq('dealership_id', D)
      return insertBatch('customer_commercial_data', rows.map((r: any) => ({
        dealership_id: D, customer_external_id: String(r.cliID),
        customer_id: customerIdByExternal[String(r.cliID)] ?? null,
        company_name: str(r.cliRazaoSocial ?? r.cliEmpresa), cnpj: str(r.cliCNPJ),
        activity: str(r.cliAtividade), monthly_revenue: r.cliFaturamento ? parseNum(r.cliFaturamento) : null,
        address: str(r.cliEndereco), city: str(r.cliCidade), state: str(r.cliEstado, 2), phone: str(r.cliTelefone),
      })), errors)
    })(),
    (async () => {
      const rows = (rawTables['tbClienteReferenciasBens'] ?? []).filter((r: any) => r.cliID)
      if (!rows.length) return 0
      await getSvc().from('customer_asset_references').delete().eq('dealership_id', D)
      return insertBatch('customer_asset_references', rows.map((r: any) => ({
        dealership_id: D, external_id: r.refID ? String(r.refID) : null,
        customer_external_id: String(r.cliID), customer_id: customerIdByExternal[String(r.cliID)] ?? null,
        type: str(r.refTipo), description: str(r.refDescri),
        value: r.refValor ? parseNum(r.refValor) : null,
        financing_bank: str(r.refBanco), monthly_payment: r.refParcela ? parseNum(r.refParcela) : null,
      })), errors)
    })(),
    // Employee sub-tables
    upsertBatch('employee_salaries',
      (rawTables['tbfuncionarioSalario'] ?? []).filter((r: any) => r.salID).map((r: any) => ({
        dealership_id: D, external_id: String(r.salID),
        employee_external_id: r.funID ? String(r.funID) : null,
        employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
        date: parseDate(r.salData), amount: r.salValor ? parseNum(r.salValor) : null,
        type: str(r.salTipo) ?? str(r.salDescri), description: str(r.salDescri ?? r.salObservacoes),
      })), 'dealership_id,external_id', errors),
    upsertBatch('commission_standards',
      (rawTables['tbComissaoPadrao'] ?? []).filter((r: any) => r.cpaID).map((r: any) => ({
        dealership_id: D, external_id: String(r.cpaID),
        employee_external_id: r.funID ? String(r.funID) : null,
        employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
        percent: r.cpaPercentual ? parseNum(r.cpaPercentual) : null,
        min_value: r.cpaValorMin ? parseNum(r.cpaValorMin) : null,
        max_value: r.cpaValorMax ? parseNum(r.cpaValorMax) : null, type: str(r.cpaTipo),
      })), 'dealership_id,external_id', errors),
    // Purchase & sale data
    upsertBatch('purchase_data',
      (rawTables['tbDadosCompra'] ?? []).filter((r: any) => r.carID).map((r: any) => ({
        dealership_id: D, vehicle_external_id: String(r.carID),
        vehicle_id: vehicleIdByExternal[String(r.carID)] ?? null,
        purchase_date: parseDate(r.cData), mileage: r.cKM ? Math.round(parseNum(r.cKM)) : null,
        purchase_price: r.cValor ? parseNum(r.cValor) : null,
        supplier_external_id: r.forID ? String(r.forID) : null,
        payment_method: str(r.cFormaPagamento), notes: str(r.cObservacoes ?? r.cObs, 1000),
      })), 'dealership_id,vehicle_external_id', errors),
    upsertBatch('sale_data',
      (rawTables['tbDadosVenda'] ?? []).filter((r: any) => r.carID).map((r: any) => ({
        dealership_id: D, vehicle_external_id: String(r.carID),
        vehicle_id: vehicleIdByExternal[String(r.carID)] ?? null,
        sale_date: parseDate(r.vData), mileage: r.vKM ? Math.round(parseNum(r.vKM)) : null,
        sale_price: r.vValorVenda ? parseNum(r.vValorVenda) : null,
        customer_external_id: r.cliID ? String(r.cliID) : null,
        customer_id: r.cliID ? (customerIdByExternal[String(r.cliID)] ?? null) : null,
        payment_method: str(r.vFormaPagamento), notes: str(r.vObservacoes ?? r.vObs, 1000),
      })), 'dealership_id,vehicle_external_id', errors),
    // Expenses
    (async () => {
      const mappedExpenses = mdbData.expenseRows
        .map(r => mapExpenseRow(r, D, vehicleIdByExternal))
        .filter((r): r is Record<string, any> => r !== null)
      mdbData.expenseRows = []
      const withId = mappedExpenses.filter(e => e.external_id)
      const withoutId = mappedExpenses.filter(e => !e.external_id)
      let expCount = await upsertBatch('expenses', withId, 'dealership_id,external_id', errors)
      if (withoutId.length > 0) {
        const { count } = await getSvc().from('expenses').select('id', { count: 'exact', head: true }).eq('dealership_id', D)
        if ((count ?? 0) === 0) expCount += await insertBatch('expenses', withoutId, errors)
      }
      return expCount
    })(),
    // Vehicle-linked tables
    upsertBatch('vehicle_fines',
      (rawTables['tbVeiculoMulta'] ?? []).filter((r: any) => r.mulID).map((r: any) => ({
        dealership_id: D, external_id: String(r.mulID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        date: parseDate(r.mulData), description: str(r.mulDescri),
        amount: r.mulValor ? parseNum(r.mulValor) : null,
        issuing_agency: str(r.mulOrgao), infraction_code: str(r.mulCodigo),
        is_paid: !!r.mulPago, paid_date: parseDate(r.mulDataPagamento),
        notes: str(r.mulObservacoes ?? r.mulObs, 1000),
      })), 'dealership_id,external_id', errors),
    upsertBatch('vehicle_documents',
      (rawTables['tbVeiculoDocumento'] ?? []).filter((r: any) => r.docID).map((r: any) => ({
        dealership_id: D, external_id: String(r.docID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        type: str(r.docTipo), number: str(r.docNumero),
        issue_date: parseDate(r.docData), expiry_date: parseDate(r.docValidade),
        file_url: str(r.docArquivo), notes: str(r.docObservacoes ?? r.docObs, 1000),
      })), 'dealership_id,external_id', errors),
    upsertBatch('vehicle_purchase_documents',
      (rawTables['tbVeiculoDocumentoCompra'] ?? []).filter((r: any) => r.dcoID).map((r: any) => ({
        dealership_id: D, external_id: String(r.dcoID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        type: str(r.dcoTipo), number: str(r.dcoNumero), issue_date: parseDate(r.dcoData),
        amount: r.dcoValor ? parseNum(r.dcoValor) : null, file_url: str(r.dcoArquivo),
        notes: str(r.dcoObservacoes ?? r.dcoObs, 1000),
      })), 'dealership_id,external_id', errors),
    upsertBatch('vehicle_optionals',
      (rawTables['tbVeiculoOpcionais'] ?? []).filter((r: any) => r.carID && r.voID).map((r: any) => ({
        dealership_id: D, external_id: String(r.voID),
        vehicle_external_id: String(r.carID),
        vehicle_id: vehicleIdByExternal[String(r.carID)] ?? null,
        optional_external_id: r.opcID ? String(r.opcID) : null,
        name: str(r.voDescri) ?? str(r.opcDescri),
      })), 'dealership_id,external_id', errors),
    upsertBatch('vehicle_pendencies',
      (rawTables['tbVeiculoPendencia'] ?? []).filter((r: any) => r.vpnID).map((r: any) => ({
        dealership_id: D, external_id: String(r.vpnID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        standard_pendency_external_id: r.ppnID ? String(r.ppnID) : null,
        description: str(r.vpnDescri), status: str(r.vpnStatus) ?? 'pending',
        date: parseDate(r.vpnData), amount: r.vpnValor ? parseNum(r.vpnValor) : null,
        resolved_date: parseDate(r.vpnDataResolucao ?? r.vpnDataFim),
        notes: str(r.vpnObservacoes ?? r.vpnObs, 1000),
      })), 'dealership_id,external_id', errors),
    upsertBatch('vehicle_delivery_protocols',
      (rawTables['tbVeiculoProtocoloEntrega'] ?? []).filter((r: any) => r.proID).map((r: any) => ({
        dealership_id: D, external_id: String(r.proID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        customer_external_id: r.cliID ? String(r.cliID) : null,
        customer_id: r.cliID ? (customerIdByExternal[String(r.cliID)] ?? null) : null,
        delivery_date: parseDate(r.proData), mileage: r.proKM ? Math.round(parseNum(r.proKM)) : null,
        fuel_level: str(r.proNivelCombustivel ?? r.proCombustivel),
        description: str(r.proDescri, 2000), signature_url: str(r.proAssinatura),
        notes: str(r.proObservacoes ?? r.proObs, 1000),
      })), 'dealership_id,external_id', errors),
    upsertBatch('vehicle_trades',
      (rawTables['tbveiculoTroca'] ?? []).filter((r: any) => r.trcID).map((r: any) => ({
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
      })), 'dealership_id,external_id', errors),
    upsertBatch('vehicle_apportionment',
      (rawTables['tbRateioVeiculo'] ?? []).filter((r: any) => r.ratID).map((r: any) => ({
        dealership_id: D, external_id: String(r.ratID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        plan_account_external_id: r.plaID ? String(r.plaID) : null,
        amount: r.ratValor ? parseNum(r.ratValor) : null, date: parseDate(r.ratData),
        description: str(r.ratDescri, 1000),
      })), 'dealership_id,external_id', errors),
    upsertBatch('post_sale_expenses',
      (rawTables['tbDespesaPosVenda'] ?? []).filter((r: any) => r.dpvID).map((r: any) => ({
        dealership_id: D, external_id: String(r.dpvID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        description: str(r.dpvDescri), amount: r.dpvValor ? parseNum(r.dpvValor) : null,
        date: parseDate(r.dpvData), plan_account_external_id: r.plaID ? String(r.plaID) : null,
      })), 'dealership_id,external_id', errors),
    upsertBatch('financings',
      (rawTables['tbFinanciamento'] ?? []).filter((r: any) => r.finID).map((r: any) => ({
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
      })), 'dealership_id,external_id', errors),
    upsertBatch('insurances',
      (rawTables['tbSeguro'] ?? []).filter((r: any) => r.segID).map((r: any) => ({
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
      })), 'dealership_id,external_id', errors),
    upsertBatch('commissions',
      (rawTables['tbComissao'] ?? []).filter((r: any) => r.comID).map((r: any) => ({
        dealership_id: D, external_id: String(r.comID),
        vehicle_external_id: r.carID ? String(r.carID) : null,
        vehicle_id: r.carID ? (vehicleIdByExternal[String(r.carID)] ?? null) : null,
        employee_external_id: r.funID ? String(r.funID) : null,
        employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
        amount: r.comValor ? parseNum(r.comValor) : null,
        percent: r.comPercentual ? parseNum(r.comPercentual) : null,
        date: parseDate(r.comData), paid_date: parseDate(r.comDataPagamento),
        is_paid: !!r.comPago, notes: str(r.comObservacoes ?? r.comObs, 1000),
      })), 'dealership_id,external_id', errors),
    // Orders → followups (sequential inner chain)
    (async () => {
      const ordersCount = await upsertBatch('orders',
        (rawTables['tbPedidosClientes'] ?? []).filter((r: any) => r.pedID).map((r: any) => ({
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
      const { data: ordMap } = await getSvc().from('orders').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null)
      const orderIdByExternal: Record<string, string> = {}
      ;(ordMap ?? []).forEach((o: any) => { orderIdByExternal[o.external_id] = o.id })
      const followupsCount = await upsertBatch('order_followups',
        (rawTables['tbPedidosFollowUp'] ?? []).filter((r: any) => r.fupID).map((r: any) => ({
          dealership_id: D, external_id: String(r.fupID),
          order_external_id: r.pedID ? String(r.pedID) : null,
          order_id: r.pedID ? (orderIdByExternal[String(r.pedID)] ?? null) : null,
          employee_external_id: r.funID ? String(r.funID) : null,
          employee_id: r.funID ? (employeeIdByExternal[String(r.funID)] ?? null) : null,
          date: parseDate(r.fupData), description: str(r.fupDescri, 2000),
          status: str(r.fupStatus), next_contact: parseDate(r.fupProximoContato ?? r.fupDataRetorno),
        })), 'dealership_id,external_id', errors)
      return { orders: ordersCount, order_followups: followupsCount }
    })(),
    // NFe → emit/dest/prod (sequential inner chain)
    (async () => {
      const nfeCount = await upsertBatch('nfe_ide',
        (rawTables['tbNFe ide'] ?? []).filter((r: any) => r.nfeID).map((r: any) => ({
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
      const { data: nfeMap } = await getSvc().from('nfe_ide').select('id, external_id').eq('dealership_id', D).not('external_id', 'is', null)
      const nfeIdByExternal: Record<string, string> = {}
      ;(nfeMap ?? []).forEach((n: any) => { nfeIdByExternal[n.external_id] = n.id })
      const [emitCount, destCount, prodCount] = await Promise.all([
        upsertBatch('nfe_emit',
          (rawTables['tbNFe emit'] ?? []).filter((r: any) => r.nfeID).map((r: any) => ({
            dealership_id: D, external_id: str(r.nfeEmitID) ?? `emit-${r.nfeID}`,
            nfe_external_id: String(r.nfeID), nfe_id: nfeIdByExternal[String(r.nfeID)] ?? null,
            cnpj: str(r.cnpj ?? r.CNPJ), name: str(r.xNome), trade_name: str(r.xFant),
            address: str(r.xLgr ?? r.endereco), city: str(r.xMun ?? r.cidade),
            state: str(r.UF ?? r.estado, 2), zip_code: str(r.CEP),
            phone: str(r.fone ?? r.telefone), ie: str(r.IE),
          })), 'dealership_id,external_id', errors),
        upsertBatch('nfe_dest',
          (rawTables['tbNFe dest'] ?? []).filter((r: any) => r.nfeID).map((r: any) => ({
            dealership_id: D, external_id: str(r.nfeDestID) ?? `dest-${r.nfeID}`,
            nfe_external_id: String(r.nfeID), nfe_id: nfeIdByExternal[String(r.nfeID)] ?? null,
            cpf_cnpj: str(r.CPF ?? r.CNPJ ?? r.cpfCNPJ), name: str(r.xNome),
            address: str(r.xLgr ?? r.endereco), city: str(r.xMun ?? r.cidade),
            state: str(r.UF ?? r.estado, 2), zip_code: str(r.CEP),
            phone: str(r.fone ?? r.telefone), email: str(r.email), ie: str(r.IE),
          })), 'dealership_id,external_id', errors),
        upsertBatch('nfe_prod',
          (rawTables['tbNFe prod'] ?? []).filter((r: any) => r.nfeProdID).map((r: any) => ({
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
          })), 'dealership_id,external_id', errors),
      ])
      return { nfe_ide: nfeCount, nfe_emit: emitCount, nfe_dest: destCount, nfe_prod: prodCount }
    })(),
  ])

  counts.customer_complements = phD_custCompl
  counts.customer_commercial_data = phD_custComm
  counts.customer_asset_references = phD_custAsset
  counts.employee_salaries = phD_empSal
  counts.commission_standards = phD_commStd
  counts.purchase_data = phD_purchase
  counts.sale_data = phD_sale
  counts.expenses = phD_exp
  counts.vehicle_fines = phD_fines
  counts.vehicle_documents = phD_docs
  counts.vehicle_purchase_documents = phD_purchDocs
  counts.vehicle_optionals = phD_opts
  counts.vehicle_pendencies = phD_pend
  counts.vehicle_delivery_protocols = phD_deliv
  counts.vehicle_trades = phD_trades
  counts.vehicle_apportionment = phD_apportion
  counts.post_sale_expenses = phD_postSale
  counts.financings = phD_fin
  counts.insurances = phD_ins
  counts.commissions = phD_comm
  counts.orders = (phD_orders as any).orders
  counts.order_followups = (phD_orders as any).order_followups
  counts.nfe_ide = (phD_nfe as any).nfe_ide
  counts.nfe_emit = (phD_nfe as any).nfe_emit
  counts.nfe_dest = (phD_nfe as any).nfe_dest
  counts.nfe_prod = (phD_nfe as any).nfe_prod

  try { await getSvc().rpc('refresh_days_in_stock', { d_id: D }) } catch { /* non-critical */ }

  const totalImported = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)
  ctx.log(`Import complete. Total: ${totalImported}, Errors: ${errors.length}`)

  await getSvc().from('imports').update({
    status: errors.length > 0 && (counts.vehicles ?? 0) === 0 ? 'error' : 'complete',
    records_imported: totalImported,
    errors,
    completed_at: new Date().toISOString(),
  }).eq('id', importId)

  return json(200, {
    import_id: importId,
    vehicles_imported: counts.vehicles ?? 0,
    expenses_imported: counts.expenses ?? 0,
    records_imported: totalImported,
    total_imported: totalImported,
    counts,
    errors,
  }, cors)

  } catch (e: any) {
    ctx.log(`Unhandled error: ${e?.message ?? e}`)
    return json(500, { error: e?.message ?? 'Internal server error' }, cors)
  }
}

// ─── Register function ───────────────────────────────────────────────────────

app.http('importMdb', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'importMdb',
  handler: importMdbHandler,
})

// ─── Clear dealership data ────────────────────────────────────────────────────

async function clearDataHandler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? ''
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') return { status: 204, headers: cors }

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json(401, { error: 'Unauthorized' }, cors)

    const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
    })
    if (!userRes.ok) return json(401, { error: 'Invalid token' }, cors)
    const user = await userRes.json() as { id: string }

    const { data: profile } = await getSvc().from('users').select('dealership_id').eq('id', user.id).single()
    if (!profile?.dealership_id) return json(400, { error: 'No dealership' }, cors)
    const D: string = profile.dealership_id

    const del = async (table: string) => {
      const { error } = await getSvc().from(table).delete().eq('dealership_id', D)
      if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`)
    }

    const delBatched = async (table: string, size = 100) => {
      while (true) {
        const { data, error: fetchErr } = await getSvc().from(table).select('id').eq('dealership_id', D).limit(size)
        if (fetchErr) throw new Error(`Failed to fetch from ${table}: ${fetchErr.message}`)
        if (!data || data.length === 0) break
        const ids = (data as any[]).map(r => r.id)
        const { error: delErr } = await getSvc().from(table).delete().in('id', ids)
        if (delErr) throw new Error(`Failed to delete batch from ${table}: ${delErr.message}`)
        if (data.length < size) break
      }
    }

    ctx.log(`Clearing data for dealership ${D}`)

    // Level 1: leaf tables
    await Promise.all([
      'order_followups', 'post_sale_expenses', 'vehicle_fines', 'vehicle_documents',
      'vehicle_optionals', 'vehicle_pendencies', 'vehicle_apportionment',
      'vehicle_delivery_protocols', 'vehicle_purchase_documents', 'vehicle_trades',
      'purchase_data', 'sale_data', 'nfe_prod', 'nfe_dest', 'nfe_emit', 'nfe_ide',
      'commissions', 'commission_standards', 'employee_salaries', 'ai_alerts',
    ].map(del))

    // Level 2: depend on vehicles/customers
    await Promise.all(['expenses', 'insurances', 'financings', 'orders'].map(del))

    // Level 3: main entities (batched — triggers cause timeout on full-table delete)
    await Promise.all([delBatched('vehicles'), delBatched('customers')])

    // Level 4: reference tables
    await Promise.all([
      'manufacturers', 'fuel_types', 'plan_accounts', 'customer_origins',
      'cancellation_reasons', 'standard_pendencies', 'standard_expenses', 'optionals',
      'general_enumerations', 'text_configurations', 'banks', 'bank_accounts',
      'vendors', 'employees', 'nature_of_operation', 'ncm',
    ].map(del))

    // Level 5: import history
    await del('imports')

    ctx.log(`Clear complete for dealership ${D}`)
    return json(200, { ok: true }, cors)

  } catch (e: any) {
    ctx.log(`Clear error: ${e?.message ?? e}`)
    return json(500, { error: e?.message ?? 'Internal server error' }, cors)
  }
}

app.http('clearData', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'clearData',
  handler: clearDataHandler,
})
