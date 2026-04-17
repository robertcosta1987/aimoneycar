/**
 * packages/moneycar-schema/src/moneycar-enum-groups.ts
 * Auto-derived from: estrutura_banco_de_dados_moneycar.xlsx
 *
 * Every FK to tbEnumGeral carries an implicit enumTipo (group number).
 * The referencing column's meaning dictates which group to filter on.
 * Query pattern: SELECT * FROM tbEnumGeral WHERE enumID = <value> AND enumTipo = ENUM_GROUPS.<key>
 *
 * DO NOT hand-edit. If the spreadsheet changes, update this registry.
 */

export const ENUM_GROUPS = {
  gender:                       0,   // tbCliente.cliSexo, tbFornecedor.cliSexo
  client_status:                1,   // tbCliente.cliStatus
  vehicle_category:             2,   // tbVeiculo.carTipo
  vehicle_status:               3,   // tbVeiculo.carStatus
  manufacturer_category:        4,   // tbFabricantes.fabTipo
  movement_status:              5,   // tbMovimento.movStatus
  supplier_status:              6,   // tbFornecedor.forStatus
  supplier_role:                7,   // tbFornecedor.forTipo (INTERNO=employee, DESPACHANTE, FINANCEIRA, CORRETORAS, PREST.SERVIÇO)
  commission_type:              8,   // tbComissao.coTipo, tbComissaoPadrao.coTipo
  insurance_payment_type:       9,   // tbSeguro.segTipoRet
  document_text_type:          10,   // tbCadastroTextos.txtTipo
  payment_method:              11,   // tbDadosCompra.cFormaPagamento, tbDadosVenda.vFormaPagamento
  brazilian_state:             12,   // tbCliente.cliEstado, tbFornecedor.forEstado
  vehicle_origin:              13,   // tbVeiculo.carNacionalidade (nacional/importado)
  movement_sign:               14,   // tbMovimento.movSinal (crédito/débito)
  transaction_modality:        15,   // tbComissao.coModalidade
  movement_classification:     16,   // tbMovimento.movClassificacao
  interest_type:               17,
  correction_days:             18,
  report_detail_level:         19,
  month:                       20,
  movement_payment_status:     21,
  boolean_yesno:               22,
  fine_type:                   23,   // tbVeiculoMulta type
  pendency_type:               24,   // tbVeiculoPendencia type
  correction_index:            25,
  envelope_type:               26,
  attachment_type:             27,
  user_type:                   28,
  cancellation_reason:         29,
  periodicity:                 30,
  vehicle_return:              31,   // tbVeiculo.carStatus when returned
  standard_expense_status:     32,
  standard_expense_type:       33,
  cancellation_status:         34,
  log_event:                   35,
  link_query_status:           36,
  flag_signal:                 37,
  bank_account_type:           38,   // tbContasCorrentes.ccTipo
  financial_status:            39,   // tbFinanciamento status
  installment_payment_method:  40,   // tbRateioVeiculo.Tipo1..10
  option_group:                41,   // tbOpcionais.optGrupo
  supplier_attachment:         42,
  customer_order_status:       50,   // tbPedidosClientes.statusID
  dre_type:                    60,
  commission_standard_status:  70,   // tbComissaoPadrao.coStatus
  customer_order_type:         80,   // tbPedidosClientes.tipoPedido
  nfe_cfop_type:              300,
  pendency_target:            400,   // tbVeiculoPendencia.pednTipo
  email_template_type:        500,
  marital_status:             600,   // tbClienteComplemento.estadoCivil
  education_level:            630,   // tbClienteComplemento.escolaridade
  residence_type:             650,   // tbClienteComplemento.tipoResidencia
  residence_duration:         670,   // tbClienteComplemento.tempoResidencia
  messenger_status:           700,
  required_fields:            710,
  icms_exemption_reason:      720,
  signature_recognition:      740,
} as const

export type EnumGroup = keyof typeof ENUM_GROUPS
export type EnumGroupValue = (typeof ENUM_GROUPS)[EnumGroup]

/**
 * Well-known forTipo values (tbFornecedor.forTipo → supplier_role group).
 * Use these to filter tbFornecedor into role-specific views.
 */
export const SUPPLIER_ROLES = {
  EMPLOYEE:         'INTERNO',       // Internal employee (also in tbFuncionario)
  DISPATCHER:       'DESPACHANTE',   // Vehicle registration dispatcher
  FINANCING_CO:     'FINANCEIRA',    // Financing company / bank
  INSURANCE_BROKER: 'CORRETORAS',    // Insurance broker
  SERVICE_PROVIDER: 'PREST.SERVIÇO', // External service provider
} as const
