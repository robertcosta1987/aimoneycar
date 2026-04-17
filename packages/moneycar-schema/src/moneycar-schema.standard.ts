/**
 * packages/moneycar-schema/src/moneycar-schema.standard.ts
 * Auto-derived from: estrutura_banco_de_dados_moneycar.xlsx
 *
 * SINGLE SOURCE OF TRUTH for all Moneycar MDB table definitions.
 * Every downstream module (import service, AI agent, query builder) must
 * read schema information from here — never duplicate or hand-guess it.
 *
 * Key non-obvious rules (see STANDARD.md for full explanations):
 *  1. tbDadosCompra.cliID → tbCliente  (seller is a customer, NOT a supplier)
 *  2. tbVeiculo.carConsignado → tbCadastroTextos  (FK, not boolean)
 *  3. tbComissao.forID → tbFornecedor  (salesperson via party directory)
 *  4. tbDadosVenda.vendedorID → tbFornecedor  (salesperson via party directory)
 *  5. tbFuncionario.forID → tbFornecedor  (employee name/contact lives there)
 *
 * DO NOT hand-edit. Regenerate from the spreadsheet if it changes.
 */

import { ENUM_GROUPS } from './moneycar-enum-groups'

export type FieldType = 'int' | 'decimal' | 'text' | 'datetime' | 'bool'

export interface FieldSpec {
  name: string
  type: FieldType
  size?: number
  isPrimaryKey?: boolean
  isForeignKey?: boolean
  referencesTable?: string
  referencesTables?: string[]    // polymorphic FK targets (try in order)
  enumGroup?: number             // when referencesTable === 'tbEnumGeral'
  description?: string
  rule?: string
  legacyNote?: string
}

export interface TableSpec {
  name: string
  primaryKey: string | string[]
  fields: FieldSpec[]
  oneToOneWith?: string
  isJunctionTable?: boolean
  notes?: string
}

export const MONEYCAR_SCHEMA: Record<string, TableSpec> = {

  // ─────────────────────────────────────────────────────────────────────────
  // REFERENCE / LOOKUP TABLES
  // ─────────────────────────────────────────────────────────────────────────

  tbFabricantes: {
    name: 'tbFabricantes',
    primaryKey: 'fabID',
    notes: 'Vehicle manufacturers/brands lookup.',
    fields: [
      { name: 'fabID',   type: 'int',  isPrimaryKey: true,  description: 'Manufacturer ID' },
      { name: 'fabNome', type: 'text', description: 'Manufacturer name (e.g. Volkswagen, Fiat)' },
      { name: 'fabTipo', type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.manufacturer_category, description: 'Category: car / motorcycle / truck' },
    ],
  },

  tbCombustivel: {
    name: 'tbCombustivel',
    primaryKey: 'gazID',
    notes: 'Fuel types lookup.',
    fields: [
      { name: 'gazID',    type: 'int',  isPrimaryKey: true,  description: 'Fuel type ID' },
      { name: 'gazDescri',type: 'text', description: 'Fuel name (FLEX, GASOLINA, DIESEL, ELÉTRICO, HÍBRIDO)' },
    ],
  },

  tbEnumGeral: {
    name: 'tbEnumGeral',
    primaryKey: 'enuID',
    notes: 'Universal code dictionary. Join on (enumID = <value> AND enumTipo = <group>). See ENUM_GROUPS for all group numbers.',
    fields: [
      { name: 'enuID',    type: 'int',  isPrimaryKey: true,  description: 'Enum value ID' },
      { name: 'enuTipo',  type: 'int',  description: 'Group discriminator — matches ENUM_GROUPS values' },
      { name: 'enuCodigo',type: 'text', description: 'Short code / abbreviation' },
      { name: 'enuDescri',type: 'text', description: 'Long description / label' },
      { name: 'enuNome',  type: 'text', description: 'Display name' },
    ],
  },

  tbCadastroTextos: {
    name: 'tbCadastroTextos',
    primaryKey: 'texID',
    notes: 'Text template library: contract texts, declarations, consignment agreements. tbVeiculo.carConsignado and carDistrato are FKs here — NOT booleans.',
    fields: [
      { name: 'texID',     type: 'int',  isPrimaryKey: true,  description: 'Text template ID' },
      { name: 'texNome',   type: 'text', description: 'Template name' },
      { name: 'texDescri', type: 'text', description: 'Short description' },
      { name: 'texConteudo',type: 'text',description: 'Full template body (HTML/RTF)' },
      { name: 'texTipo',   type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.document_text_type, description: 'Template category' },
    ],
  },

  tbPlanoContas: {
    name: 'tbPlanoContas',
    primaryKey: 'plaID',
    notes: 'Chart of accounts. tbMovimento.plaID and tbDespesaPadrao.plaID both reference this.',
    fields: [
      { name: 'plaID',       type: 'int',  isPrimaryKey: true,  description: 'Account ID' },
      { name: 'PlaNome',     type: 'text', description: 'Account name' },
      { name: 'plaCategoria',type: 'text', description: 'Category grouping' },
      { name: 'plaTipo',     type: 'text', description: 'Type: receita / despesa / transferência' },
    ],
  },

  tbOrigemCliente: {
    name: 'tbOrigemCliente',
    primaryKey: 'oriID',
    notes: 'Customer acquisition channel lookup.',
    fields: [
      { name: 'oriID',    type: 'int',  isPrimaryKey: true },
      { name: 'oriDescri',type: 'text' },
      { name: 'oriNome',  type: 'text' },
    ],
  },

  tbMotivoCancelamento: {
    name: 'tbMotivoCancelamento',
    primaryKey: 'mcanID',
    notes: 'Order cancellation reason lookup.',
    fields: [
      { name: 'mcanID',    type: 'int',  isPrimaryKey: true },
      { name: 'mcanDescri',type: 'text' },
      { name: 'mcanNome',  type: 'text' },
    ],
  },

  tbPendenciaPadrao: {
    name: 'tbPendenciaPadrao',
    primaryKey: 'ppnID',
    notes: 'Standard vehicle pendency types (CRLV, IPVA, etc.).',
    fields: [
      { name: 'ppnID',       type: 'int',  isPrimaryKey: true },
      { name: 'ppnDescri',   type: 'text' },
      { name: 'ppnNome',     type: 'text' },
      { name: 'ppnCategoria',type: 'text' },
    ],
  },

  tbDespesaPadrao: {
    name: 'tbDespesaPadrao',
    primaryKey: 'dpaID',
    notes: 'Standard expense templates pre-loaded into a vehicle\'s cost record.',
    fields: [
      { name: 'dpaID',    type: 'int',     isPrimaryKey: true },
      { name: 'dpaNome',  type: 'text' },
      { name: 'dpaDescri',type: 'text' },
      { name: 'plaID',    type: 'int',     isForeignKey: true, referencesTable: 'tbPlanoContas' },
      { name: 'dpaValor', type: 'decimal', description: 'Default amount' },
    ],
  },

  tbOpcionais: {
    name: 'tbOpcionais',
    primaryKey: 'opcID',
    notes: 'Vehicle optional features catalogue (air conditioning, ABS, etc.).',
    fields: [
      { name: 'opcID',       type: 'int',  isPrimaryKey: true },
      { name: 'opcNome',     type: 'text' },
      { name: 'opcDescri',   type: 'text' },
      { name: 'opcCategoria',type: 'text' },
      { name: 'optGrupo',    type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.option_group },
    ],
  },

  tbNCM: {
    name: 'tbNCM',
    primaryKey: 'ncmID',
    notes: 'Brazilian fiscal product classification codes.',
    fields: [
      { name: 'ncmID',     type: 'int',  isPrimaryKey: true },
      { name: 'ncmCodigo', type: 'text', description: 'NCM code (e.g. 8703.21.00)' },
      { name: 'ncmDescri', type: 'text' },
    ],
  },

  tbNaturezaOp: {
    name: 'tbNaturezaOp',
    primaryKey: 'natID',
    notes: 'Nature of operation — fiscal CFOP grouping.',
    fields: [
      { name: 'natID',    type: 'int',  isPrimaryKey: true },
      { name: 'natNome',  type: 'text' },
      { name: 'natDescri',type: 'text' },
      { name: 'natCFOP',  type: 'text', description: 'CFOP code' },
    ],
  },

  tbBancosCadastro: {
    name: 'tbBancosCadastro',
    primaryKey: 'bancID',
    notes: 'Brazilian banks directory.',
    fields: [
      { name: 'bancID',      type: 'int',  isPrimaryKey: true },
      { name: 'bancNome',    type: 'text' },
      { name: 'bancDescri',  type: 'text' },
      { name: 'bancCodigo',  type: 'text', description: 'BACEN bank code' },
      { name: 'bancAgencia', type: 'text' },
      { name: 'bancConta',   type: 'text' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARTY DIRECTORY  (customers, suppliers, employees — all parties)
  // ─────────────────────────────────────────────────────────────────────────

  tbCliente: {
    name: 'tbCliente',
    primaryKey: 'cliid',
    notes: 'All customers AND vehicle sellers. When a dealership buys a vehicle, the seller is registered here as a customer record (tbDadosCompra.cliID → tbCliente). Do not assume tbCliente = buyers only.',
    fields: [
      { name: 'cliid',       type: 'int',  isPrimaryKey: true,  description: 'Customer ID (note lowercase "id")' },
      { name: 'cliNome',     type: 'text', description: 'Full name' },
      { name: 'cliStatus',   type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.client_status },
      { name: 'cliEmail',    type: 'text' },
      { name: 'cliFone1',    type: 'text', description: 'Primary phone' },
      { name: 'cliFone2',    type: 'text' },
      { name: 'cliFone3',    type: 'text' },
      { name: 'cliCNPJ_CPF', type: 'text', description: 'CPF (11 digits) or CNPJ (14 digits)' },
      { name: 'cliRG_IE',    type: 'text', description: 'RG or State Tax ID' },
      { name: 'CliEnd',      type: 'text', description: 'Street address' },
      { name: 'cliEnd_n',    type: 'text', description: 'Address number' },
      { name: 'cliCompl',    type: 'text', description: 'Address complement' },
      { name: 'cliBairro',   type: 'text', description: 'Neighborhood' },
      { name: 'cliCidade',   type: 'text' },
      { name: 'cliEstado',   type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.brazilian_state },
      { name: 'cliCEP',      type: 'text' },
      { name: 'cliOBS',      type: 'text', description: 'Notes' },
      { name: 'empID',       type: 'int',  isForeignKey: true, referencesTable: 'tbEmpresa', description: 'Tenant/dealership ID' },
      { name: 'cliContato',  type: 'text', description: 'Contact person name' },
      { name: 'cliFone1Compl',type: 'text'},
      { name: 'cliFone2Compl',type: 'text'},
      { name: 'cliDataNasc', type: 'datetime', description: 'Birth date' },
      { name: 'cliNascimento',type: 'datetime',description: 'Birth date (alternate field name in some MDB versions)' },
      { name: 'oriID',       type: 'int',  isForeignKey: true, referencesTable: 'tbOrigemCliente', description: 'Acquisition channel' },
    ],
  },

  tbClienteComplemento: {
    name: 'tbClienteComplemento',
    primaryKey: 'cliID',
    oneToOneWith: 'tbCliente',
    notes: 'Customer demographic extension — one row per customer. JOIN on cliID.',
    fields: [
      { name: 'cliID',        type: 'int',  isPrimaryKey: true, isForeignKey: true, referencesTable: 'tbCliente' },
      { name: 'cliPai',       type: 'text', description: 'Father name' },
      { name: 'cliMae',       type: 'text', description: 'Mother name' },
      { name: 'cliConjuge',   type: 'text', description: 'Spouse name' },
      { name: 'cliEsposo',    type: 'text', description: 'Spouse (alternate)' },
      { name: 'cliCPFConjuge',type: 'text' },
      { name: 'cliRenda',     type: 'decimal', description: 'Monthly income' },
      { name: 'cliProfissao', type: 'text' },
      { name: 'cliEmpresa',   type: 'text', description: 'Employer name' },
      { name: 'cliTelEmpresa',type: 'text' },
      { name: 'cliEndEmpresa',type: 'text' },
      { name: 'cliCidEmpresa',type: 'text' },
      { name: 'estadoCivil',  type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.marital_status },
      { name: 'escolaridade', type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.education_level },
      { name: 'tipoResidencia',type: 'int', isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.residence_type },
      { name: 'tempoResidencia',type:'int', isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.residence_duration },
    ],
  },

  tbClienteDadosComerciais: {
    name: 'tbClienteDadosComerciais',
    primaryKey: 'cliID',
    oneToOneWith: 'tbCliente',
    notes: 'Commercial / business data for corporate customers.',
    fields: [
      { name: 'cliID',         type: 'int',  isPrimaryKey: true, isForeignKey: true, referencesTable: 'tbCliente' },
      { name: 'cliRazaoSocial',type: 'text', description: 'Legal company name' },
      { name: 'cliEmpresa',    type: 'text', description: 'Trading name' },
      { name: 'cliCNPJ',       type: 'text' },
      { name: 'cliAtividade',  type: 'text' },
      { name: 'cliFaturamento',type: 'decimal', description: 'Monthly revenue' },
      { name: 'cliEndereco',   type: 'text' },
      { name: 'cliCidade',     type: 'text' },
      { name: 'cliEstado',     type: 'text' },
      { name: 'cliTelefone',   type: 'text' },
    ],
  },

  tbClienteReferenciasBens: {
    name: 'tbClienteReferenciasBens',
    primaryKey: ['cliID', 'refID'],
    isJunctionTable: false,
    notes: 'Asset and financial references provided by the customer for credit analysis.',
    fields: [
      { name: 'cliID',    type: 'int',     isForeignKey: true, referencesTable: 'tbCliente' },
      { name: 'refID',    type: 'int',     isPrimaryKey: true, description: 'Reference sequence number' },
      { name: 'refTipo',  type: 'text',    description: 'Asset type: imóvel, veículo, financiamento, etc.' },
      { name: 'refDescri',type: 'text' },
      { name: 'refValor', type: 'decimal', description: 'Asset value' },
      { name: 'refBanco', type: 'text',    description: 'Financing bank' },
      { name: 'refParcela',type: 'decimal',description: 'Monthly payment' },
    ],
  },

  tbFornecedor: {
    name: 'tbFornecedor',
    primaryKey: 'forID',
    notes: 'Universal party directory: suppliers, employees (INTERNO), dispatchers, financing companies, insurance brokers, service providers. Filter by forTipo for role-specific queries. Also contains denormalized person fields copied from tbCliente (cliCNH, cliSexo, etc.) — these are a legacy artifact; do not confuse them with customer-side data.',
    fields: [
      { name: 'forID',          type: 'int',  isPrimaryKey: true,  description: 'Party ID (matches tbFuncionario.forID for employees)' },
      { name: 'forNome',        type: 'text', description: 'Short name' },
      { name: 'forRazSoc',      type: 'text', description: 'Legal name / company name (primary display field)' },
      { name: 'forRazaoSocial', type: 'text', description: 'Legal name (alternate field name in some MDB versions)', legacyNote: 'Use forRazSoc; fall back to this' },
      { name: 'forFantasia',    type: 'text', description: 'Trading name / DBA' },
      { name: 'forCategoria',   type: 'text' },
      { name: 'forTipo',        type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.supplier_role, description: 'Role: INTERNO / DESPACHANTE / FINANCEIRA / CORRETORAS / PREST.SERVIÇO' },
      { name: 'forStatus',      type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.supplier_status },
      { name: 'forFone1',       type: 'text', description: 'Primary phone' },
      { name: 'forFone2',       type: 'text' },
      { name: 'forTelefone',    type: 'text', legacyNote: 'Alternate field name; prefer forFone1' },
      { name: 'forEmail',       type: 'text' },
      { name: 'forCNPJ',        type: 'text', description: 'CNPJ or CPF' },
      { name: 'forEnd',         type: 'text', description: 'Street address' },
      { name: 'forEndereco',    type: 'text', legacyNote: 'Alternate field name; prefer forEnd' },
      { name: 'forLogradouro',  type: 'text' },
      { name: 'forBairro',      type: 'text' },
      { name: 'forCidade',      type: 'text' },
      { name: 'forEstado',      type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.brazilian_state },
      { name: 'forCEP',         type: 'text' },
      { name: 'forOBS',         type: 'text', description: 'Notes' },
      { name: 'forObservacoes', type: 'text', legacyNote: 'Alternate field name; prefer forOBS' },
      // ── Legacy denormalized person fields (do NOT rename) ─────────────────
      { name: 'cliCNH',         type: 'text', legacyNote: 'person_fields_on_supplier — CNH (driver license) copied from tbCliente schema' },
      { name: 'cliCNH_Categoria',type:'text', legacyNote: 'person_fields_on_supplier' },
      { name: 'cliDtNasc',      type: 'datetime', legacyNote: 'person_fields_on_supplier — birth date' },
      { name: 'cliEtiqueta',    type: 'text', legacyNote: 'person_fields_on_supplier — label/tag' },
      { name: 'cliOpt_in',      type: 'bool', legacyNote: 'person_fields_on_supplier — marketing opt-in' },
      { name: 'cliSexo',        type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.gender, legacyNote: 'person_fields_on_supplier — gender' },
    ],
  },

  tbFuncionario: {
    name: 'tbFuncionario',
    primaryKey: 'funID',
    notes: 'Employee HR extension. Name, email, phone, address ALL live in tbFornecedor (via forID). tbFuncionario adds only HR-specific fields (salary, hire/fire dates). ALWAYS join tbFuncionario.forID → tbFornecedor to get the employee\'s name.',
    fields: [
      { name: 'funID',          type: 'int',      isPrimaryKey: true,  description: 'Employee ID (stored as employees.external_id in the Supabase layer)' },
      { name: 'forID',          type: 'int',      isForeignKey: true, referencesTable: 'tbFornecedor', description: 'CRITICAL: employee name/contact lives in tbFornecedor at this forID' },
      { name: 'funNome',        type: 'text',     description: 'Employee name (often empty — use tbFornecedor.forRazSoc via forID instead)' },
      { name: 'funCPF',         type: 'text' },
      { name: 'funRG',          type: 'text' },
      { name: 'funCargo',       type: 'text',     description: 'Job role / title' },
      { name: 'funEmail',       type: 'text',     description: 'Email (also in tbFornecedor)' },
      { name: 'funTelefone',    type: 'text',     description: 'Phone (also in tbFornecedor)' },
      { name: 'funDtAdmissao',  type: 'datetime', description: 'Hire date' },
      { name: 'funDataAdmissao',type: 'datetime', legacyNote: 'Alternate field name; prefer funDtAdmissao' },
      { name: 'funDtDemissao',  type: 'datetime', description: 'Termination date (null = still active)' },
      { name: 'funDataDemissao',type: 'datetime', legacyNote: 'Alternate field name; prefer funDtDemissao' },
      { name: 'funSalario',     type: 'decimal',  description: 'Base salary' },
      { name: 'funComissao',    type: 'decimal',  description: 'Default commission rate (%)' },
    ],
  },

  tbfuncionarioSalario: {
    name: 'tbfuncionarioSalario',
    primaryKey: 'salID',
    notes: 'Employee payment history: salaries, commissions paid, advances, bonuses, deductions.',
    fields: [
      { name: 'salID',    type: 'int',      isPrimaryKey: true },
      { name: 'funID',    type: 'int',      isForeignKey: true, referencesTable: 'tbFuncionario' },
      { name: 'salData',  type: 'datetime', description: 'Payment date' },
      { name: 'salValor', type: 'decimal',  description: 'Amount' },
      { name: 'salTipo',  type: 'text',     description: 'Type: SALARIO / COMISSAO / ADIANTAMENTO / BONUS / DESCONTO' },
      { name: 'salDescri',type: 'text',     description: 'Description / notes' },
    ],
  },

  tbComissaoPadrao: {
    name: 'tbComissaoPadrao',
    primaryKey: 'cpaID',
    notes: 'Commission rule definitions per employee. Defines % and value range triggers.',
    fields: [
      { name: 'cpaID',        type: 'int',     isPrimaryKey: true },
      { name: 'funID',        type: 'int',     isForeignKey: true, referencesTable: 'tbFuncionario' },
      { name: 'cpaPercentual',type: 'decimal', description: 'Commission percentage' },
      { name: 'cpaValorMin',  type: 'decimal', description: 'Minimum sale value for this rule to apply' },
      { name: 'cpaValorMax',  type: 'decimal', description: 'Maximum sale value for this rule' },
      { name: 'cpaTipo',      type: 'int',     isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.commission_type },
      { name: 'coStatus',     type: 'int',     isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.commission_standard_status },
    ],
  },

  tbContasCorrentes: {
    name: 'tbContasCorrentes',
    primaryKey: 'ctaID',
    notes: 'Dealership bank accounts.',
    fields: [
      { name: 'ctaID',     type: 'int',     isPrimaryKey: true },
      { name: 'ctaNome',   type: 'text',    description: 'Account name/label' },
      { name: 'ctaDescri', type: 'text' },
      { name: 'bancID',    type: 'int',     isForeignKey: true, referencesTable: 'tbBancosCadastro' },
      { name: 'ctaAgencia',type: 'text' },
      { name: 'ctaConta',  type: 'text' },
      { name: 'ctaSaldo',  type: 'decimal', description: 'Current balance' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VEHICLE + TRANSACTION TABLES
  // ─────────────────────────────────────────────────────────────────────────

  tbVeiculo: {
    name: 'tbVeiculo',
    primaryKey: 'carID',
    notes: 'Central vehicle table. carConsignado and carDistrato are FKs to tbCadastroTextos — NOT booleans. Use vehicle.inventory_status derived property for UI. CarTroca self-references for the last trade-in vehicle received.',
    fields: [
      { name: 'carID',          type: 'int',  isPrimaryKey: true,  description: 'Vehicle ID' },
      { name: 'carPlaca',       type: 'text', description: 'License plate' },
      { name: 'carDescri',      type: 'text', description: 'Model description' },
      { name: 'carAno',         type: 'int',  description: 'Manufacture year' },
      { name: 'carAnoModelo',   type: 'int',  description: 'Model year' },
      { name: 'fabID',          type: 'int',  isForeignKey: true, referencesTable: 'tbFabricantes', description: 'Brand/manufacturer' },
      { name: 'gazID',          type: 'int',  isForeignKey: true, referencesTable: 'tbCombustivel', description: 'Fuel type' },
      { name: 'carTipo',        type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.vehicle_category },
      { name: 'carStatus',      type: 'int',  isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.vehicle_status, description: 'DISPONIVEL / VENDIDO / DEVOLVIDO / RESERVADO' },
      { name: 'carValorCompra', type: 'decimal', description: 'Purchase price' },
      { name: 'carValorTabela', type: 'decimal', description: 'Asking/list price' },
      { name: 'carChassi',      type: 'text', description: 'Chassis / VIN' },
      { name: 'carRenavan',     type: 'text' },
      { name: 'carCor',         type: 'text', description: 'Color' },
      { name: 'carMotor',       type: 'text', description: 'Engine description' },
      { name: 'carNacionalidade',type: 'int', isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.vehicle_origin, description: 'Nacional / Importado' },
      {
        name: 'carConsignado',
        type: 'int',
        isForeignKey: true,
        referencesTable: 'tbCadastroTextos',
        description: 'Consignment contract template ID. NULL/0 = dealer-owned stock. POPULATED = consigned vehicle.',
        rule: 'DO NOT treat as boolean. Read tbCadastroTextos[carConsignado] to get the contract text. For inventory_status, check: null/0=owned, populated=consigned, populated+carDistrato=returned.',
      },
      {
        name: 'carDistrato',
        type: 'int',
        isForeignKey: true,
        referencesTable: 'tbCadastroTextos',
        description: 'Consignment rescission contract template ID. Populated = consignment was cancelled and vehicle returned to owner.',
        rule: 'Always read alongside carConsignado. Both populated + carStatus=DEVOLVIDO = consignment_returned.',
      },
      { name: 'CarTroca',       type: 'int',  isForeignKey: true, referencesTable: 'tbVeiculo', description: 'Self-reference: carID of the last trade-in vehicle received against this vehicle' },
      { name: 'empID',          type: 'int',  isForeignKey: true, referencesTable: 'tbEmpresa',  description: 'Tenant/dealership ID' },
    ],
  },

  tbDadosCompra: {
    name: 'tbDadosCompra',
    primaryKey: 'cID',
    notes: 'Vehicle purchase details — one row per purchased vehicle. CRITICAL: cliID references tbCliente (the seller is registered as a customer), NOT tbFornecedor. crepresentante is the seller\'s legal rep (estate/company), also in tbCliente.',
    fields: [
      { name: 'cID',            type: 'int',      isPrimaryKey: true,  description: 'Purchase record ID' },
      { name: 'carID',          type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo',  description: 'Vehicle purchased' },
      {
        name: 'cliID',
        type: 'int',
        isForeignKey: true,
        referencesTable: 'tbCliente',
        description: 'Seller — registered as a customer. NOT tbFornecedor.',
        rule: 'Join to tbCliente for seller name/contact. Any code joining this to tbFornecedor is WRONG per the authoritative standard.',
      },
      {
        name: 'crepresentante',
        type: 'int',
        isForeignKey: true,
        referencesTable: 'tbCliente',
        description: 'Seller\'s legal representative (for estates, companies). Also in tbCliente.',
      },
      { name: 'cData',          type: 'datetime', description: 'Purchase date' },
      { name: 'cKM',            type: 'int',      description: 'Mileage at purchase' },
      { name: 'cValor',         type: 'decimal',  description: 'Purchase price paid' },
      { name: 'cDeclaracao',    type: 'int',      isForeignKey: true, referencesTable: 'tbCadastroTextos', description: 'Purchase declaration contract template' },
      { name: 'avaliadorID',    type: 'int',      isForeignKey: true, referencesTable: 'tbFornecedor', description: 'Appraiser/evaluator (employee via supplier directory)' },
      { name: 'cFormaPagamento',type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.payment_method },
      { name: 'cObservacoes',   type: 'text' },
      { name: 'cObs',           type: 'text',     legacyNote: 'Alternate notes field' },
    ],
  },

  tbDadosVenda: {
    name: 'tbDadosVenda',
    primaryKey: 'vID',
    notes: 'Vehicle sale details — one row per sold vehicle. vendedorID references tbFornecedor (the salesperson is stored in the party directory). cliID references the buyer in tbCliente.',
    fields: [
      { name: 'vID',            type: 'int',      isPrimaryKey: true,  description: 'Sale record ID' },
      { name: 'carID',          type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo', description: 'Vehicle sold' },
      { name: 'cliID',          type: 'int',      isForeignKey: true, referencesTable: 'tbCliente',  description: 'Buyer' },
      {
        name: 'vendedorID',
        type: 'int',
        isForeignKey: true,
        referencesTable: 'tbFornecedor',
        description: 'Salesperson — references tbFornecedor (party directory). To get employee UUID: vendedorID = forID → tbFuncionario.forID → funID → employees.external_id.',
        rule: 'This is a forID, not a funID. Resolve via tbFuncionario.forID → funID chain.',
      },
      { name: 'vData',          type: 'datetime', description: 'Sale date' },
      { name: 'vKM',            type: 'int',      description: 'Mileage at sale' },
      { name: 'vValorVenda',    type: 'decimal',  description: 'Sale price' },
      { name: 'vFormaPagamento',type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.payment_method },
      { name: 'vObservacoes',   type: 'text' },
      { name: 'vObs',           type: 'text',     legacyNote: 'Alternate notes field' },
    ],
  },

  tbMovimento: {
    name: 'tbMovimento',
    primaryKey: 'movID',
    notes: 'General ledger — ALL financial movements (income, expenses, transfers). The P&L source. ALWAYS join with tbPlanoContas (account name), tbFornecedor (counterparty), tbVeiculo (vehicle reference). Resolve enum columns before exposing to AI.',
    fields: [
      { name: 'movID',           type: 'int',      isPrimaryKey: true },
      { name: 'carReferencia',   type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo', description: 'Vehicle this movement relates to' },
      { name: 'forID',           type: 'int',      isForeignKey: true, referencesTable: 'tbFornecedor', description: 'Counterparty (supplier/payee/payer)' },
      { name: 'plaID',           type: 'int',      isForeignKey: true, referencesTable: 'tbPlanoContas', description: 'Chart of accounts category' },
      { name: 'movValor',        type: 'decimal',  description: 'Amount' },
      { name: 'movData',         type: 'datetime', description: 'Date' },
      { name: 'movDescri',       type: 'text',     description: 'Description' },
      { name: 'movSinal',        type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.movement_sign, description: 'Credit (+) or Debit (-)' },
      { name: 'movStatus',       type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.movement_status },
      { name: 'movClassificacao',type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.movement_classification },
      { name: 'empID',           type: 'int',      isForeignKey: true, referencesTable: 'tbEmpresa', description: 'Tenant ID' },
    ],
  },

  tbDespesaPosVenda: {
    name: 'tbDespesaPosVenda',
    primaryKey: 'movID',
    notes: 'Flag extension on tbMovimento identifying post-sale expenses (warranty, rework, complaints). NOT standalone — always LEFT JOIN to tbMovimento. PosVenda boolean marks the ledger entry as post-sale.',
    fields: [
      { name: 'movID',    type: 'int',  isPrimaryKey: true, isForeignKey: true, referencesTable: 'tbMovimento', description: 'References the tbMovimento row this flag belongs to' },
      { name: 'PosVenda', type: 'bool', description: 'True = this ledger entry is a post-sale expense' },
      { name: 'carID',    type: 'int',  isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'dpvDescri',type: 'text' },
      { name: 'dpvValor', type: 'decimal' },
      { name: 'dpvData',  type: 'datetime' },
      { name: 'plaID',    type: 'int',  isForeignKey: true, referencesTable: 'tbPlanoContas' },
    ],
  },

  tbComissao: {
    name: 'tbComissao',
    primaryKey: 'coID',
    notes: 'Commission records per vehicle sale. forID references the salesperson in tbFornecedor (party directory). To get employee name: forID → tbFornecedor.forRazSoc. To get employee UUID: forID → tbFuncionario.forID → funID → employees.external_id.',
    fields: [
      { name: 'coID',          type: 'int',      isPrimaryKey: true,  description: 'Commission record ID (field may also appear as comID in some MDB versions)' },
      { name: 'comID',         type: 'int',      legacyNote: 'Alternate PK field name in some MDB versions' },
      { name: 'carID',         type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo', description: 'Vehicle that generated this commission' },
      {
        name: 'forID',
        type: 'int',
        isForeignKey: true,
        referencesTable: 'tbFornecedor',
        description: 'Salesperson (forID in party directory). Resolve to employee name via tbFornecedor.forRazSoc.',
        rule: 'NOT funID. forID maps to tbFornecedor. Then tbFuncionario.forID gives the funID for the employees table.',
      },
      { name: 'funID',         type: 'int',      legacyNote: 'Alternate salesperson field name in some MDB versions — same semantic as forID above' },
      { name: 'coValor',       type: 'decimal',  description: 'Commission amount' },
      { name: 'comValor',      type: 'decimal',  legacyNote: 'Alternate field name for commission amount' },
      { name: 'coPorcentual',  type: 'decimal',  description: 'Commission percentage' },
      { name: 'comPercentual', type: 'decimal',  legacyNote: 'Alternate field name' },
      { name: 'coTipo',        type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.commission_type },
      { name: 'coModalidade',  type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.transaction_modality },
      { name: 'coData',        type: 'datetime', description: 'Commission date' },
      { name: 'coDataPagamento',type:'datetime', description: 'Payment date' },
      { name: 'coPago',        type: 'bool',     description: 'Paid flag' },
    ],
  },

  tbFinanciamento: {
    name: 'tbFinanciamento',
    primaryKey: 'finID',
    notes: 'Vehicle financing records. forID references the financing company in tbFornecedor (forTipo=FINANCEIRA).',
    fields: [
      { name: 'finID',          type: 'int',      isPrimaryKey: true },
      { name: 'carID',          type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'forID',          type: 'int',      isForeignKey: true, referencesTable: 'tbFornecedor', description: 'Financing company / bank (filter forTipo=FINANCEIRA)' },
      { name: 'finValor',       type: 'decimal',  description: 'Total financed amount' },
      { name: 'finParcelas',    type: 'int',      description: 'Number of installments' },
      { name: 'finTaxa',        type: 'decimal',  description: 'Monthly interest rate (%)' },
      { name: 'finParcelaValor',type: 'decimal',  description: 'Monthly installment amount' },
      { name: 'finData1Parcela',type: 'datetime', description: 'First installment due date' },
      { name: 'finOBS',         type: 'text' },
    ],
  },

  tbSeguro: {
    name: 'tbSeguro',
    primaryKey: 'segID',
    notes: 'Vehicle insurance policies.',
    fields: [
      { name: 'segID',           type: 'int',      isPrimaryKey: true },
      { name: 'carID',           type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'cliID',           type: 'int',      isForeignKey: true, referencesTable: 'tbCliente', description: 'Insured customer' },
      { name: 'segEmpresa',      type: 'text',     description: 'Insurance company name' },
      { name: 'segApolice',      type: 'text',     description: 'Policy number' },
      { name: 'segValor',        type: 'decimal',  description: 'Insured value' },
      { name: 'segPremio',       type: 'decimal',  description: 'Premium amount' },
      { name: 'segDataInicio',   type: 'datetime' },
      { name: 'segDataFim',      type: 'datetime' },
      { name: 'segTipoCobertura',type: 'text' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VEHICLE-LINKED DETAIL TABLES
  // ─────────────────────────────────────────────────────────────────────────

  tbVeiculoMulta: {
    name: 'tbVeiculoMulta',
    primaryKey: 'mulID',
    notes: 'Traffic fines associated with a vehicle during the time it is in the dealership\'s possession.',
    fields: [
      { name: 'mulID',              type: 'int',      isPrimaryKey: true },
      { name: 'carID',              type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'mulData',            type: 'datetime', description: 'Fine date' },
      { name: 'mulValor',           type: 'decimal',  description: 'Fine amount' },
      { name: 'mulDescri',          type: 'text' },
      { name: 'mulOrgao',           type: 'text',     description: 'Issuing agency' },
      { name: 'mulCodigo',          type: 'text',     description: 'Infraction code' },
      { name: 'mulPago',            type: 'bool',     description: 'Paid flag' },
      { name: 'mulDataPagamento',   type: 'datetime', description: 'Payment date' },
    ],
  },

  tbVeiculoDocumento: {
    name: 'tbVeiculoDocumento',
    primaryKey: 'docID',
    notes: 'Documents associated with a vehicle (CRLV, laudo, etc.).',
    fields: [
      { name: 'docID',      type: 'int',      isPrimaryKey: true },
      { name: 'carID',      type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'docTipo',    type: 'text',     description: 'Document type' },
      { name: 'docNumero',  type: 'text' },
      { name: 'docData',    type: 'datetime' },
      { name: 'docValidade',type: 'datetime', description: 'Expiry date' },
      { name: 'docArquivo', type: 'text',     description: 'File path/URL' },
    ],
  },

  tbVeiculoDocumentoCompra: {
    name: 'tbVeiculoDocumentoCompra',
    primaryKey: 'dcoID',
    notes: 'Purchase-side documents for a vehicle (DUT, nota fiscal de entrada, etc.).',
    fields: [
      { name: 'dcoID',     type: 'int',      isPrimaryKey: true },
      { name: 'carID',     type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'dcoTipo',   type: 'text' },
      { name: 'dcoNumero', type: 'text' },
      { name: 'dcoData',   type: 'datetime' },
      { name: 'dcoValor',  type: 'decimal' },
      { name: 'dcoArquivo',type: 'text' },
    ],
  },

  tbVeiculoOpcionais: {
    name: 'tbVeiculoOpcionais',
    primaryKey: ['carID', 'opcID'],
    isJunctionTable: true,
    notes: 'Junction table: vehicle ↔ optional features. Treat as composite-key junction even though spreadsheet marks a single-column P. Resolves to vehicle.options[] in the application model.',
    fields: [
      { name: 'voID',    type: 'int', isPrimaryKey: true, legacyNote: 'Single-column PK marker from spreadsheet — treat composite (carID, opcID) as the real key' },
      { name: 'carID',   type: 'int', isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'opcID',   type: 'int', isForeignKey: true, referencesTable: 'tbOpcionais' },
      { name: 'voDescri',type: 'text', description: 'Override description for this instance' },
    ],
  },

  tbVeiculoPendencia: {
    name: 'tbVeiculoPendencia',
    primaryKey: 'vpnID',
    notes: 'Pending items on a vehicle before it is ready for sale (missing documents, repairs needed, etc.).',
    fields: [
      { name: 'vpnID',           type: 'int',      isPrimaryKey: true },
      { name: 'carID',           type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'ppnID',           type: 'int',      isForeignKey: true, referencesTable: 'tbPendenciaPadrao', description: 'Standard pendency type' },
      { name: 'vpnDescri',       type: 'text',     description: 'Custom description' },
      { name: 'vpnStatus',       type: 'text',     description: 'pending / resolved / cancelled' },
      { name: 'vpnData',         type: 'datetime', description: 'Created date' },
      { name: 'vpnValor',        type: 'decimal',  description: 'Estimated cost' },
      { name: 'vpnDataResolucao',type: 'datetime', description: 'Resolution date' },
    ],
  },

  tbVeiculoProtocoloEntrega: {
    name: 'tbVeiculoProtocoloEntrega',
    primaryKey: 'carID',
    oneToOneWith: 'tbVeiculo',
    notes: 'Vehicle handover protocol — one record per vehicle. forID and forID2 are polymorphic: try tbFuncionario first (employee handing over), fall back to tbFornecedor. Outstanding fines at handover are stored in parallel arrays (txtMulta1-5, vrMulta1-5, dtMulta1-5) — normalize in application layer.',
    fields: [
      { name: 'proID',             type: 'int',      description: 'Record ID' },
      { name: 'carID',             type: 'int',      isPrimaryKey: true, isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'cliID',             type: 'int',      isForeignKey: true, referencesTable: 'tbCliente', description: 'Customer receiving the vehicle' },
      { name: 'forID',             type: 'int',      isForeignKey: true, referencesTables: ['tbFuncionario', 'tbFornecedor'], description: 'Person handing over (try employee first, then supplier)' },
      { name: 'forID2',            type: 'int',      isForeignKey: true, referencesTables: ['tbFuncionario', 'tbFornecedor'], description: 'Second witness / co-signer (same resolution logic)' },
      { name: 'proData',           type: 'datetime', description: 'Handover date' },
      { name: 'proKM',             type: 'int',      description: 'Mileage at handover' },
      { name: 'proNivelCombustivel',type:'text',     description: 'Fuel level' },
      { name: 'proCombustivel',    type: 'text' },
      { name: 'proDescri',         type: 'text' },
      { name: 'proAssinatura',     type: 'text',     description: 'Signature data / image path' },
      // Fine arrays at handover (normalize in app):
      { name: 'txtMulta1', type: 'text' }, { name: 'vrMulta1', type: 'decimal' }, { name: 'dtMulta1', type: 'datetime' },
      { name: 'txtMulta2', type: 'text' }, { name: 'vrMulta2', type: 'decimal' }, { name: 'dtMulta2', type: 'datetime' },
      { name: 'txtMulta3', type: 'text' }, { name: 'vrMulta3', type: 'decimal' }, { name: 'dtMulta3', type: 'datetime' },
      { name: 'txtMulta4', type: 'text' }, { name: 'vrMulta4', type: 'decimal' }, { name: 'dtMulta4', type: 'datetime' },
      { name: 'txtMulta5', type: 'text' }, { name: 'vrMulta5', type: 'decimal' }, { name: 'dtMulta5', type: 'datetime' },
    ],
  },

  tbveiculoTroca: {
    name: 'tbveiculoTroca',
    primaryKey: ['carid', 'veiculoTroca'],
    isJunctionTable: true,
    notes: 'Trade-in link table. Self-referencing many-to-many on tbVeiculo. carid = sold vehicle; veiculoTroca = trade-in vehicle received. Spreadsheet P marker on carid alone is misleading — composite key is the real semantic PK.',
    fields: [
      { name: 'trcID',        type: 'int',      description: 'Record ID' },
      { name: 'carid',        type: 'int',      isPrimaryKey: true, isForeignKey: true, referencesTable: 'tbVeiculo', description: 'Sold vehicle' },
      { name: 'veiculoTroca', type: 'int',      isPrimaryKey: true, isForeignKey: true, referencesTable: 'tbVeiculo', description: 'Trade-in vehicle received' },
      { name: 'carIDEntregue',type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo', legacyNote: 'Alternate field name for sold vehicle' },
      { name: 'cliID',        type: 'int',      isForeignKey: true, referencesTable: 'tbCliente',  description: 'Customer making the trade' },
      { name: 'trcData',      type: 'datetime', description: 'Trade date' },
      { name: 'trcValorEntrada',type:'decimal', description: 'Value attributed to trade-in vehicle' },
      { name: 'trcDiferenca', type: 'decimal',  description: 'Cash difference paid by customer' },
    ],
  },

  tbRateioVeiculo: {
    name: 'tbRateioVeiculo',
    primaryKey: 'ratID',
    notes: 'Vehicle cost apportionment — splits a vehicle\'s costs across chart-of-account categories.',
    fields: [
      { name: 'ratID',    type: 'int',      isPrimaryKey: true },
      { name: 'carID',    type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo' },
      { name: 'plaID',    type: 'int',      isForeignKey: true, referencesTable: 'tbPlanoContas' },
      { name: 'ratValor', type: 'decimal',  description: 'Apportioned amount' },
      { name: 'ratData',  type: 'datetime' },
      { name: 'ratDescri',type: 'text' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SALES WORKFLOW
  // ─────────────────────────────────────────────────────────────────────────

  tbPedidosClientes: {
    name: 'tbPedidosClientes',
    primaryKey: 'pedID',
    notes: 'Customer orders / sales orders. funID is the responsible salesperson (tbFuncionario). carID is often null — the vehicle may not be assigned at order time.',
    fields: [
      { name: 'pedID',          type: 'int',      isPrimaryKey: true },
      { name: 'cliID',          type: 'int',      isForeignKey: true, referencesTable: 'tbCliente' },
      { name: 'carID',          type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo',   description: 'Vehicle (may be null at order creation)' },
      { name: 'funID',          type: 'int',      isForeignKey: true, referencesTable: 'tbFuncionario', description: 'Salesperson' },
      { name: 'pedData',        type: 'datetime', description: 'Order date' },
      { name: 'pedValor',       type: 'decimal',  description: 'Order amount' },
      { name: 'pedStatus',      type: 'text',     description: 'open / approved / cancelled / completed' },
      { name: 'statusID',       type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.customer_order_status },
      { name: 'tipoPedido',     type: 'int',      isForeignKey: true, referencesTable: 'tbEnumGeral', enumGroup: ENUM_GROUPS.customer_order_type },
      { name: 'pedFormaPagamento',type:'text' },
      { name: 'pedEntrada',     type: 'decimal',  description: 'Down payment' },
    ],
  },

  tbPedidosFollowUp: {
    name: 'tbPedidosFollowUp',
    primaryKey: 'fupID',
    notes: 'Follow-up actions on a customer order.',
    fields: [
      { name: 'fupID',             type: 'int',      isPrimaryKey: true },
      { name: 'pedID',             type: 'int',      isForeignKey: true, referencesTable: 'tbPedidosClientes' },
      { name: 'funID',             type: 'int',      isForeignKey: true, referencesTable: 'tbFuncionario', description: 'Employee responsible for this follow-up' },
      { name: 'fupData',           type: 'datetime', description: 'Follow-up date' },
      { name: 'fupDescri',         type: 'text',     description: 'Notes / action taken' },
      { name: 'fupStatus',         type: 'text' },
      { name: 'fupProximoContato', type: 'datetime', description: 'Next contact scheduled' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FISCAL (NFe)
  // ─────────────────────────────────────────────────────────────────────────

  'tbNFe ide': {
    name: 'tbNFe ide',
    primaryKey: 'nfeID',
    notes: 'NFe header — one row per invoice.',
    fields: [
      { name: 'nfeID',         type: 'int',      isPrimaryKey: true },
      { name: 'nfeChave',      type: 'text',     description: 'NFe access key (44 digits)' },
      { name: 'chNFe',         type: 'text',     legacyNote: 'Alternate field name for access key' },
      { name: 'nNF',           type: 'text',     description: 'Invoice number' },
      { name: 'nfeNumero',     type: 'text',     legacyNote: 'Alternate field name' },
      { name: 'serie',         type: 'text',     description: 'Series' },
      { name: 'dhEmi',         type: 'datetime', description: 'Issue date/time' },
      { name: 'natOp',         type: 'text',     description: 'Nature of operation description' },
      { name: 'tpNF',          type: 'int',      description: '0=entrada, 1=saída' },
      { name: 'vNF',           type: 'decimal',  description: 'Total invoice value' },
      { name: 'nfeStatus',     type: 'text',     description: 'autorizado / cancelado / denegado' },
      { name: 'carID',         type: 'int',      isForeignKey: true, referencesTable: 'tbVeiculo' },
    ],
  },

  'tbNFe emit': {
    name: 'tbNFe emit',
    primaryKey: 'nfeEmitID',
    notes: 'NFe emitter (issuing party) data.',
    fields: [
      { name: 'nfeEmitID', type: 'int',  isPrimaryKey: true },
      { name: 'nfeID',     type: 'int',  isForeignKey: true, referencesTable: 'tbNFe ide' },
      { name: 'CNPJ',      type: 'text' },
      { name: 'xNome',     type: 'text', description: 'Company name' },
      { name: 'xFant',     type: 'text', description: 'Trading name' },
      { name: 'UF',        type: 'text', description: 'State' },
    ],
  },

  'tbNFe dest': {
    name: 'tbNFe dest',
    primaryKey: 'nfeDestID',
    notes: 'NFe recipient (buyer) data.',
    fields: [
      { name: 'nfeDestID', type: 'int',  isPrimaryKey: true },
      { name: 'nfeID',     type: 'int',  isForeignKey: true, referencesTable: 'tbNFe ide' },
      { name: 'CPF',       type: 'text' },
      { name: 'CNPJ',      type: 'text' },
      { name: 'xNome',     type: 'text', description: 'Recipient name' },
      { name: 'email',     type: 'text' },
    ],
  },

  'tbNFe prod': {
    name: 'tbNFe prod',
    primaryKey: 'nfeProdID',
    notes: 'NFe product lines.',
    fields: [
      { name: 'nfeProdID', type: 'int',     isPrimaryKey: true },
      { name: 'nfeID',     type: 'int',     isForeignKey: true, referencesTable: 'tbNFe ide' },
      { name: 'xProd',     type: 'text',    description: 'Product description' },
      { name: 'NCM',       type: 'text',    description: 'NCM code' },
      { name: 'CFOP',      type: 'text' },
      { name: 'vProd',     type: 'decimal', description: 'Line value' },
      { name: 'carID',     type: 'int',     isForeignKey: true, referencesTable: 'tbVeiculo' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS VIEW
  // ─────────────────────────────────────────────────────────────────────────

  tbVisaoGeralMovimentacao: {
    name: 'tbVisaoGeralMovimentacao',
    primaryKey: 'ID',
    notes: 'Pre-joined ledger view. Use for P&L queries instead of raw tbMovimento when available. Already resolves enum labels and account names. Filter by EMPID for tenant isolation.',
    fields: [
      { name: 'ID',             type: 'int',      isPrimaryKey: true },
      { name: 'EMPID',          type: 'int',      description: 'Tenant ID — ALWAYS filter on this' },
      { name: 'DATA',           type: 'datetime', description: 'Movement date' },
      { name: 'VALOR',          type: 'decimal',  description: 'Amount' },
      { name: 'CLASSIFICAÇÃO',  type: 'text',     description: 'Pre-resolved account classification label' },
      { name: 'CATEGORIA',      type: 'text',     description: 'Pre-resolved category label' },
      { name: 'SINAL',          type: 'text',     description: 'Pre-resolved: Crédito / Débito' },
      { name: 'VEICULO',        type: 'text',     description: 'Vehicle reference (resolved)' },
      { name: 'CONTRAPARTE',    type: 'text',     description: 'Counterparty name (resolved)' },
    ],
  },
}

/**
 * Derived inventory status for a vehicle.
 * Read carConsignado and carDistrato as FKs (integers), not booleans.
 */
export type VehicleInventoryStatus = 'owned_stock' | 'consigned' | 'consignment_returned'

export function getVehicleInventoryStatus(
  carConsignado: number | null | undefined,
  carDistrato: number | null | undefined,
  carStatusLabel?: string
): VehicleInventoryStatus {
  if (!carConsignado || carConsignado === 0) return 'owned_stock'
  if (carDistrato && carDistrato !== 0) return 'consignment_returned'
  return 'consigned'
}
