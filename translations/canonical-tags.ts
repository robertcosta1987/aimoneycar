/**
 * Canonical semantic tags — the indexing vocabulary for LLM retrieval.
 *
 * A "canonical tag" is a concept label that can be attached to one or more
 * fields across different tables. A query like "find all customers with
 * expired driver's licenses" hits the `driver_license` tag and retrieves
 * every field annotated with that tag regardless of its source table.
 *
 * Map structure:
 *   tag → array of qualified field paths ("table.field")
 *
 * Add new fields to existing tags rather than creating duplicate tags.
 * When a tag is genuinely new, add it here AND reference it in
 * silvecar-582-extension.ts under `indexable_as`.
 */

export type CanonicalTag = string
export type FieldPath = string // format: "supabase_table.column" OR "mdb_table.column"

/** All known canonical tags and the fields they cover. */
export const CANONICAL_TAGS: Record<CanonicalTag, FieldPath[]> = {

  // ── Identity & naming ────────────────────────────────────────────────────

  person_name: [
    'customers.name',                                // cliNome
    'vendors.name',                                  // forRazSoc / forFantasia
    'employees.name',                                // from tbFuncionario via tbFornecedor
    'customer_complements.father_name',              // FiliacaoPai
    'customer_complements.mother_name',              // FiliacaoMae
    'customer_commercial_data.spouse_name',          // conjuge_Nome
    'customer_asset_references.personal_reference_1_name',  // nome1
    'customer_asset_references.personal_reference_2_name',  // nome2
    'orders.client_name',                            // cliNome in tbPedidosClientes
    'mdb.tbFornecedor.forRazSoc',
    'mdb.tbFornecedor.forFantasia',
    'mdb.tbCliente.cliNome',
    'mdb.tbClienteComplemento.FiliacaoPai',
    'mdb.tbClienteComplemento.FiliacaoMae',
    'mdb.tbClienteDadosComerciais.conjuge_Nome',
  ],

  party_id: [
    'customers.id',
    'customers.external_id',                         // cliID in MDB
    'vendors.id',
    'vendors.external_id',                           // forID in MDB
    'mdb.tbCliente.cliid',
    'mdb.tbFornecedor.forID',
  ],

  // ── Brazilian identity documents ─────────────────────────────────────────

  brazilian_id: [
    'customers.cpf',                                 // from cliCNPJ_CPF (11 digits)
    'customers.cnpj',                                // from cliCNPJ_CPF (14 digits)
    'customers.rg',                                  // cliRG_IE
    'vehicles.chassis',                              // carChassi (VIN)
    'vehicles.renavam',                              // carRenavan
    'vehicles.plate',                                // carPlaca
    'vendors.cnpj',                                  // forCNPJ
    'employees.cpf',                                 // funCPF / from forCNPJ
    'mdb.tbCliente.cliCNPJ_CPF',
    'mdb.tbCliente.cliRG_IE',
    'mdb.tbCliente.cliCNH',
    'mdb.tbFornecedor.forCNPJ',
    'mdb.tbFuncionario.funPIS',
    'mdb.tbVeiculo.carChassi',
    'mdb.tbVeiculo.carRenavan',
    'mdb.tbVeiculo.carPlaca',
    'mdb.tbClienteDadosComerciais.cnpj',             // employer tax id
    'mdb.tbClienteDadosComerciais.conjuge_cpf',
    'mdb.tbClienteDadosComerciais.conjuge_empresaCNPJ',
    'mdb.tbClienteReferenciasBens.banco1',           // bank account linkage
  ],

  tax_id: [
    'customers.cpf',
    'customers.cnpj',
    'vendors.cnpj',
    'mdb.tbCliente.cliCNPJ_CPF',
    'mdb.tbFornecedor.forCNPJ',
    'mdb.tbClienteDadosComerciais.cnpj',
    'mdb.tbNFe_emit.CNPJ',
    'mdb.tbNFe_dest.CPF',
    'mdb.tbNFe_dest.CNPJ',
  ],

  driver_license: [
    'mdb.tbCliente.cliCNH',
    'mdb.tbCliente.cliCNH_Categoria',
    'mdb.tbFornecedor.cliCNH',
    'mdb.tbFornecedor.cliCNH_Categoria',
  ],

  personal_document: [
    'customers.cpf',
    'customers.cnpj',
    'customers.rg',
    'mdb.tbCliente.cliCNH',
    'mdb.tbCliente.cliRG_IE',
    'mdb.tbCliente.cliCNPJ_CPF',
    'mdb.tbFornecedor.forCNPJ',
    'mdb.tbFuncionario.funPIS',
    'mdb.tbFuncionario.funCT',
    'mdb.tbClienteDadosComerciais.conjuge_cpf',
    'mdb.tbClienteDadosComerciais.conjuge_RG',
  ],

  // ── Contact information ──────────────────────────────────────────────────

  contact: [
    'customers.phone',
    'customers.email',
    'vendors.phone',
    'vendors.email',
    'employees.phone',
    'employees.email',
    'mdb.tbCliente.cliFone1',
    'mdb.tbCliente.cliFone2',
    'mdb.tbCliente.cliFone3',
    'mdb.tbCliente.cliEmail',
    'mdb.tbFornecedor.forFone1',
    'mdb.tbFornecedor.forFone2',
    'mdb.tbFornecedor.forFone3',
    'mdb.tbFornecedor.forEmail',
    'mdb.tbClienteReferenciasBens.telefone1',
    'mdb.tbClienteReferenciasBens.telefone2',
    'orders.client_phones',
    'orders.client_email',
  ],

  email: [
    'customers.email',
    'vendors.email',
    'employees.email',
    'mdb.tbCliente.cliEmail',
    'mdb.tbFornecedor.forEmail',
  ],

  phone_br: [
    'customers.phone',
    'mdb.tbCliente.cliFone1',
    'mdb.tbCliente.cliFone2',
    'mdb.tbCliente.cliFone3',
    'mdb.tbFornecedor.forFone1',
    'mdb.tbFornecedor.forFone2',
    'mdb.tbFornecedor.forFone3',
    'mdb.tbClienteReferenciasBens.telefone1',
    'mdb.tbClienteReferenciasBens.telefone2',
    'orders.client_phones',
  ],

  // ── Address ──────────────────────────────────────────────────────────────

  address_br: [
    'customers.address',
    'customers.neighborhood',
    'customers.city',
    'customers.state',
    'customers.zip_code',
    'vendors.address',
    'vendors.neighborhood',
    'vendors.city',
    'vendors.state',
    'vendors.zip_code',
    'employees.address',
    'employees.city',
    'employees.state',
    'employees.zip_code',
    'mdb.tbCliente.CliEnd',
    'mdb.tbCliente.cliEnd_n',
    'mdb.tbCliente.cliCompl',
    'mdb.tbCliente.cliBairro',
    'mdb.tbCliente.cliCidade',
    'mdb.tbCliente.cliEstado',
    'mdb.tbCliente.cliCEP',
    'mdb.tbFornecedor.forEnd',
    'mdb.tbFornecedor.forBairro',
    'mdb.tbFornecedor.forCidade',
    'mdb.tbFornecedor.forEstado',
    'mdb.tbFornecedor.forCEP',
    'mdb.tbClienteDadosComerciais.endereco',
    'mdb.tbClienteDadosComerciais.cidade',
    'mdb.tbClienteDadosComerciais.estado',
  ],

  cep: [
    'customers.zip_code',
    'vendors.zip_code',
    'employees.zip_code',
    'mdb.tbCliente.cliCEP',
    'mdb.tbFornecedor.forCEP',
  ],

  // ── Vehicle identity ─────────────────────────────────────────────────────

  vehicle_id: [
    'vehicles.id',
    'vehicles.external_id',                          // carID
    'mdb.tbVeiculo.carID',
  ],

  vehicle_plate: [
    'vehicles.plate',
    'mdb.tbVeiculo.carPlaca',
  ],

  vin: [
    'vehicles.chassis',
    'mdb.tbVeiculo.carChassi',
    'mdb.tbNFe_prod.xProd',                          // NFe item description embeds VIN
  ],

  vehicle_model: [
    'vehicles.model',
    'mdb.tbVeiculo.carDescri',
    'mdb.tbNFe_prod.xProd',                          // richest natural-language description
    'orders.vehicle_description',                    // cliFormaPagto + carDescricao in tbPedidosClientes
    'mdb.tbPedidosClientes.carDescricao',
  ],

  vehicle_description_natural_language: [
    'mdb.tbNFe_prod.xProd',                          // e.g. "CHEVROLET MONTANA OFF ROAD 1.4 2011/2012 PRATA VIN:9BG..."
    'mdb.tbMovimento.movDescri',                     // e.g. "PAGAR VEÍCULO - MONTANA OFF ROAD - 04/04 - PRETA - Placa: ALR-7883/01"
    'mdb.tbVeiculo.carDescri',
  ],

  // ── Pricing ──────────────────────────────────────────────────────────────

  pricing: [
    'vehicles.purchase_price',
    'vehicles.sale_price',
    'mdb.tbVeiculo.carValorTabela',                  // FIPE table value
    'mdb.tbVeiculo.carValorCompra',                  // purchase cost
    'mdb.tbVeiculo.carValorWeb',                     // public web listing price
    'mdb.tbVeiculo.carValorMinimo',                  // floor / minimum sale price
    'mdb.tbDadosCompra.cValor',                      // actual purchase transaction amount
    'mdb.tbDadosVenda.vValorVenda',                  // actual sale transaction amount
    'mdb.tbDadosVenda.vSinal',                       // deposit paid
    'expenses.amount',
  ],

  fipe: [
    'mdb.tbVeiculo.carValorTabela',
  ],

  floor_price: [
    'mdb.tbVeiculo.carValorMinimo',
  ],

  public_price: [
    'mdb.tbVeiculo.carValorWeb',
  ],

  // ── Financial ledger ─────────────────────────────────────────────────────

  ledger_entry_id: [
    'expenses.external_id',
    'mdb.tbMovimento.movID',
  ],

  ledger_description: [
    'expenses.description',
    'mdb.tbMovimento.movDescri',
  ],

  payment_status: [
    'mdb.tbMovimento.movStatus',
    'mdb.tbFinanciamento.finStatus',
    'financings.status',
  ],

  // ── Commission & kickback ────────────────────────────────────────────────

  commission_structure: [
    'mdb.tbfuncionarioSalario.funComCompra1',
    'mdb.tbfuncionarioSalario.funComCompra2',
    'mdb.tbfuncionarioSalario.funComVenda1',
    'mdb.tbfuncionarioSalario.funComVenda2',
    'mdb.tbfuncionarioSalario.funComFinanciamento1',
    'mdb.tbfuncionarioSalario.funComFinanciamento2',
    'mdb.tbfuncionarioSalario.funComSeguro1',
    'mdb.tbfuncionarioSalario.funComSeguro2',
    'mdb.tbfuncionarioSalario.FunComDespachante1',
    'mdb.tbfuncionarioSalario.FunComDespachante2',
    'mdb.tbComissao.coPorcentual',
    'mdb.tbComissao.coValor',
    'commission_standards.percent',
    'commissions.amount',
  ],

  dealer_commission: [
    'mdb.tbFinanciamento.finIdxRetorno',
    'mdb.tbFinanciamento.finValorRec',
    'mdb.tbSeguro.segIdxRet',
    'mdb.tbSeguro.segValorRec',
  ],

  kickback: [
    'mdb.tbFinanciamento.finIdxRetorno',
    'mdb.tbFinanciamento.finValorRec',
    'mdb.tbFinanciamento.finDtRec',
    'mdb.tbRateioVeiculo.ratRetorno',
    'mdb.tbRateioVeiculo.ratPorcentagemFinanciamento',
  ],

  // ── Brazilian-specific regulatory & tax ─────────────────────────────────

  brazilian_tax_withholding: [
    'mdb.tbMovimento.movVrIR',
    'mdb.tbMovimento.movVrInss',
    'mdb.tbMovimento.movVrOutrosImpostos',
  ],

  brazilian_vehicle_tax: [
    'mdb.tbVeiculoDocumento.docIPVA',
    'mdb.tbVeiculoDocumentoCompra.docIPVA',
    'mdb.tbVeiculoProtocoloEntrega.chkIPVA',
    'mdb.tbVeiculoProtocoloEntrega.chkDPVAT',
  ],

  brazilian_financing_fee: [
    'mdb.tbFinanciamento.finTAC',
    'mdb.tbRateioVeiculo.ratTAC',
  ],

  brazilian_vehicle_compliance: [
    'mdb.tbVeiculoProtocoloEntrega.dtVencimentoGNV',
    'mdb.tbVeiculoProtocoloEntrega.chkInspecaoVeicular',
    'mdb.tbVeiculoProtocoloEntrega.chkLaudo',
    'mdb.tbVeiculoProtocoloEntrega.chkLicenciamento',
  ],

  brazilian_labor_id: [
    'mdb.tbFuncionario.funPIS',
    'mdb.tbFuncionario.funCT',
    'mdb.tbFuncionario.funCT_serie',
  ],

  // ── Employment & financial profile ───────────────────────────────────────

  employment: [
    'mdb.tbClienteDadosComerciais.empresaTrabalho',
    'mdb.tbClienteDadosComerciais.cnpj',
    'mdb.tbClienteDadosComerciais.cargo',
    'mdb.tbClienteDadosComerciais.dataAdmissao',
    'mdb.tbClienteDadosComerciais.RendaMensal',
    'mdb.tbClienteDadosComerciais.OutrasRendas',
  ],

  financial_profile: [
    'mdb.tbClienteDadosComerciais.RendaMensal',
    'mdb.tbClienteDadosComerciais.OutrasRendas',
    'mdb.tbClienteDadosComerciais.conjuge_RendaMensal',
    'mdb.tbClienteDadosComerciais.conjuge_OutrasRendas',
    'mdb.tbClienteReferenciasBens.banco1',
    'mdb.tbClienteReferenciasBens.agencia1',
    'mdb.tbClienteReferenciasBens.conta1',
    'mdb.tbClienteReferenciasBens.bens1_tipo',
    'mdb.tbClienteReferenciasBens.bens1_valorAtual',
    'customer_complements.monthly_income',
  ],

  spouse_profile: [
    'mdb.tbClienteDadosComerciais.conjuge_Nome',
    'mdb.tbClienteDadosComerciais.conjuge_cpf',
    'mdb.tbClienteDadosComerciais.conjuge_RG',
    'mdb.tbClienteDadosComerciais.conjuge_dtNasc',
    'mdb.tbClienteDadosComerciais.conjuge_sexo',
    'mdb.tbClienteDadosComerciais.conjuge_empresaTrabalho',
    'mdb.tbClienteDadosComerciais.conjuge_empresaCNPJ',
    'mdb.tbClienteDadosComerciais.conjuge_cargo',
    'mdb.tbClienteDadosComerciais.conjuge_dataAdmissao',
    'mdb.tbClienteDadosComerciais.conjuge_Nacionalidade',
    'mdb.tbClienteDadosComerciais.conjuge_Naturalidade',
    'mdb.tbClienteDadosComerciais.conjuge_RendaMensal',
    'mdb.tbClienteDadosComerciais.conjuge_OutrasRendas',
  ],

  personal_reference: [
    'mdb.tbClienteReferenciasBens.nome1',
    'mdb.tbClienteReferenciasBens.afinidade1',
    'mdb.tbClienteReferenciasBens.telefone1',
    'mdb.tbClienteReferenciasBens.nome2',
    'mdb.tbClienteReferenciasBens.afinidade2',
    'mdb.tbClienteReferenciasBens.telefone2',
  ],

  asset_declaration: [
    'mdb.tbClienteReferenciasBens.bens1_tipo',
    'mdb.tbClienteReferenciasBens.bens1_descricao',
    'mdb.tbClienteReferenciasBens.bens1_valorAtual',
    'mdb.tbClienteReferenciasBens.bens1_onus',
    'mdb.tbClienteReferenciasBens.bens1_credor',
    'mdb.tbClienteReferenciasBens.bens2_tipo',
    'mdb.tbClienteReferenciasBens.bens2_descricao',
    'mdb.tbClienteReferenciasBens.bens2_valorAtual',
    'mdb.tbClienteReferenciasBens.bens2_onus',
    'mdb.tbClienteReferenciasBens.bens2_credor',
    'mdb.tbClienteReferenciasBens.bens3_tipo',
    'mdb.tbClienteReferenciasBens.bens3_descricao',
    'mdb.tbClienteReferenciasBens.bens3_valorAtual',
    'mdb.tbClienteReferenciasBens.bens3_onus',
    'mdb.tbClienteReferenciasBens.bens3_credor',
  ],

  bank_account: [
    'bank_accounts.id',
    'bank_accounts.agency',
    'bank_accounts.account',
    'mdb.tbContasCorrentes.ccID',
    'mdb.tbContasCorrentes.ccBanco',
    'mdb.tbContasCorrentes.ccAgencia',
    'mdb.tbContasCorrentes.ccConta',
    'mdb.tbClienteReferenciasBens.banco1',
    'mdb.tbClienteReferenciasBens.agencia1',
    'mdb.tbClienteReferenciasBens.conta1',
    'mdb.tbClienteReferenciasBens.banco2',
    'mdb.tbClienteReferenciasBens.agencia2',
    'mdb.tbClienteReferenciasBens.conta2',
  ],

  // ── Legal documents & templates ──────────────────────────────────────────

  legal_template: [
    'mdb.tbCadastroTextos.txtTexto',
    'mdb.tbCadastroTextos.txtDescri',
    'text_configurations.content',
    'text_configurations.key',
  ],

  portuguese_contract: [
    'mdb.tbCadastroTextos.txtTexto',
    'text_configurations.content',
  ],

  // ── Vehicle document checklists ──────────────────────────────────────────

  checklist_item: [
    'mdb.tbVeiculoDocumento.docChkCPF',
    'mdb.tbVeiculoDocumento.docChkRG',
    'mdb.tbVeiculoDocumento.docChkComprovante',
    'mdb.tbVeiculoDocumento.docChkChassi',
    'mdb.tbVeiculoDocumento.docChkRecibo',
    'mdb.tbVeiculoDocumento.docChkDUT',
    'mdb.tbVeiculoDocumento.docChkMultasPagas',
    'mdb.tbVeiculoDocumento.docChkMotor',
    'mdb.tbVeiculoDocumento.docLaudoMotor',
    'mdb.tbVeiculoProtocoloEntrega.chkCRLV',
    'mdb.tbVeiculoProtocoloEntrega.chkDUT',
    'mdb.tbVeiculoProtocoloEntrega.chkLicenciamento',
    'mdb.tbVeiculoProtocoloEntrega.chkIPVA',
    'mdb.tbVeiculoProtocoloEntrega.chkDPVAT',
    'mdb.tbVeiculoProtocoloEntrega.chkQuitacao',
    'mdb.tbVeiculoProtocoloEntrega.chkCarne',
    'mdb.tbVeiculoProtocoloEntrega.chkProcuracao',
    'mdb.tbVeiculoProtocoloEntrega.chkValePlacas',
    'mdb.tbVeiculoProtocoloEntrega.chkValeTarjetas',
    'mdb.tbVeiculoProtocoloEntrega.chkVencimentoGNV',
    'mdb.tbVeiculoProtocoloEntrega.chkInspecaoVeicular',
    'mdb.tbVeiculoProtocoloEntrega.chkLaudo',
    'mdb.tbVeiculoProtocoloEntrega.chkNotaFiscal',
    'mdb.tbVeiculoProtocoloEntrega.chkOutros1',
    'mdb.tbVeiculoProtocoloEntrega.chkOutros2',
    'vehicle_delivery_protocols.delivered_documents',
    'vehicle_documents.checklist_items',
  ],

  // ── Consent ──────────────────────────────────────────────────────────────

  consent: [
    'mdb.tbCliente.cliOpt_in',
  ],

  // ── Sale / acquisition channel ───────────────────────────────────────────

  customer_acquisition_source: [
    'customers.source',
    'mdb.tbDadosVenda.vOrigemCliente',
    'mdb.tbOrigemCliente.oriDescri',
    'customer_origins.name',
  ],
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Return all field paths indexed under a given canonical tag.
 * Returns an empty array for unknown tags.
 */
export function getTaggedFields(tag: CanonicalTag): FieldPath[] {
  return CANONICAL_TAGS[tag] ?? []
}

/**
 * Return all canonical tags associated with a given field path.
 * Useful for building inverted indices.
 */
export function getFieldTags(fieldPath: FieldPath): CanonicalTag[] {
  return Object.entries(CANONICAL_TAGS)
    .filter(([, paths]) => paths.includes(fieldPath))
    .map(([tag]) => tag)
}

/** All defined canonical tag names, for validation. */
export const ALL_TAGS = Object.keys(CANONICAL_TAGS) as CanonicalTag[]
