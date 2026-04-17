/**
 * EnumRegistry — centralized decoder for tbEnumGeral
 *
 * tbEnumGeral is a single polymorphic lookup table in the Moneycar MDB schema.
 * Every integer "code" field in other tables that resolves through tbEnumGeral
 * is keyed here by (enumTipo, enumID) → human label.
 *
 * Usage:
 *   resolveEnum(2, 6)  // → "NOVO"
 *   resolveEnum(7, 25) // → "FINANCEIRA"
 *
 * Source: observed rows from Silvecar (empID=582) dump, 2026-04-13.
 * When importing a new tenant's MDB, call `mergeEnumRows()` to extend with
 * tenant-specific labels; do NOT overwrite existing entries.
 */

export type EnumLabel = string
export type EnumGroup = Record<number, EnumLabel>

/** enumTipo → { enumID → label } */
export const ENUM_REGISTRY: Record<number, EnumGroup> = {
  /** Gender (client / party) */
  0: {
    1: 'MASCULINO',
    2: 'FEMININO',
    3: 'PESSOA JURÍDICA',
  },

  /** Client status */
  1: {
    3: 'ATIVO',
    4: 'INATIVO',
  },

  /** Vehicle category (type × condition) */
  2: {
    6:  'NOVO',
    7:  'SEMI-NOVO',
    8:  'BLINDADO',
    9:  'SINISTRADO',
    10: 'CARRO',
    11: 'MOTO',
    12: 'CAMINHÃO',
    13: 'UTILITÁRIO',
    14: 'CAMIONETE',
    15: 'MÁQUINA',
    16: 'NÁUTICA',
    17: 'ÔNIBUS',
  },

  /** Vehicle status */
  3: {
    10: 'DISPONÍVEL',
    11: 'VENDIDO',
    12: 'DEVOLVIDO',
  },

  /** Manufacturer category */
  4: {
    12: 'VEÍCULO PASSEIO',
    13: 'UTILITÁRIO',
    14: 'MOTO',
    15: 'CAMINHÃO',
  },

  /** Movement/financial-entry status (payment state) */
  5: {
    16: 'PREVISAO',
    17: 'CADASTRO',
    18: 'EMITIDO',
    19: 'CANCELADO',
  },

  /** Supplier/party status */
  6: {
    20: 'ATIVO',
    21: 'INATIVO',
  },

  /**
   * Supplier/party role — CRITICAL for tbFornecedor polymorphism.
   * Use forTipo to filter: DESPACHANTE, FINANCEIRA, CORRETORAS, employee roles.
   */
  7: {
    22: 'INTERNO',
    23: 'INTERNO',
    24: 'DESPACHANTE',
    25: 'FINANCEIRA',
    26: 'FORNECEDOR',
    27: 'CORRETORAS',
    28: 'PREST.SERVIÇO',
    29: 'CLIENTE',
  },

  /** Commission type */
  8: {
    30: '% LUCRO',
    31: 'VALOR FIXO',
    32: '% VALOR',
  },

  /** Insurance payment type */
  9: {
    33: 'A VISTA',
    34: 'A PRAZO',
  },

  /** Document / legal text type (tbCadastroTextos.txtTipo) */
  10: {
    35: 'CONSIGNAÇÃO',
    36: 'DISTRATO',
    37: 'GARANTIA',
    38: 'PROCURAÇÃO',
    39: 'RECIBO DE COMPRA',
    40: 'RECIBO DE VENDA',
    41: 'TERMO DE RESPONSABILIDADE',
  },

  /** Payment method */
  11: {
    42: 'BOLETO',
    43: 'CARTÃO',
    44: 'CHEQUE',
    45: 'DEPÓSITO EM C/C',
    46: 'DINHEIRO',
  },

  /**
   * Brazilian state code.
   * ID 72 = "SP" is the most common in Silvecar dump.
   * Full 27-state set; IDs may vary per tenant dump.
   */
  12: {
    47: 'AC', 48: 'AL', 49: 'AM', 50: 'AP', 51: 'BA', 52: 'CE',
    53: 'DF', 54: 'ES', 55: 'GO', 56: 'MA', 57: 'MG', 58: 'MS',
    59: 'MT', 60: 'PA', 61: 'PB', 62: 'PE', 63: 'PI', 64: 'PR',
    65: 'RJ', 66: 'RN', 67: 'RO', 68: 'RR', 69: 'RS', 70: 'SC',
    71: 'SE', 72: 'SP', 73: 'TO',
  },

  /** Vehicle origin */
  13: {
    74: 'IMPORTADO',
    75: 'NACIONAL',
  },

  /**
   * Movement sign (debit / credit).
   * WARNING: Some historical rows encode supplier-role codes (e.g. 79) in
   * this field due to a legacy overload. Confirm against actual value before
   * resolving; fall back to raw integer if not found in this group.
   */
  14: {
    76: 'CRÉDITO',
    77: 'DÉBITO',
  },

  /** Transaction modality */
  15: {
    78: 'COMPRA',
    79: 'VENDA',
    80: 'FINANCIAMENTO',
    81: 'SEGURO',
    82: 'DESPACHANTE',
  },

  /** Movement classification */
  16: {
    83: 'DESPESA',
    84: 'DESPESA PADRÃO',
    85: 'INVESTIMENTO',
  },

  /** Interest type */
  17: {
    86: 'SIMPLES',
    87: 'COMPOSTO',
  },

  /** Month names (used in periodic reporting) */
  20: {
    88:  'JANEIRO',
    89:  'FEVEREIRO',
    90:  'MARÇO',
    91:  'ABRIL',
    92:  'MAIO',
    93:  'JUNHO',
    94:  'JULHO',
    95:  'AGOSTO',
    96:  'SETEMBRO',
    97:  'OUTUBRO',
    98:  'NOVEMBRO',
    99:  'DEZEMBRO',
  },

  /** Movement payment status */
  21: {
    100: 'ABERTO',
    101: 'PAGO',
  },

  /** Boolean yes/no (used when a boolean is stored as an enum FK) */
  22: {
    102: 'SIM',
    103: 'NÃO',
  },

  /** Cancellation reason */
  29: {
    104: 'FALTA DE SINAL',
    105: 'PARCELA ALTA',
    106: 'INTERESSE EM OUTRO VEÍCULO',
    107: 'FICHA NÃO APROVADA',
    108: 'OUTROS',
  },

  /** Bank account type */
  38: {
    109: 'CONTA CORRENTE',
    110: 'POUPANÇA',
    111: 'CARTÃO DE CRÉDITO',
    112: 'INVESTIMENTO',
    113: 'CAPTAÇÃO',
    114: 'INTERNO',
  },

  /** Financial / installment status */
  39: {
    115: 'ABERTO',
    116: 'PAGO',
    117: 'CANCELADO',
    118: 'CONCILIADO',
  },

  /** Installment payment method (tbRateioVeiculo.Tipo{1..10}) */
  40: {
    119: 'DINHEIRO',
    120: 'CHEQUE',
    121: 'CARTÃO CRÉDITO',
    122: 'CARTÃO DÉBITO',
    123: 'OUTROS',
  },

  /** Optional-feature group (tbOpcionais.optGrupo) */
  41: {
    124: 'GERAL',
    125: 'INTERNO',
    126: 'EXTERNO',
    127: 'MECÂNICA',
    128: 'MOTOR/CÂMBIO',
    129: 'CAMINHÕES/ÔNIBUS',
    130: 'OUTROS',
  },

  /** Customer order status */
  50: {
    131: 'EM ABERTO',
    132: 'ATENDIDO',
    133: 'CANCELADO',
  },

  /** Customer order type */
  80: {
    134: 'ATENDIMENTO',
    135: 'OFERTA',
    136: 'PROCURA',
  },

  /** Pendency responsible party */
  400: {
    137: 'CLIENTE',
    138: 'DESPACHANTE',
    139: 'FINANCEIRA',
    140: 'FORNECEDOR',
    141: 'CORRETORA',
    142: 'FUNCIONÁRIO',
    143: 'OUTROS',
  },

  /** Marital status */
  600: {
    144: 'SOLTEIRO(A)',
    145: 'CASADO(A)',
    146: 'DIVORCIADO(A)',
    147: 'VIÚVO(A)',
    148: 'SEPARADO(A)',
    149: 'AMASIADO(A)',
  },

  /** Education level */
  630: {
    150: 'FUNDAMENTAL INCOMPLETO',
    151: 'FUNDAMENTAL COMPLETO',
    152: 'MÉDIO INCOMPLETO',
    153: 'MÉDIO COMPLETO',
    154: 'SUPERIOR INCOMPLETO',
    155: 'SUPERIOR COMPLETO',
    156: 'PÓS-GRADUAÇÃO INCOMPLETO',
    157: 'PÓS-GRADUAÇÃO COMPLETO',
  },

  /** Residence type */
  650: {
    158: 'PRÓPRIA',
    159: 'ALUGADA',
    160: 'FINANCIADA',
    161: 'FAMILIAR',
    162: 'FUNCIONAL',
    163: 'REPÚBLICA',
    164: 'TERCEIROS',
  },

  /** Residence duration */
  670: {
    165: 'ATÉ 1 ANO',
    166: 'DE 1 A 2 ANOS',
    167: 'DE 3 A 5 ANOS',
    168: 'MAIS DE 5 ANOS',
  },

  /** ICMS exemption reason (NFe) */
  720: {
    169: 'TÁXI',
    170: 'DEFICIENTE FÍSICO',
    171: 'PRODUTOR AGROPECUÁRIO',
    172: 'FROTISTA/LOCADORA',
    173: 'DIPLOMÁTICO/CONSULAR',
    174: 'OUTROS',
  },
}

// ─── Domain metadata ──────────────────────────────────────────────────────────

export interface EnumDomainMeta {
  name: string
  description: string
}

export const ENUM_DOMAINS: Record<number, EnumDomainMeta> = {
  0:   { name: 'gender',                    description: 'Gender / entity type for clients and parties' },
  1:   { name: 'client_status',             description: 'Whether the client record is active or inactive' },
  2:   { name: 'vehicle_category',          description: 'Vehicle type and condition category' },
  3:   { name: 'vehicle_status',            description: 'Current disposition of a vehicle' },
  4:   { name: 'manufacturer_category',     description: 'Class of vehicles produced by a manufacturer' },
  5:   { name: 'movement_status',           description: 'Ledger entry state (financial entry state)' },
  6:   { name: 'supplier_status',           description: 'Whether a supplier/party record is active' },
  7:   { name: 'supplier_role',             description: 'Role of a tbFornecedor party (dispatcher, bank, broker, employee…)' },
  8:   { name: 'commission_type',           description: 'How a commission is calculated' },
  9:   { name: 'insurance_payment_type',    description: 'Whether insurance premium is paid upfront or in installments' },
  10:  { name: 'document_text_type',        description: 'Legal document template category in tbCadastroTextos' },
  11:  { name: 'payment_method',            description: 'Generic payment method (boleto, card, cash…)' },
  12:  { name: 'brazilian_state',           description: 'Brazilian UF code stored as integer FK' },
  13:  { name: 'vehicle_origin',            description: 'Whether a vehicle is domestic or imported' },
  14:  { name: 'movement_sign',             description: 'Debit or credit direction of a ledger entry' },
  15:  { name: 'transaction_modality',      description: 'Business context of a transaction' },
  16:  { name: 'movement_classification',   description: 'Accounting classification of a movement' },
  17:  { name: 'interest_type',             description: 'Simple vs compound interest calculation' },
  20:  { name: 'month',                     description: 'Calendar month name (reporting use)' },
  21:  { name: 'movement_payment_status',   description: 'Whether a ledger entry has been paid' },
  22:  { name: 'boolean_yesno',             description: 'Boolean stored as enum FK (SIM/NÃO)' },
  29:  { name: 'cancellation_reason',       description: 'Why a deal or order was cancelled' },
  38:  { name: 'bank_account_type',         description: 'Type of bank/financial account' },
  39:  { name: 'financial_status',          description: 'Full financial lifecycle status including reconciliation' },
  40:  { name: 'installment_payment_method',description: 'Payment method per installment in tbRateioVeiculo' },
  41:  { name: 'option_group',              description: 'Feature group for vehicle optional equipment' },
  50:  { name: 'customer_order_status',     description: 'Pipeline status of a customer want-list entry' },
  80:  { name: 'customer_order_type',       description: 'Type of customer order / pipeline entry' },
  400: { name: 'pendency_target',           description: 'Which party is responsible for resolving a vehicle pendency' },
  600: { name: 'marital_status',            description: 'Marital status of a client or party individual' },
  630: { name: 'education_level',           description: 'Highest education level completed' },
  650: { name: 'residence_type',            description: 'Type of client residence (owned, rented…)' },
  670: { name: 'residence_duration',        description: 'How long client has lived at current address' },
  720: { name: 'icms_exemption_reason',     description: 'Reason for ICMS tax exemption on vehicle sale' },
}

// ─── Runtime helpers ──────────────────────────────────────────────────────────

/**
 * Resolve an enum FK integer to its human label.
 * Returns the raw integer string when no mapping is found so callers never
 * receive `undefined`.
 *
 * @param enumTipo  The group/domain key (e.g. 7 for supplier_role)
 * @param enumId    The row ID within that group
 */
export function resolveEnum(enumTipo: number, enumId: number | null | undefined): string {
  if (enumId == null) return ''
  return ENUM_REGISTRY[enumTipo]?.[enumId] ?? String(enumId)
}

/**
 * Merge tenant-specific tbEnumGeral rows into the registry at runtime.
 * Existing entries are preserved; new entries extend the group.
 * Call this after loading the MDB for a new tenant.
 *
 * @param rows  Raw rows from tbEnumGeral: { enuTipo, enuID, enuDescri }
 */
export function mergeEnumRows(rows: Array<{ enuTipo: number; enuID: number; enuDescri: string }>) {
  for (const row of rows) {
    if (!ENUM_REGISTRY[row.enuTipo]) ENUM_REGISTRY[row.enuTipo] = {}
    if (ENUM_REGISTRY[row.enuTipo][row.enuID] === undefined) {
      ENUM_REGISTRY[row.enuTipo][row.enuID] = row.enuDescri
    }
  }
}
