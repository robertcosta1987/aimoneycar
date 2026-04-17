/**
 * Silvecar (empID=582) — Translation Layer Extension
 *
 * Source: Moneycar-582-Silvecar-2026-04-13_-_sem_visao_geral.mdb
 * Tenant: Silverio Multimarcas Com. de Autom. Ltda ME
 * CNPJ: 09.210.753/0001-04 | Location: Sorocaba/SP
 * Tables: 43 | Approx. rows: 1.1 M
 *
 * Design rules:
 *  - Do NOT rewrite existing mappings. This file only ADDS or ALIASES.
 *  - Existing semantic names in MONEYCAR_AI_FIELD_MAP.md are preserved as-is.
 *  - Free-text Portuguese values stay in Portuguese; only field metadata is English.
 *  - Every int FK field whose name ends in Status/Tipo/Estado/Origem/Classificacao/
 *    Modalidade/Sinal/Sexo is tagged with its enumTipo so the runtime can resolve it.
 *
 * Usage:
 *   import { FIELD_MAP } from './silvecar-582-extension'
 *   const descriptor = FIELD_MAP.tbCliente.fields['cliCNH']
 *   // → { semantic_name: 'driver_license_number', indexable_as: ['personal_document', 'driver_license', 'brazilian_id'], … }
 */

import { resolveEnum } from './enum-registry'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldDescriptor {
  /** Raw column name in the MDB / source database. */
  original_name: string
  /** LLM-readable snake_case name. */
  semantic_name: string
  /**
   * Observed content pattern from real rows.
   * Be specific: include format, examples, length, encoding notes.
   */
  content_signature: string
  /** Canonical tag(s) for semantic retrieval (see canonical-tags.ts). */
  indexable_as: string[]
  /**
   * If the field is an integer FK that resolves through tbEnumGeral,
   * set the enumTipo here. The runtime accessor will call resolveEnum().
   */
  enum_type?: number
  /** If the field is a FK to another MDB table, name it here. */
  fk_table?: string
  /** Alias / additional semantic names for backward compatibility. */
  aliases?: string[]
  /** Notes for edge cases, historical quirks, or polymorphism warnings. */
  notes?: string
}

export interface TableDescriptor {
  mdb_table: string
  supabase_table?: string
  semantic_name: string
  description: string
  row_count_approx: number
  fields: Record<string, FieldDescriptor>
}

// ─── resolve helper exposed for runtime use ───────────────────────────────────

/**
 * Resolve a field value to its human label when the field has enum_type set.
 * Falls back to the raw value if no mapping exists.
 */
export function resolveFieldValue(descriptor: FieldDescriptor, rawValue: number | null | undefined): string {
  if (descriptor.enum_type !== undefined) return resolveEnum(descriptor.enum_type, rawValue ?? null)
  return rawValue == null ? '' : String(rawValue)
}

// ─── Party resolver ───────────────────────────────────────────────────────────

export interface Party {
  id: number
  name: string
  role: string            // resolved from enumTipo=7
  tax_id: string
  is_individual: boolean  // true when the party is a person, not a company
}

/**
 * Build a Party object from a tbFornecedor row, resolving forTipo.
 * Pass the full row object from the MDB; the function reads forID, forRazSoc,
 * forFantasia, forCNPJ, forTipo, and the individual fields (cliSexo etc.).
 */
export function resolveParty(row: Record<string, any>, role?: string): Party {
  const resolvedRole = role ?? resolveEnum(7, row.forTipo)
  return {
    id:           row.forID,
    name:         String(row.forRazSoc ?? row.forFantasia ?? row.forNome ?? ''),
    role:         resolvedRole,
    tax_id:       String(row.forCNPJ ?? ''),
    is_individual: !!row.cliDtNasc || resolvedRole === 'FUNCIONÁRIO',
  }
}

// ─── Field map ────────────────────────────────────────────────────────────────

export const FIELD_MAP: Record<string, TableDescriptor> = {

  // ────────────────────────────────────────────────────────────────────────────
  // tbCliente — customer master (13,232 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbCliente: {
    mdb_table: 'tbCliente',
    supabase_table: 'customers',
    semantic_name: 'customer_master',
    description: 'Primary client/customer directory. One row per individual or company that interacted with the dealership.',
    row_count_approx: 13232,
    fields: {
      cliid: {
        original_name: 'cliid',
        semantic_name: 'client_id',
        content_signature: 'Auto-increment integer, primary key. NOTE: column is lowercase "cliid", NOT "cliID".',
        indexable_as: ['party_id'],
      },
      cliNome: {
        original_name: 'cliNome',
        semantic_name: 'client_full_name',
        content_signature: 'Uppercase Brazilian full name, e.g. "JOSE APARECIDO LEITE DE SOUZA", "MARIA DA SILVA LTDA".',
        indexable_as: ['person_name'],
      },
      cliStatus: {
        original_name: 'cliStatus',
        semantic_name: 'client_status_code',
        content_signature: 'Integer FK → enumTipo=1. 3=ATIVO, 4=INATIVO.',
        indexable_as: [],
        enum_type: 1,
      },
      cliEmail: {
        original_name: 'cliEmail',
        semantic_name: 'client_email',
        content_signature: 'Free-text email address, often lowercase. Null when not provided.',
        indexable_as: ['contact', 'email'],
      },
      cliFone1: {
        original_name: 'cliFone1',
        semantic_name: 'client_phone_primary',
        content_signature: 'Brazilian phone number (landline or mobile) OR Nextel radio ID (e.g. "89*19154", "55*93*120222"). Mixed formats; no consistent mask.',
        indexable_as: ['contact', 'phone_br'],
        notes: 'Sibling cliFone1Compl holds a label describing line type: RESIDENCIA, CELULAR, NEXTEL, COMERCIAL.',
      },
      cliFone2: {
        original_name: 'cliFone2',
        semantic_name: 'client_phone_secondary',
        content_signature: 'Same format as cliFone1. Often empty.',
        indexable_as: ['contact', 'phone_br'],
      },
      cliFone3: {
        original_name: 'cliFone3',
        semantic_name: 'client_phone_tertiary',
        content_signature: 'Same format as cliFone1. Often empty.',
        indexable_as: ['contact', 'phone_br'],
      },
      cliFone1Compl: {
        original_name: 'cliFone1Compl',
        semantic_name: 'client_phone_primary_label',
        content_signature: 'Free-text line-type label, e.g. "RESIDENCIA", "CELULAR", "NEXTEL", "COMERCIAL".',
        indexable_as: [],
      },
      cliFone2Compl: {
        original_name: 'cliFone2Compl',
        semantic_name: 'client_phone_secondary_label',
        content_signature: 'Same as cliFone1Compl.',
        indexable_as: [],
      },
      cliCNPJ_CPF: {
        original_name: 'cliCNPJ_CPF',
        semantic_name: 'client_tax_id',
        content_signature: 'Single field holding either CPF ("309.068.808-58", 14 chars with mask, 11 digits) or CNPJ (18 chars with mask, 14 digits). Detect by stripped digit length: 11=CPF, 14=CNPJ.',
        indexable_as: ['brazilian_id', 'tax_id'],
        notes: 'Do NOT split at import time if preserving raw MDB. The importMdb.ts already disambiguates CPF vs CNPJ by digit count.',
      },
      cliRG_IE: {
        original_name: 'cliRG_IE',
        semantic_name: 'client_id_document',
        content_signature: 'RG (Registro Geral, individuals) or IE (Inscrição Estadual, companies). Free-text, variable format.',
        indexable_as: ['brazilian_id', 'personal_document'],
      },
      cliCNH: {
        original_name: 'cliCNH',
        semantic_name: 'driver_license_number',
        content_signature: '11-digit numeric string (Brazilian CNH format). Often null.',
        indexable_as: ['personal_document', 'driver_license', 'brazilian_id'],
      },
      cliCNH_Categoria: {
        original_name: 'cliCNH_Categoria',
        semantic_name: 'driver_license_category',
        content_signature: 'Short string: "A", "AB", "B", "C", "D", "E". Often null.',
        indexable_as: ['driver_license'],
      },
      CliEnd: {
        original_name: 'CliEnd',
        semantic_name: 'address_street',
        content_signature: 'Street name (without number), e.g. "RUA PADRE JOSE BONIFACIO". NOTE: column is capitalized "CliEnd", not "cliEnd".',
        indexable_as: ['address_br'],
      },
      cliEnd_n: {
        original_name: 'cliEnd_n',
        semantic_name: 'address_number',
        content_signature: 'Street number as string, e.g. "123", "S/N".',
        indexable_as: ['address_br'],
      },
      cliCompl: {
        original_name: 'cliCompl',
        semantic_name: 'address_complement',
        content_signature: 'Apartment / block / unit complement, e.g. "APTO 12", "BLOCO B".',
        indexable_as: ['address_br'],
      },
      cliBairro: {
        original_name: 'cliBairro',
        semantic_name: 'address_neighborhood',
        content_signature: 'Neighborhood name in uppercase.',
        indexable_as: ['address_br'],
      },
      cliCidade: {
        original_name: 'cliCidade',
        semantic_name: 'address_city',
        content_signature: 'City name in uppercase, e.g. "SOROCABA", "SAO PAULO".',
        indexable_as: ['address_br'],
      },
      cliEstado: {
        original_name: 'cliEstado',
        semantic_name: 'client_state_code',
        content_signature: 'Integer FK → enumTipo=12. Most common: 72=SP. Resolves to 2-letter UF code.',
        indexable_as: ['address_br'],
        enum_type: 12,
      },
      cliCEP: {
        original_name: 'cliCEP',
        semantic_name: 'client_postal_code',
        content_signature: 'Brazilian CEP, 8 digits, may include mask "18060-350" or unmasked "18060350".',
        indexable_as: ['address_br', 'cep'],
      },
      cliDtNasc: {
        original_name: 'cliDtNasc',
        semantic_name: 'date_of_birth',
        content_signature: 'Date value. Often stored as Access Date/Time; importMdb.ts parses to ISO string.',
        indexable_as: [],
      },
      cliSexo: {
        original_name: 'cliSexo',
        semantic_name: 'gender_code',
        content_signature: 'Integer FK → enumTipo=0. 1=MASCULINO, 2=FEMININO, 3=PESSOA JURÍDICA.',
        indexable_as: [],
        enum_type: 0,
      },
      cliOpt_in: {
        original_name: 'cliOpt_in',
        semantic_name: 'marketing_opt_in',
        content_signature: 'Boolean (Access Yes/No). True = client consented to marketing communications.',
        indexable_as: ['consent'],
      },
      cliOBS: {
        original_name: 'cliOBS',
        semantic_name: 'client_notes',
        content_signature: 'Free-text memo field, arbitrary length. Portuguese.',
        indexable_as: [],
        notes: 'NOTE: column is "cliOBS" (uppercase OBS), NOT "cliObservacoes" or "cliObs".',
      },
      empID: {
        original_name: 'empID',
        semantic_name: 'tenant_id',
        content_signature: 'Integer company/tenant identifier. Always 582 in this dump (Silvecar). Do NOT hard-code 582 in production logic.',
        indexable_as: [],
        notes: 'Use as multi-tenant discriminator only; never expose in LLM responses.',
      },
      oriID: {
        original_name: 'oriID',
        semantic_name: 'acquisition_source_id',
        content_signature: 'Integer FK → tbOrigemCliente. Null in most Silvecar rows; use tbDadosVenda.vOrigemCliente instead.',
        indexable_as: ['customer_acquisition_source'],
        fk_table: 'tbOrigemCliente',
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbClienteComplemento — client enrichment (163 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbClienteComplemento: {
    mdb_table: 'tbClienteComplemento',
    supabase_table: 'customer_complements',
    semantic_name: 'customer_personal_profile',
    description: 'Extended personal data for clients: occupation, nationality, marital status, education, residence.',
    row_count_approx: 163,
    fields: {
      cliID: {
        original_name: 'cliID',
        semantic_name: 'client_id_fk',
        content_signature: 'Integer FK → tbCliente.cliid.',
        indexable_as: ['party_id'],
        fk_table: 'tbCliente',
      },
      profissao: {
        original_name: 'profissao',
        semantic_name: 'occupation',
        content_signature: 'Free-text occupation, e.g. "VENDEDOR AUTONOMO", "APOSENTADO DA POLICIA CIVIL", "MILITAR", "MEDICO".',
        indexable_as: ['employment'],
      },
      nacionalidade: {
        original_name: 'nacionalidade',
        semantic_name: 'nationality',
        content_signature: 'Free-text nationality, e.g. "BRASILEIRO", "ITALIANO".',
        indexable_as: [],
      },
      naturalidade: {
        original_name: 'naturalidade',
        semantic_name: 'place_of_birth',
        content_signature: 'City/state of birth, free-text, uppercase.',
        indexable_as: [],
      },
      estadoCivil: {
        original_name: 'estadoCivil',
        semantic_name: 'marital_status_code',
        content_signature: 'Integer FK → enumTipo=600. e.g. 145=CASADO(A), 144=SOLTEIRO(A).',
        indexable_as: [],
        enum_type: 600,
      },
      escolaridade: {
        original_name: 'escolaridade',
        semantic_name: 'education_level_code',
        content_signature: 'Integer FK → enumTipo=630. e.g. 155=SUPERIOR COMPLETO.',
        indexable_as: [],
        enum_type: 630,
      },
      tipoResidencia: {
        original_name: 'tipoResidencia',
        semantic_name: 'residence_type_code',
        content_signature: 'Integer FK → enumTipo=650. e.g. 158=PRÓPRIA, 159=ALUGADA.',
        indexable_as: [],
        enum_type: 650,
      },
      tempoResidencia: {
        original_name: 'tempoResidencia',
        semantic_name: 'residence_duration_code',
        content_signature: 'Integer FK → enumTipo=670. e.g. 168=MAIS DE 5 ANOS.',
        indexable_as: [],
        enum_type: 670,
      },
      FiliacaoPai: {
        original_name: 'FiliacaoPai',
        semantic_name: 'father_name',
        content_signature: 'Uppercase full name of father. Often null.',
        indexable_as: ['person_name'],
      },
      FiliacaoMae: {
        original_name: 'FiliacaoMae',
        semantic_name: 'mother_name',
        content_signature: 'Uppercase full name of mother. Often null.',
        indexable_as: ['person_name'],
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbClienteDadosComerciais — client employment & spouse (143 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbClienteDadosComerciais: {
    mdb_table: 'tbClienteDadosComerciais',
    supabase_table: 'customer_commercial_data',
    semantic_name: 'customer_employment_and_spouse',
    description: 'Employment data and full spouse profile for clients. Used in financing credit analysis.',
    row_count_approx: 143,
    fields: {
      cliID: { original_name: 'cliID', semantic_name: 'client_id_fk', content_signature: 'Integer FK → tbCliente.cliid.', indexable_as: ['party_id'], fk_table: 'tbCliente' },
      empresaTrabalho: { original_name: 'empresaTrabalho', semantic_name: 'employer_name', content_signature: 'Free-text employer company name.', indexable_as: ['employment'] },
      cnpj: { original_name: 'cnpj', semantic_name: 'employer_tax_id', content_signature: 'CNPJ of employer, formatted or plain digits.', indexable_as: ['employment', 'tax_id', 'brazilian_id'] },
      cargo: { original_name: 'cargo', semantic_name: 'job_title', content_signature: 'Free-text job title, e.g. "GERENTE", "OPERADOR DE MAQUINA".', indexable_as: ['employment'] },
      dataAdmissao: { original_name: 'dataAdmissao', semantic_name: 'hire_date', content_signature: 'Access Date/Time → ISO date string.', indexable_as: ['employment'] },
      RendaMensal: { original_name: 'RendaMensal', semantic_name: 'monthly_income', content_signature: 'Decimal BRL amount, client\'s monthly income.', indexable_as: ['financial_profile'] },
      OutrasRendas: { original_name: 'OutrasRendas', semantic_name: 'other_income', content_signature: 'Decimal BRL, other income sources.', indexable_as: ['financial_profile'] },
      // Spouse fields — full replica of client profile
      conjuge_Nome: { original_name: 'conjuge_Nome', semantic_name: 'spouse_name', content_signature: 'Uppercase full name of spouse.', indexable_as: ['person_name', 'spouse_profile'] },
      conjuge_cpf: { original_name: 'conjuge_cpf', semantic_name: 'spouse_cpf', content_signature: 'Spouse CPF, 11 digits.', indexable_as: ['brazilian_id', 'tax_id', 'spouse_profile', 'personal_document'] },
      conjuge_RG: { original_name: 'conjuge_RG', semantic_name: 'spouse_rg', content_signature: 'Spouse RG document number.', indexable_as: ['brazilian_id', 'spouse_profile', 'personal_document'] },
      conjuge_dtNasc: { original_name: 'conjuge_dtNasc', semantic_name: 'spouse_date_of_birth', content_signature: 'Access Date/Time → ISO date.', indexable_as: ['spouse_profile'] },
      conjuge_sexo: { original_name: 'conjuge_sexo', semantic_name: 'spouse_gender_code', content_signature: 'Integer FK → enumTipo=0.', indexable_as: ['spouse_profile'], enum_type: 0 },
      conjuge_empresaTrabalho: { original_name: 'conjuge_empresaTrabalho', semantic_name: 'spouse_employer_name', content_signature: 'Free-text employer name.', indexable_as: ['spouse_profile', 'employment'] },
      conjuge_empresaCNPJ: { original_name: 'conjuge_empresaCNPJ', semantic_name: 'spouse_employer_tax_id', content_signature: 'CNPJ of spouse\'s employer.', indexable_as: ['spouse_profile', 'tax_id', 'brazilian_id'] },
      conjuge_cargo: { original_name: 'conjuge_cargo', semantic_name: 'spouse_job_title', content_signature: 'Free-text job title.', indexable_as: ['spouse_profile', 'employment'] },
      conjuge_dataAdmissao: { original_name: 'conjuge_dataAdmissao', semantic_name: 'spouse_hire_date', content_signature: 'Access Date/Time → ISO date.', indexable_as: ['spouse_profile', 'employment'] },
      conjuge_Nacionalidade: { original_name: 'conjuge_Nacionalidade', semantic_name: 'spouse_nationality', content_signature: 'Free-text nationality.', indexable_as: ['spouse_profile'] },
      conjuge_Naturalidade: { original_name: 'conjuge_Naturalidade', semantic_name: 'spouse_place_of_birth', content_signature: 'City/state of birth.', indexable_as: ['spouse_profile'] },
      conjuge_RendaMensal: { original_name: 'conjuge_RendaMensal', semantic_name: 'spouse_monthly_income', content_signature: 'Decimal BRL.', indexable_as: ['spouse_profile', 'financial_profile'] },
      conjuge_OutrasRendas: { original_name: 'conjuge_OutrasRendas', semantic_name: 'spouse_other_income', content_signature: 'Decimal BRL.', indexable_as: ['spouse_profile', 'financial_profile'] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbClienteReferenciasBens — bank accounts, personal references, assets (185 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbClienteReferenciasBens: {
    mdb_table: 'tbClienteReferenciasBens',
    supabase_table: 'customer_asset_references',
    semantic_name: 'customer_financial_references',
    description: 'Client bank accounts (up to 2), personal references (up to 2), declared assets (up to 3). Used in financing credit analysis.',
    row_count_approx: 185,
    fields: {
      cliID: { original_name: 'cliID', semantic_name: 'client_id_fk', content_signature: 'Integer FK → tbCliente.cliid.', indexable_as: ['party_id'], fk_table: 'tbCliente' },
      banco1: { original_name: 'banco1', semantic_name: 'bank_account_1_bank_code', content_signature: '3-digit Brazilian bank code (e.g. "341" = Itaú, "237" = Bradesco).', indexable_as: ['bank_account', 'financial_profile'] },
      agencia1: { original_name: 'agencia1', semantic_name: 'bank_account_1_agency', content_signature: 'Agency number, free-text.', indexable_as: ['bank_account', 'financial_profile'] },
      conta1: { original_name: 'conta1', semantic_name: 'bank_account_1_number', content_signature: 'Account number, free-text.', indexable_as: ['bank_account', 'financial_profile'] },
      tipoConta1: { original_name: 'tipoConta1', semantic_name: 'bank_account_1_type_code', content_signature: 'Integer FK → enumTipo=38. e.g. 109=CONTA CORRENTE.', indexable_as: ['bank_account'], enum_type: 38 },
      banco2: { original_name: 'banco2', semantic_name: 'bank_account_2_bank_code', content_signature: 'Same as banco1.', indexable_as: ['bank_account', 'financial_profile'] },
      agencia2: { original_name: 'agencia2', semantic_name: 'bank_account_2_agency', content_signature: 'Same as agencia1.', indexable_as: ['bank_account', 'financial_profile'] },
      conta2: { original_name: 'conta2', semantic_name: 'bank_account_2_number', content_signature: 'Same as conta1.', indexable_as: ['bank_account', 'financial_profile'] },
      tipoConta2: { original_name: 'tipoConta2', semantic_name: 'bank_account_2_type_code', content_signature: 'Integer FK → enumTipo=38.', indexable_as: ['bank_account'], enum_type: 38 },
      nome1: { original_name: 'nome1', semantic_name: 'personal_reference_1_name', content_signature: 'Uppercase full name of reference person.', indexable_as: ['person_name', 'personal_reference'] },
      afinidade1: { original_name: 'afinidade1', semantic_name: 'personal_reference_1_relationship', content_signature: 'Relationship label, e.g. "AMIGA", "PAI", "MÃE", "IRMÃO".', indexable_as: ['personal_reference'] },
      telefone1: { original_name: 'telefone1', semantic_name: 'personal_reference_1_phone', content_signature: 'Brazilian phone number, free-text.', indexable_as: ['contact', 'phone_br', 'personal_reference'] },
      nome2: { original_name: 'nome2', semantic_name: 'personal_reference_2_name', content_signature: 'Same as nome1.', indexable_as: ['person_name', 'personal_reference'] },
      afinidade2: { original_name: 'afinidade2', semantic_name: 'personal_reference_2_relationship', content_signature: 'Same as afinidade1.', indexable_as: ['personal_reference'] },
      telefone2: { original_name: 'telefone2', semantic_name: 'personal_reference_2_phone', content_signature: 'Same as telefone1.', indexable_as: ['contact', 'phone_br', 'personal_reference'] },
      bens1_tipo: { original_name: 'bens1_tipo', semantic_name: 'asset_1_type', content_signature: 'Free-text asset type, e.g. "IMÓVEL", "VEÍCULO", "TERRENO".', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens1_descricao: { original_name: 'bens1_descricao', semantic_name: 'asset_1_description', content_signature: 'Free-text description, e.g. "APARTAMENTO 70M2 CENTRO SP".', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens1_valorAtual: { original_name: 'bens1_valorAtual', semantic_name: 'asset_1_current_value', content_signature: 'Decimal BRL current market value.', indexable_as: ['asset_declaration', 'financial_profile', 'pricing'] },
      bens1_onus: { original_name: 'bens1_onus', semantic_name: 'asset_1_lien_amount', content_signature: 'Decimal BRL, outstanding encumbrance on the asset.', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens1_credor: { original_name: 'bens1_credor', semantic_name: 'asset_1_creditor', content_signature: 'Free-text creditor name.', indexable_as: ['asset_declaration'] },
      bens2_tipo: { original_name: 'bens2_tipo', semantic_name: 'asset_2_type', content_signature: 'Same as bens1_tipo.', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens2_descricao: { original_name: 'bens2_descricao', semantic_name: 'asset_2_description', content_signature: 'Same as bens1_descricao.', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens2_valorAtual: { original_name: 'bens2_valorAtual', semantic_name: 'asset_2_current_value', content_signature: 'Decimal BRL.', indexable_as: ['asset_declaration', 'financial_profile', 'pricing'] },
      bens2_onus: { original_name: 'bens2_onus', semantic_name: 'asset_2_lien_amount', content_signature: 'Decimal BRL.', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens2_credor: { original_name: 'bens2_credor', semantic_name: 'asset_2_creditor', content_signature: 'Free-text creditor name.', indexable_as: ['asset_declaration'] },
      bens3_tipo: { original_name: 'bens3_tipo', semantic_name: 'asset_3_type', content_signature: 'Same as bens1_tipo.', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens3_descricao: { original_name: 'bens3_descricao', semantic_name: 'asset_3_description', content_signature: 'Same as bens1_descricao.', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens3_valorAtual: { original_name: 'bens3_valorAtual', semantic_name: 'asset_3_current_value', content_signature: 'Decimal BRL.', indexable_as: ['asset_declaration', 'financial_profile', 'pricing'] },
      bens3_onus: { original_name: 'bens3_onus', semantic_name: 'asset_3_lien_amount', content_signature: 'Decimal BRL.', indexable_as: ['asset_declaration', 'financial_profile'] },
      bens3_credor: { original_name: 'bens3_credor', semantic_name: 'asset_3_creditor', content_signature: 'Free-text creditor name.', indexable_as: ['asset_declaration'] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbVeiculo — vehicle master (10,842 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbVeiculo: {
    mdb_table: 'tbVeiculo',
    supabase_table: 'vehicles',
    semantic_name: 'vehicle_master',
    description: 'Core vehicle record. One row per vehicle that ever entered the dealership.',
    row_count_approx: 10842,
    fields: {
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Auto-increment integer, primary key.', indexable_as: ['vehicle_id'] },
      carDescri: { original_name: 'carDescri', semantic_name: 'vehicle_model_description', content_signature: 'Free-text model, e.g. "MONTANA OFF ROAD", "DAILY 3510 BAÚ", "C4 HATCH GLX 2.0 AT".', indexable_as: ['vehicle_model'] },
      carPlaca: { original_name: 'carPlaca', semantic_name: 'license_plate_br', content_signature: 'Brazilian plate in old (ABC-1234) or Mercosul (ABC1D23) format, often with "/01" resolution suffix (e.g. "ALR-7883/01", "ETX-4937/01"). Strip suffix before display.', indexable_as: ['vehicle_plate', 'brazilian_id'] },
      carChassi: { original_name: 'carChassi', semantic_name: 'vin_chassis', content_signature: '17-character VIN, e.g. "9BGXF80004C206086". Sometimes shorter for older vehicles or motorcycles.', indexable_as: ['vin', 'vehicle_id', 'brazilian_id'] },
      carRenavan: { original_name: 'carRenavan', semantic_name: 'renavam_registry', content_signature: 'Numeric string, Brazilian vehicle registry (RENAVAM), 9-11 digits.', indexable_as: ['vehicle_id', 'brazilian_id'] },
      carCor: { original_name: 'carCor', semantic_name: 'vehicle_color', content_signature: 'Free-text color in Portuguese, uppercase, e.g. "PRETA", "BRANCO", "PRATA", "VERMELHO".', indexable_as: [] },
      carTipo: { original_name: 'carTipo', semantic_name: 'vehicle_category_code', content_signature: 'Integer FK → enumTipo=2. e.g. 7=SEMI-NOVO, 6=NOVO.', indexable_as: [], enum_type: 2 },
      carStatus: { original_name: 'carStatus', semantic_name: 'vehicle_status_code', content_signature: 'Integer FK → enumTipo=3. 10=DISPONÍVEL, 11=VENDIDO, 12=DEVOLVIDO.', indexable_as: [], enum_type: 3 },
      fabID: { original_name: 'fabID', semantic_name: 'manufacturer_id', content_signature: 'Integer FK → tbFabricantes. Resolves to brand names: CHEVROLET, VOLKSWAGEN, FIAT, FORD, HONDA, etc.', indexable_as: [], fk_table: 'tbFabricantes' },
      gazID: { original_name: 'gazID', semantic_name: 'fuel_type_id', content_signature: 'Integer FK → tbCombustivel. Resolves to: GASOLINA, ALCOOL, FLEX, DIESEL, GNV, ELÉTRICO, HÍBRIDO.', indexable_as: [], fk_table: 'tbCombustivel' },
      carAno: { original_name: 'carAno', semantic_name: 'manufacture_year', content_signature: '4-digit year of manufacture, e.g. 2011.', indexable_as: [] },
      carAnoModelo: { original_name: 'carAnoModelo', semantic_name: 'model_year', content_signature: '4-digit model year (often manufacture_year + 1), e.g. 2012.', indexable_as: [] },
      CarTroca: { original_name: 'CarTroca', semantic_name: 'trade_in_linked_vehicle_id', content_signature: 'Integer self-FK → tbVeiculo.carID. Set when vehicle was received as a trade-in for another car.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      carConsignado: { original_name: 'carConsignado', semantic_name: 'is_consignment', content_signature: 'Boolean (Access Yes/No). True = vehicle is on consignment, not owned by dealer.', indexable_as: [] },
      carValorTabela: { original_name: 'carValorTabela', semantic_name: 'fipe_table_value', content_signature: 'Decimal BRL, FIPE reference price at time of entry.', indexable_as: ['pricing', 'fipe'] },
      carValorCompra: { original_name: 'carValorCompra', semantic_name: 'purchase_cost', content_signature: 'Decimal BRL, actual purchase cost paid by dealer.', indexable_as: ['pricing'] },
      carValorWeb: { original_name: 'carValorWeb', semantic_name: 'web_listed_price', content_signature: 'Decimal BRL, asking price shown on web listings.', indexable_as: ['pricing', 'public_price'] },
      carValorMinimo: { original_name: 'carValorMinimo', semantic_name: 'minimum_sale_price', content_signature: 'Decimal BRL, floor below which salesperson cannot sell without authorization.', indexable_as: ['pricing', 'floor_price'] },
      carMotor: { original_name: 'carMotor', semantic_name: 'engine_displacement', content_signature: 'Free-text engine description, e.g. "1.4", "2.0 16V TURBO".', indexable_as: [] },
      carNacionalidade: { original_name: 'carNacionalidade', semantic_name: 'vehicle_origin_code', content_signature: 'Integer FK → enumTipo=13. 74=IMPORTADO, 75=NACIONAL.', indexable_as: [], enum_type: 13 },
      carBloqueado: { original_name: 'carBloqueado', semantic_name: 'is_blocked_flag', content_signature: 'Boolean. True = vehicle is administratively blocked for sale.', indexable_as: [] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbDadosCompra — purchase transactions (62,407 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbDadosCompra: {
    mdb_table: 'tbDadosCompra',
    supabase_table: 'purchase_data',
    semantic_name: 'vehicle_purchase_transaction',
    description: 'One row per vehicle purchase event. Captures how and from whom the dealer bought each car.',
    row_count_approx: 62407,
    fields: {
      cID: { original_name: 'cID', semantic_name: 'purchase_id', content_signature: 'Auto-increment integer, primary key.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      cliID: {
        original_name: 'cliID',
        semantic_name: 'seller_party_id',
        content_signature: 'Integer FK → tbFornecedor.forID. Despite the "cli" prefix, this is the SELLER (person we bought FROM), not the buyer. In practice points to tbFornecedor.',
        indexable_as: ['party_id'],
        fk_table: 'tbFornecedor',
        notes: 'POLYMORPHISM: historically named cliID but actually refers to tbFornecedor, not tbCliente.',
      },
      cData: { original_name: 'cData', semantic_name: 'purchase_date', content_signature: 'Access Date → ISO date string.', indexable_as: [] },
      cHora: { original_name: 'cHora', semantic_name: 'purchase_time', content_signature: 'Access Time value, or null.', indexable_as: [] },
      cValor: { original_name: 'cValor', semantic_name: 'purchase_amount_brl', content_signature: 'Decimal BRL, total purchase price paid to seller.', indexable_as: ['pricing'] },
      cKM: { original_name: 'cKM', semantic_name: 'odometer_km_at_purchase', content_signature: 'Integer or decimal, kilometers at time of purchase.', indexable_as: [] },
      cFormaPagto: { original_name: 'cFormaPagto', semantic_name: 'purchase_payment_form_free_text', content_signature: 'Free-text, e.g. "A VISTA COM TED NA CONTA DO ITAU", "CHEQUE BRADESCO 30 DIAS".', indexable_as: [] },
      cOBS: { original_name: 'cOBS', semantic_name: 'purchase_notes', content_signature: 'Free-text memo, arbitrary length.', indexable_as: [] },
      cDeclaracao: { original_name: 'cDeclaracao', semantic_name: 'purchase_declaration_text_id', content_signature: 'Integer FK → tbCadastroTextos.txtID. Points to the purchase declaration legal template.', indexable_as: ['legal_template'], fk_table: 'tbCadastroTextos' },
      crepresentante: { original_name: 'crepresentante', semantic_name: 'purchase_seller_representative_id', content_signature: 'Integer FK, representative of the selling party. May be null.', indexable_as: ['party_id'] },
      avaliadorID: { original_name: 'avaliadorID', semantic_name: 'appraiser_employee_id', content_signature: 'Integer FK → tbFornecedor (role=employee). The staff member who appraised the vehicle before purchase.', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbDadosVenda — sale transactions (49,403 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbDadosVenda: {
    mdb_table: 'tbDadosVenda',
    supabase_table: 'sale_data',
    semantic_name: 'vehicle_sale_transaction',
    description: 'One row per vehicle sale event. Core table for revenue, salesperson attribution, and customer acquisition analysis.',
    row_count_approx: 49403,
    fields: {
      vID: { original_name: 'vID', semantic_name: 'sale_id', content_signature: 'Auto-increment integer, primary key.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      cliID: { original_name: 'cliID', semantic_name: 'buyer_client_id', content_signature: 'Integer FK → tbCliente.cliid. The person or company who bought the vehicle.', indexable_as: ['party_id'], fk_table: 'tbCliente' },
      vData: { original_name: 'vData', semantic_name: 'sale_date', content_signature: 'Access Date → ISO date string.', indexable_as: [] },
      vHora: { original_name: 'vHora', semantic_name: 'sale_time', content_signature: 'Access Time, may be null.', indexable_as: [] },
      vKM: { original_name: 'vKM', semantic_name: 'odometer_km_at_sale', content_signature: 'Integer or decimal km.', indexable_as: [] },
      vSinal: { original_name: 'vSinal', semantic_name: 'deposit_paid_brl', content_signature: 'Decimal BRL deposit/signal paid by buyer at signing. May be 0.', indexable_as: ['pricing'] },
      vValorVenda: { original_name: 'vValorVenda', semantic_name: 'sale_price_brl', content_signature: 'Decimal BRL, agreed final sale price.', indexable_as: ['pricing'] },
      vGarantiaKM: { original_name: 'vGarantiaKM', semantic_name: 'warranty_km', content_signature: 'Integer, km coverage of sale warranty.', indexable_as: [] },
      vGaratiaMeses: { original_name: 'vGaratiaMeses', semantic_name: 'warranty_months', content_signature: 'Integer, month coverage of sale warranty.', indexable_as: [] },
      vFormaPagto: { original_name: 'vFormaPagto', semantic_name: 'sale_payment_form_free_text', content_signature: 'Free-text, e.g. "FINANCIADO PELO BANCO ITAU", "A VISTA + TROCA GOL 2010".', indexable_as: [] },
      vOrigemCliente: {
        original_name: 'vOrigemCliente',
        semantic_name: 'customer_acquisition_source_id',
        content_signature: 'Integer FK → tbOrigemCliente. Content: "JÁ É CLIENTE", "WEBMOTORS", "PASSAGEM", "FACEBOOK", "INDICAÇÃO", "OLX". Primary channel-attribution field.',
        indexable_as: ['customer_acquisition_source'],
        fk_table: 'tbOrigemCliente',
      },
      vTermoGarantia: { original_name: 'vTermoGarantia', semantic_name: 'warranty_text_id', content_signature: 'Integer FK → tbCadastroTextos.txtID. Points to warranty legal template.', indexable_as: ['legal_template'], fk_table: 'tbCadastroTextos' },
      vDeclaracao: { original_name: 'vDeclaracao', semantic_name: 'sale_declaration_text_id', content_signature: 'Integer FK → tbCadastroTextos.txtID. Points to sale declaration template.', indexable_as: ['legal_template'], fk_table: 'tbCadastroTextos' },
      vDocumentoPago: { original_name: 'vDocumentoPago', semantic_name: 'document_fee_text_id', content_signature: 'Integer FK → tbCadastroTextos.txtID.', indexable_as: ['legal_template'], fk_table: 'tbCadastroTextos' },
      vDocumentoPagoValor: { original_name: 'vDocumentoPagoValor', semantic_name: 'document_fee_amount_brl', content_signature: 'Decimal BRL, fees paid for document transfer.', indexable_as: ['pricing'] },
      vendedorID: {
        original_name: 'vendedorID',
        semantic_name: 'salesperson_employee_id',
        content_signature: 'Integer FK → tbFornecedor.forID (where forTipo resolves to employee/INTERNO role). Key field for salesperson performance attribution and commission calculation.',
        indexable_as: ['party_id'],
        fk_table: 'tbFornecedor',
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbMovimento — universal financial ledger (549,503 rows — largest table)
  // ────────────────────────────────────────────────────────────────────────────
  tbMovimento: {
    mdb_table: 'tbMovimento',
    supabase_table: 'expenses',
    semantic_name: 'financial_ledger',
    description: 'Every financial entry: vehicle purchases, sales, commissions, insurance, taxes, salaries, overhead. ~549K rows. The movDescri field contains auto-generated text rich enough to extract vehicle metadata via regex.',
    row_count_approx: 549503,
    fields: {
      movID: { original_name: 'movID', semantic_name: 'ledger_entry_id', content_signature: 'Auto-increment integer, primary key.', indexable_as: ['ledger_entry_id'] },
      movData: { original_name: 'movData', semantic_name: 'entry_timestamp', content_signature: 'Access Date → ISO date string.', indexable_as: [] },
      movValor: { original_name: 'movValor', semantic_name: 'amount_brl', content_signature: 'Decimal BRL, always positive. Direction determined by movSinal.', indexable_as: ['pricing'] },
      movSinal: {
        original_name: 'movSinal',
        semantic_name: 'debit_credit_code',
        content_signature: 'Integer FK → enumTipo=14 (76=CRÉDITO, 77=DÉBITO). WARNING: some legacy rows may contain supplier-role codes (e.g. 79) due to historical field overloading. Always validate against enumTipo=14 group before resolving; fall back to raw integer if not found.',
        indexable_as: [],
        enum_type: 14,
        notes: 'POLYMORPHISM GOTCHA: movSinal occasionally contains values from enumTipo=15 (transaction modality) due to legacy overloading.',
      },
      movStatus: { original_name: 'movStatus', semantic_name: 'payment_status_code', content_signature: 'Integer FK → enumTipo=5 or 39. Cross-check both groups.', indexable_as: ['payment_status'], enum_type: 5 },
      movDescri: {
        original_name: 'movDescri',
        semantic_name: 'entry_description',
        content_signature: 'Auto-generated Portuguese string. Examples: "PAGAR VEÍCULO - MONTANA OFF ROAD - 04/04 - PRETA - Placa: ALR-7883/01", "COMISSÃO DE VENDA - ONIX LT 2019/2020". Regex-extractable: model, color, plate, year-pair.',
        indexable_as: ['ledger_description', 'vehicle_description_natural_language'],
      },
      plaID: { original_name: 'plaID', semantic_name: 'chart_of_accounts_id', content_signature: 'Integer FK → tbPlanoContas.plaID. Resolves to account name: ENERGIA, ADMINISTRATIVAS, COMBUSTÍVEL, etc.', indexable_as: [], fk_table: 'tbPlanoContas' },
      forID: { original_name: 'forID', semantic_name: 'counterparty_supplier_id', content_signature: 'Integer FK → tbFornecedor.forID. The party receiving or sending money.', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      cliID: { original_name: 'cliID', semantic_name: 'counterparty_client_id', content_signature: 'Integer FK → tbCliente.cliid. Set when the counterparty is a client (e.g. customer paying).', indexable_as: ['party_id'], fk_table: 'tbCliente' },
      carReferencia: { original_name: 'carReferencia', semantic_name: 'related_vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID. Links this cash-flow entry back to the vehicle it relates to.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      movClassificacao: { original_name: 'movClassificacao', semantic_name: 'classification_code', content_signature: 'Integer FK → enumTipo=16. 83=DESPESA, 84=DESPESA PADRÃO, 85=INVESTIMENTO.', indexable_as: [], enum_type: 16 },
      movDocumento: { original_name: 'movDocumento', semantic_name: 'external_document_ref', content_signature: 'Free-text external document or reference number, e.g. NF number, invoice ID.', indexable_as: [] },
      movDtVencimento: { original_name: 'movDtVencimento', semantic_name: 'due_date', content_signature: 'Access Date → ISO date string. Payment due date.', indexable_as: [] },
      movDtPagamento: { original_name: 'movDtPagamento', semantic_name: 'payment_date', content_signature: 'Access Date → ISO date string. Actual payment date.', indexable_as: [] },
      movVrIR: { original_name: 'movVrIR', semantic_name: 'withheld_tax_ir_brl', content_signature: 'Decimal BRL, Imposto de Renda withholding on the payment.', indexable_as: ['brazilian_tax_withholding'] },
      movVrInss: { original_name: 'movVrInss', semantic_name: 'withheld_tax_inss_brl', content_signature: 'Decimal BRL, INSS (social security) withholding.', indexable_as: ['brazilian_tax_withholding'] },
      movVrOutrosImpostos: { original_name: 'movVrOutrosImpostos', semantic_name: 'withheld_tax_other_brl', content_signature: 'Decimal BRL, other tax withholding.', indexable_as: ['brazilian_tax_withholding'] },
      movJuros: { original_name: 'movJuros', semantic_name: 'interest_charged_brl', content_signature: 'Decimal BRL interest added to overdue entries.', indexable_as: [] },
      movDescontos: { original_name: 'movDescontos', semantic_name: 'discount_granted_brl', content_signature: 'Decimal BRL discount applied.', indexable_as: [] },
      ccID: { original_name: 'ccID', semantic_name: 'bank_account_id', content_signature: 'Integer FK → tbContasCorrentes.ccID. Which dealer account was debited/credited.', indexable_as: ['bank_account'], fk_table: 'tbContasCorrentes' },
      movParcelas: { original_name: 'movParcelas', semantic_name: 'installment_label', content_signature: 'Free-text, e.g. "1/12", "3/6", "ÚNICA". Not a numeric field.', indexable_as: [] },
      movTipoPagtos: { original_name: 'movTipoPagtos', semantic_name: 'installment_payment_method_code', content_signature: 'Integer FK → enumTipo=40. 119=DINHEIRO, 121=CARTÃO CRÉDITO, etc.', indexable_as: [], enum_type: 40 },
      ccuid: { original_name: 'ccuid', semantic_name: 'audit_user_id', content_signature: 'Integer, ID of the user who created/last modified this entry.', indexable_as: [] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbFornecedor — polymorphic party/counterparty directory (15,438 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbFornecedor: {
    mdb_table: 'tbFornecedor',
    supabase_table: 'vendors',
    semantic_name: 'party_directory',
    description: 'Polymorphic directory: holds dispatchers, insurance brokers, financing companies, employees, vendors, AND some clients. forTipo (enumTipo=7) is the discriminator. Always filter by forTipo before treating a row as a specific role.',
    row_count_approx: 15438,
    fields: {
      forID: { original_name: 'forID', semantic_name: 'party_id', content_signature: 'Auto-increment integer, primary key.', indexable_as: ['party_id'] },
      forRazSoc: { original_name: 'forRazSoc', semantic_name: 'legal_name', content_signature: 'Legal/company name in uppercase, e.g. "BANCO BRADESCO S.A.", "JOAO SILVA".', indexable_as: ['person_name'] },
      forFantasia: { original_name: 'forFantasia', semantic_name: 'trade_name', content_signature: 'Trade/fantasy name. Often same as forRazSoc for individuals.', indexable_as: ['person_name'] },
      forCNPJ: { original_name: 'forCNPJ', semantic_name: 'tax_id_cnpj_or_cpf', content_signature: 'CPF (11 digits) for individuals or CNPJ (14 digits) for companies. Same disambiguation as cliCNPJ_CPF.', indexable_as: ['brazilian_id', 'tax_id'] },
      forIE: { original_name: 'forIE', semantic_name: 'state_registration_ie', content_signature: 'Inscrição Estadual, free-text. Applicable for companies.', indexable_as: ['brazilian_id'] },
      forTipo: {
        original_name: 'forTipo',
        semantic_name: 'party_role_code',
        content_signature: 'Integer FK → enumTipo=7. CRITICAL DISCRIMINATOR: 22/23=INTERNO (employee), 24=DESPACHANTE, 25=FINANCEIRA, 27=CORRETORAS (insurance broker), 28=PREST.SERVIÇO, 29=CLIENTE.',
        indexable_as: [],
        enum_type: 7,
        notes: 'POLYMORPHISM: filter by forTipo before using a row as employee/dispatcher/bank/broker.',
      },
      forStatus: { original_name: 'forStatus', semantic_name: 'party_status_code', content_signature: 'Integer FK → enumTipo=6. 20=ATIVO, 21=INATIVO.', indexable_as: [], enum_type: 6 },
      forDesconto: { original_name: 'forDesconto', semantic_name: 'default_discount_pct', content_signature: 'Decimal percentage, default discount this party receives/grants.', indexable_as: [] },
      forEmail: { original_name: 'forEmail', semantic_name: 'party_email', content_signature: 'Free-text email address.', indexable_as: ['contact', 'email'] },
      forFone1: { original_name: 'forFone1', semantic_name: 'party_phone_primary', content_signature: 'Brazilian phone number, free-text.', indexable_as: ['contact', 'phone_br'] },
      forFone2: { original_name: 'forFone2', semantic_name: 'party_phone_secondary', content_signature: 'Brazilian phone number, free-text.', indexable_as: ['contact', 'phone_br'] },
      forFone3: { original_name: 'forFone3', semantic_name: 'party_phone_tertiary', content_signature: 'Brazilian phone number, free-text.', indexable_as: ['contact', 'phone_br'] },
      forEnd: { original_name: 'forEnd', semantic_name: 'party_address_street', content_signature: 'Street address, free-text.', indexable_as: ['address_br'] },
      forBairro: { original_name: 'forBairro', semantic_name: 'party_address_neighborhood', content_signature: 'Neighborhood, uppercase.', indexable_as: ['address_br'] },
      forCidade: { original_name: 'forCidade', semantic_name: 'party_address_city', content_signature: 'City name, uppercase.', indexable_as: ['address_br'] },
      forEstado: { original_name: 'forEstado', semantic_name: 'party_address_state', content_signature: 'Integer FK → enumTipo=12. UF code.', indexable_as: ['address_br'], enum_type: 12 },
      forCEP: { original_name: 'forCEP', semantic_name: 'party_postal_code', content_signature: 'Brazilian CEP, 8 digits.', indexable_as: ['address_br', 'cep'] },
      // Individual/personal fields (used when forTipo = employee or individual)
      cliCNH: { original_name: 'cliCNH', semantic_name: 'party_personal_driver_license', content_signature: '11-digit Brazilian CNH number. Populated for individual parties (employees, individual vendors).', indexable_as: ['driver_license', 'personal_document', 'brazilian_id'] },
      cliCNH_Categoria: { original_name: 'cliCNH_Categoria', semantic_name: 'party_personal_driver_license_category', content_signature: '"A", "AB", "B", "D", "E". Null for companies.', indexable_as: ['driver_license'] },
      cliDtNasc: { original_name: 'cliDtNasc', semantic_name: 'party_personal_date_of_birth', content_signature: 'Access Date → ISO date. Null for companies.', indexable_as: ['personal_document'] },
      cliSexo: { original_name: 'cliSexo', semantic_name: 'party_personal_gender_code', content_signature: 'Integer FK → enumTipo=0. Null for companies.', indexable_as: [], enum_type: 0 },
      RG_Emissao: { original_name: 'RG_Emissao', semantic_name: 'party_personal_rg_issue_date', content_signature: 'Access Date → ISO date, RG issuance date.', indexable_as: ['personal_document'] },
      RG_OrgaoExpedidor: { original_name: 'RG_OrgaoExpedidor', semantic_name: 'party_personal_rg_issuing_agency', content_signature: 'Free-text, e.g. "SSP/SP", "DETRAN/SP".', indexable_as: ['personal_document'] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbFuncionario — employee HR record (244 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbFuncionario: {
    mdb_table: 'tbFuncionario',
    supabase_table: 'employees',
    semantic_name: 'employee_hr_record',
    description: 'HR supplement to tbFornecedor for employees. forID links to the employee\'s party record in tbFornecedor.',
    row_count_approx: 244,
    fields: {
      forID: { original_name: 'forID', semantic_name: 'employee_party_id', content_signature: 'Integer FK → tbFornecedor.forID. NOT the employee\'s own sequential ID.', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      funPIS: { original_name: 'funPIS', semantic_name: 'employee_pis_number', content_signature: '11-digit PIS/PASEP number, Brazilian social insurance identifier.', indexable_as: ['brazilian_id', 'brazilian_labor_id'] },
      funCT: { original_name: 'funCT', semantic_name: 'work_card_number', content_signature: 'Carteira de Trabalho number, free-text.', indexable_as: ['brazilian_id', 'brazilian_labor_id'] },
      funCT_serie: { original_name: 'funCT_serie', semantic_name: 'work_card_series', content_signature: 'Work card series number, free-text.', indexable_as: ['brazilian_labor_id'] },
      funDtAdmissao: { original_name: 'funDtAdmissao', semantic_name: 'hire_date', content_signature: 'Access Date → ISO date.', indexable_as: ['employment'] },
      funDtDemissao: { original_name: 'funDtDemissao', semantic_name: 'termination_date', content_signature: 'Access Date → ISO date. Null = still employed.', indexable_as: ['employment'] },
      funFoto: { original_name: 'funFoto', semantic_name: 'employee_photo_path', content_signature: 'File path or URL string for employee photo. May be stale/relative path.', indexable_as: [] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbfuncionarioSalario — commission structure per employee (293 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbfuncionarioSalario: {
    mdb_table: 'tbfuncionarioSalario',
    supabase_table: 'employee_salaries',
    semantic_name: 'employee_compensation_and_commission_rates',
    description: 'Base salary and tiered commission rates by transaction type for each employee. Each employee may have multiple rows (one per compensation period).',
    row_count_approx: 293,
    fields: {
      forID: { original_name: 'forID', semantic_name: 'employee_party_id', content_signature: 'Integer FK → tbFornecedor.forID.', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      funSalarioFixo: { original_name: 'funSalarioFixo', semantic_name: 'base_salary_brl', content_signature: 'Decimal BRL, fixed monthly base salary.', indexable_as: ['commission_structure'] },
      funComCompra1: { original_name: 'funComCompra1', semantic_name: 'commission_rate_purchase_tier1', content_signature: 'Decimal percentage, tier-1 commission rate for vehicle purchase transactions.', indexable_as: ['commission_structure'] },
      funComCompra2: { original_name: 'funComCompra2', semantic_name: 'commission_rate_purchase_tier2', content_signature: 'Decimal percentage, tier-2 commission rate for vehicle purchase transactions.', indexable_as: ['commission_structure'] },
      funComVenda1: { original_name: 'funComVenda1', semantic_name: 'commission_rate_sale_tier1', content_signature: 'Decimal percentage, tier-1 commission on vehicle sales.', indexable_as: ['commission_structure'] },
      funComVenda2: { original_name: 'funComVenda2', semantic_name: 'commission_rate_sale_tier2', content_signature: 'Decimal percentage, tier-2 commission on vehicle sales.', indexable_as: ['commission_structure'] },
      funComFinanciamento1: { original_name: 'funComFinanciamento1', semantic_name: 'commission_rate_financing_tier1', content_signature: 'Decimal percentage on financing deals.', indexable_as: ['commission_structure'] },
      funComFinanciamento2: { original_name: 'funComFinanciamento2', semantic_name: 'commission_rate_financing_tier2', content_signature: 'Decimal percentage on financing deals (upper tier).', indexable_as: ['commission_structure'] },
      funComSeguro1: { original_name: 'funComSeguro1', semantic_name: 'commission_rate_insurance_tier1', content_signature: 'Decimal percentage on insurance sales.', indexable_as: ['commission_structure'] },
      funComSeguro2: { original_name: 'funComSeguro2', semantic_name: 'commission_rate_insurance_tier2', content_signature: 'Decimal percentage on insurance sales (upper tier).', indexable_as: ['commission_structure'] },
      FunComDespachante1: { original_name: 'FunComDespachante1', semantic_name: 'commission_rate_dispatch_tier1', content_signature: 'Decimal percentage on dispatcher service commissions.', indexable_as: ['commission_structure'] },
      FunComDespachante2: { original_name: 'FunComDespachante2', semantic_name: 'commission_rate_dispatch_tier2', content_signature: 'Decimal percentage on dispatcher service commissions (upper tier).', indexable_as: ['commission_structure'] },
      funcData: { original_name: 'funcData', semantic_name: 'compensation_effective_date', content_signature: 'Access Date → ISO date, when this compensation structure took effect.', indexable_as: [] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbFinanciamento — financing contracts (11,198 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbFinanciamento: {
    mdb_table: 'tbFinanciamento',
    supabase_table: 'financings',
    semantic_name: 'vehicle_financing_contract',
    description: 'One row per financing deal. Tracks the bank, terms, and dealer kickback received for each financed vehicle sale.',
    row_count_approx: 11198,
    fields: {
      finID: { original_name: 'finID', semantic_name: 'financing_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      forID: { original_name: 'forID', semantic_name: 'financing_company_party_id', content_signature: 'Integer FK → tbFornecedor where forTipo=25 (FINANCEIRA).', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      movID: { original_name: 'movID', semantic_name: 'ledger_entry_id', content_signature: 'Integer FK → tbMovimento.movID. The matching cash-flow entry.', indexable_as: ['ledger_entry_id'], fk_table: 'tbMovimento' },
      finValor: { original_name: 'finValor', semantic_name: 'financed_principal_brl', content_signature: 'Decimal BRL, total financed amount.', indexable_as: ['pricing'] },
      finParcelas: { original_name: 'finParcelas', semantic_name: 'number_of_installments', content_signature: 'Integer, number of monthly payments.', indexable_as: [] },
      finTaxa: { original_name: 'finTaxa', semantic_name: 'annual_interest_rate_pct', content_signature: 'Decimal percentage per year, e.g. 1.49 = 1.49% a.m. (clarify whether monthly or annual per display context).', indexable_as: [] },
      finIdxRetorno: { original_name: 'finIdxRetorno', semantic_name: 'kickback_index_pct', content_signature: 'Decimal percentage, dealer\'s return (kickback) from the financing bank.', indexable_as: ['dealer_commission', 'kickback'] },
      finParcelaValor: { original_name: 'finParcelaValor', semantic_name: 'monthly_installment_brl', content_signature: 'Decimal BRL, amount of each monthly installment.', indexable_as: ['pricing'] },
      finTAC: { original_name: 'finTAC', semantic_name: 'tac_fee_brl', content_signature: 'Decimal BRL, Taxa de Abertura de Crédito (credit origination fee).', indexable_as: ['pricing', 'brazilian_financing_fee'] },
      finCoef: { original_name: 'finCoef', semantic_name: 'installment_coefficient', content_signature: 'Decimal coefficient used to calculate installment from principal.', indexable_as: [] },
      finValorRec: { original_name: 'finValorRec', semantic_name: 'kickback_received_brl', content_signature: 'Decimal BRL, actual kickback amount received from bank.', indexable_as: ['dealer_commission', 'kickback'] },
      finDtRec: { original_name: 'finDtRec', semantic_name: 'kickback_received_date', content_signature: 'Access Date → ISO date, when the kickback was received.', indexable_as: ['kickback'] },
      finData1Parcela: { original_name: 'finData1Parcela', semantic_name: 'first_installment_due_date', content_signature: 'Access Date → ISO date.', indexable_as: [] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbSeguro — insurance contracts (10,842 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbSeguro: {
    mdb_table: 'tbSeguro',
    supabase_table: 'insurances',
    semantic_name: 'vehicle_insurance_contract',
    description: 'Insurance policy sold alongside each vehicle. Tracks broker, commission, and payment terms.',
    row_count_approx: 10842,
    fields: {
      segID: { original_name: 'segID', semantic_name: 'insurance_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      forID: { original_name: 'forID', semantic_name: 'insurance_broker_party_id', content_signature: 'Integer FK → tbFornecedor where forTipo=27 (CORRETORAS).', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      segParcela: { original_name: 'segParcela', semantic_name: 'installment_count', content_signature: 'Integer, number of insurance premium installments.', indexable_as: [] },
      segIdxRet: { original_name: 'segIdxRet', semantic_name: 'broker_commission_pct', content_signature: 'Decimal percentage, dealer/broker commission rate.', indexable_as: ['dealer_commission', 'commission_structure'] },
      segTipoRet: { original_name: 'segTipoRet', semantic_name: 'commission_payment_type_code', content_signature: 'Integer FK → enumTipo=9. 33=A VISTA, 34=A PRAZO.', indexable_as: [], enum_type: 9 },
      segValorParc: { original_name: 'segValorParc', semantic_name: 'installment_amount_brl', content_signature: 'Decimal BRL per installment.', indexable_as: ['pricing'] },
      segInicioVigencia: { original_name: 'segInicioVigencia', semantic_name: 'policy_start_date', content_signature: 'Access Date → ISO date.', indexable_as: [] },
      segValorRec: { original_name: 'segValorRec', semantic_name: 'dealer_commission_received_brl', content_signature: 'Decimal BRL, commission actually received.', indexable_as: ['dealer_commission'] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbComissao — sales-force commission payouts (25,998 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbComissao: {
    mdb_table: 'tbComissao',
    supabase_table: 'commissions',
    semantic_name: 'commission_payout_record',
    description: 'Individual commission payout per transaction modality (sale, purchase, financing, insurance, dispatch). Points to tbDadosVenda via carID for salesperson attribution.',
    row_count_approx: 25998,
    fields: {
      coID: { original_name: 'coID', semantic_name: 'commission_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      forID: { original_name: 'forID', semantic_name: 'recipient_party_id', content_signature: 'Integer FK → tbFornecedor. The staff member or broker receiving the commission.', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID. The vehicle this commission relates to.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      coModalidade: { original_name: 'coModalidade', semantic_name: 'transaction_modality_code', content_signature: 'Integer FK → enumTipo=15. 78=COMPRA, 79=VENDA, 80=FINANCIAMENTO, 81=SEGURO, 82=DESPACHANTE.', indexable_as: ['commission_structure'], enum_type: 15 },
      coTipo: { original_name: 'coTipo', semantic_name: 'commission_type_code', content_signature: 'Integer FK → enumTipo=8. 30=% LUCRO, 31=VALOR FIXO, 32=% VALOR.', indexable_as: ['commission_structure'], enum_type: 8 },
      coPorcentual: { original_name: 'coPorcentual', semantic_name: 'commission_rate_pct', content_signature: 'Decimal percentage applied.', indexable_as: ['commission_structure'] },
      coValor: { original_name: 'coValor', semantic_name: 'commission_amount_brl', content_signature: 'Decimal BRL, actual commission amount.', indexable_as: ['commission_structure', 'pricing'] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbRateioVeiculo — per-vehicle payment split/composition (27,037 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbRateioVeiculo: {
    mdb_table: 'tbRateioVeiculo',
    supabase_table: 'vehicle_apportionment',
    semantic_name: 'vehicle_payment_split',
    description: 'Records how a single vehicle purchase or sale was paid across up to 10 separate methods/tranches. Contains parallel arrays Data1..Data10, Valor1..Valor10, Tipo1..Tipo10, mov1..mov10 that MUST be normalized into a nested payment_splits[] array before LLM exposure.',
    row_count_approx: 27037,
    fields: {
      IDRateio: { original_name: 'IDRateio', semantic_name: 'split_record_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      TipoRateio: {
        original_name: 'TipoRateio',
        semantic_name: 'transaction_type',
        content_signature: 'Discriminator: "COMPRA" links ChaveRateio → tbDadosCompra.cID; "VENDA" links → tbDadosVenda.vID.',
        indexable_as: [],
        notes: 'POLYMORPHISM: ChaveRateio has dual FK semantics depending on TipoRateio.',
      },
      ChaveRateio: { original_name: 'ChaveRateio', semantic_name: 'transaction_id', content_signature: 'Integer FK → tbDadosCompra.cID OR tbDadosVenda.vID, depending on TipoRateio.', indexable_as: [] },
      Financeira: { original_name: 'Financeira', semantic_name: 'financing_company_party_id', content_signature: 'Integer FK → tbFornecedor (FINANCEIRA role). Populated when one tranche is a financing.', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      ratParcelas: { original_name: 'ratParcelas', semantic_name: 'financing_installment_count', content_signature: 'Integer installment count for the financing tranche.', indexable_as: [] },
      ratRetorno: { original_name: 'ratRetorno', semantic_name: 'financing_kickback_pct', content_signature: 'Decimal percentage kickback from financing bank.', indexable_as: ['kickback', 'dealer_commission'] },
      ratPorcentagemFinanciamento: { original_name: 'ratPorcentagemFinanciamento', semantic_name: 'financing_percentage_of_total', content_signature: 'Decimal percentage of total price that is financed.', indexable_as: ['kickback'] },
      ratTAC: { original_name: 'ratTAC', semantic_name: 'tac_fee_brl', content_signature: 'Decimal BRL, TAC (credit origination fee) for this split.', indexable_as: ['pricing', 'brazilian_financing_fee'] },
      ratValorParcelas: { original_name: 'ratValorParcelas', semantic_name: 'monthly_installment_brl', content_signature: 'Decimal BRL per installment.', indexable_as: ['pricing'] },
      ratCoeficiente: { original_name: 'ratCoeficiente', semantic_name: 'installment_coefficient', content_signature: 'Decimal coefficient for installment calculation.', indexable_as: [] },
      ratVnctoPrimeiraParcela: { original_name: 'ratVnctoPrimeiraParcela', semantic_name: 'first_installment_due_date', content_signature: 'Access Date → ISO date.', indexable_as: [] },
      // Parallel array fields — document the pattern, note normalization requirement
      'Data{1..10}': {
        original_name: 'Data1 … Data10',
        semantic_name: 'payment_splits[].date',
        content_signature: 'Access Date → ISO date for each payment tranche. 10 parallel columns.',
        indexable_as: [],
        notes: 'NORMALIZE: combine with Valor{N}, Tipo{N}, mov{N}, Descri{N} into payment_splits[] array. Never expose {N} suffix to LLM.',
      },
      'Valor{1..10}': {
        original_name: 'Valor1 … Valor10',
        semantic_name: 'payment_splits[].amount_brl',
        content_signature: 'Decimal BRL for each tranche. Null when fewer than 10 tranches used.',
        indexable_as: ['pricing'],
      },
      'Tipo{1..10}': {
        original_name: 'Tipo1 … Tipo10',
        semantic_name: 'payment_splits[].method_code',
        content_signature: 'Integer FK → enumTipo=40 per tranche. e.g. 119=DINHEIRO.',
        indexable_as: [],
        enum_type: 40,
      },
      'mov{1..10}': {
        original_name: 'mov1 … mov10',
        semantic_name: 'payment_splits[].ledger_entry_id',
        content_signature: 'Integer FK → tbMovimento.movID for each tranche.',
        indexable_as: ['ledger_entry_id'],
      },
      'Descri{1..10}': {
        original_name: 'Descri1 … Descri10',
        semantic_name: 'payment_splits[].description',
        content_signature: 'Free-text description of this payment tranche.',
        indexable_as: [],
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbVeiculoDocumento / tbVeiculoDocumentoCompra — document workflow (10,860 + 10,866 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbVeiculoDocumento: {
    mdb_table: 'tbVeiculoDocumento',
    supabase_table: 'vehicle_documents',
    semantic_name: 'vehicle_sale_document_workflow',
    description: 'Document transfer workflow for the SALE side: tracks which dispatcher handled docs, dates sent/returned, fees, IPVA status, and document checklist. Parallel table tbVeiculoDocumentoCompra covers the PURCHASE side.',
    row_count_approx: 10860,
    fields: {
      docID: { original_name: 'docID', semantic_name: 'document_record_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      forID: { original_name: 'forID', semantic_name: 'dispatcher_party_id', content_signature: 'Integer FK → tbFornecedor where forTipo=24 (DESPACHANTE).', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      docMunicOrigem: { original_name: 'docMunicOrigem', semantic_name: 'origin_municipality', content_signature: 'Free-text city name where documents originated.', indexable_as: ['address_br'] },
      dorMunicDestino: { original_name: 'dorMunicDestino', semantic_name: 'destination_municipality', content_signature: 'Free-text city name where documents are transferred to.', indexable_as: ['address_br'] },
      docDtEnvio: { original_name: 'docDtEnvio', semantic_name: 'document_sent_date', content_signature: 'Access Date → ISO date, when docs were sent to dispatcher.', indexable_as: [] },
      docDtDevolucao: { original_name: 'docDtDevolucao', semantic_name: 'document_returned_date', content_signature: 'Access Date → ISO date, when docs were returned. Null = still with dispatcher.', indexable_as: [] },
      docValorMaoObra: { original_name: 'docValorMaoObra', semantic_name: 'labor_fee_brl', content_signature: 'Decimal BRL, dispatcher labor fee.', indexable_as: ['pricing'] },
      docValorTaxas: { original_name: 'docValorTaxas', semantic_name: 'government_fees_brl', content_signature: 'Decimal BRL, DETRAN and other government fees.', indexable_as: ['pricing', 'brazilian_vehicle_tax'] },
      docIPVA: { original_name: 'docIPVA', semantic_name: 'ipva_tax_info_free_text', content_signature: 'Free-text memo about IPVA status, e.g. "PAGO 2023", "PARCELADO 3X", "ISENTO".', indexable_as: ['brazilian_vehicle_tax'] },
      // Checklist booleans — normalize to checklist_items: string[]
      docChkCPF: { original_name: 'docChkCPF', semantic_name: 'checklist_cpf_present', content_signature: 'Boolean. True = CPF document verified in file.', indexable_as: ['checklist_item'] },
      docChkRG: { original_name: 'docChkRG', semantic_name: 'checklist_rg_present', content_signature: 'Boolean. True = RG document verified.', indexable_as: ['checklist_item'] },
      docChkComprovante: { original_name: 'docChkComprovante', semantic_name: 'checklist_address_proof_present', content_signature: 'Boolean. True = proof of address verified.', indexable_as: ['checklist_item'] },
      docChkChassi: { original_name: 'docChkChassi', semantic_name: 'checklist_chassis_verified', content_signature: 'Boolean. True = chassis number physically verified.', indexable_as: ['checklist_item'] },
      docChkRecibo: { original_name: 'docChkRecibo', semantic_name: 'checklist_receipt_present', content_signature: 'Boolean. True = purchase/sale receipt in file.', indexable_as: ['checklist_item'] },
      docChkDUT: { original_name: 'docChkDUT', semantic_name: 'checklist_dut_present', content_signature: 'Boolean. True = DUT (Documento Único de Transferência) in file.', indexable_as: ['checklist_item'] },
      docChkMultasPagas: { original_name: 'docChkMultasPagas', semantic_name: 'checklist_fines_cleared', content_signature: 'Boolean. True = all outstanding fines have been paid.', indexable_as: ['checklist_item'] },
      docChkMotor: { original_name: 'docChkMotor', semantic_name: 'checklist_engine_number_verified', content_signature: 'Boolean. True = engine serial number physically verified.', indexable_as: ['checklist_item'] },
      docLaudoMotor: { original_name: 'docLaudoMotor', semantic_name: 'checklist_engine_inspection_report_present', content_signature: 'Boolean. True = motor inspection report (laudo) in file.', indexable_as: ['checklist_item'] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbVeiculoProtocoloEntrega — handover checklist (10,309 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbVeiculoProtocoloEntrega: {
    mdb_table: 'tbVeiculoProtocoloEntrega',
    supabase_table: 'vehicle_delivery_protocols',
    semantic_name: 'vehicle_handover_protocol',
    description: 'Protocol recording what was delivered to the buyer when vehicle left the lot. Contains 17 document-check booleans (normalize to delivered_documents[]) and 5 sets of outstanding fine data (normalize to outstanding_fines_at_handover[]).',
    row_count_approx: 10309,
    fields: {
      protID: { original_name: 'protID', semantic_name: 'protocol_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      forID: { original_name: 'forID', semantic_name: 'primary_buyer_party_id', content_signature: 'Integer FK → tbFornecedor or tbCliente. Primary buyer receiving the vehicle.', indexable_as: ['party_id'] },
      forID2: { original_name: 'forID2', semantic_name: 'secondary_buyer_party_id', content_signature: 'Integer FK. Secondary buyer for joint purchases. Often null.', indexable_as: ['party_id'] },
      dtVencimentoGNV: { original_name: 'dtVencimentoGNV', semantic_name: 'cng_inspection_due_date', content_signature: 'Access Date → ISO date. Expiry date of GNV (compressed natural gas) tank inspection certificate.', indexable_as: ['brazilian_vehicle_compliance'] },
      // Delivery checklist booleans — normalize to delivered_documents: string[]
      chkCRLV: { original_name: 'chkCRLV', semantic_name: 'delivered_crlv', content_signature: 'Boolean. CRLV (Certificado de Registro e Licenciamento de Veículo) delivered.', indexable_as: ['checklist_item'] },
      chkDUT: { original_name: 'chkDUT', semantic_name: 'delivered_dut', content_signature: 'Boolean. DUT (transfer document) delivered.', indexable_as: ['checklist_item'] },
      chkLicenciamento: { original_name: 'chkLicenciamento', semantic_name: 'delivered_licensing', content_signature: 'Boolean. Licensing documents delivered.', indexable_as: ['checklist_item', 'brazilian_vehicle_compliance'] },
      chkIPVA: { original_name: 'chkIPVA', semantic_name: 'delivered_ipva_receipt', content_signature: 'Boolean. IPVA payment receipt delivered.', indexable_as: ['checklist_item', 'brazilian_vehicle_tax'] },
      chkDPVAT: { original_name: 'chkDPVAT', semantic_name: 'delivered_dpvat_receipt', content_signature: 'Boolean. DPVAT (mandatory insurance) receipt delivered.', indexable_as: ['checklist_item', 'brazilian_vehicle_tax'] },
      chkQuitacao: { original_name: 'chkQuitacao', semantic_name: 'delivered_debt_clearance', content_signature: 'Boolean. Debt clearance certificate delivered.', indexable_as: ['checklist_item'] },
      chkCarne: { original_name: 'chkCarne', semantic_name: 'delivered_payment_booklet', content_signature: 'Boolean. Payment booklet delivered.', indexable_as: ['checklist_item'] },
      chkProcuracao: { original_name: 'chkProcuracao', semantic_name: 'delivered_power_of_attorney', content_signature: 'Boolean. Power of attorney document delivered.', indexable_as: ['checklist_item'] },
      chkValePlacas: { original_name: 'chkValePlacas', semantic_name: 'delivered_license_plate_voucher', content_signature: 'Boolean. License plate purchase voucher delivered.', indexable_as: ['checklist_item'] },
      chkValeTarjetas: { original_name: 'chkValeTarjetas', semantic_name: 'delivered_sticker_voucher', content_signature: 'Boolean. Vehicle windshield sticker voucher delivered.', indexable_as: ['checklist_item'] },
      chkVencimentoGNV: { original_name: 'chkVencimentoGNV', semantic_name: 'delivered_gnv_certificate', content_signature: 'Boolean. GNV tank inspection certificate delivered.', indexable_as: ['checklist_item', 'brazilian_vehicle_compliance'] },
      chkInspecaoVeicular: { original_name: 'chkInspecaoVeicular', semantic_name: 'delivered_vehicle_inspection', content_signature: 'Boolean. Vehicle inspection report delivered.', indexable_as: ['checklist_item', 'brazilian_vehicle_compliance'] },
      chkLaudo: { original_name: 'chkLaudo', semantic_name: 'delivered_technical_report', content_signature: 'Boolean. Technical/structural inspection report (laudo) delivered.', indexable_as: ['checklist_item'] },
      chkNotaFiscal: { original_name: 'chkNotaFiscal', semantic_name: 'delivered_invoice_nfe', content_signature: 'Boolean. NF-e (electronic invoice) delivered.', indexable_as: ['checklist_item'] },
      chkOutros1: { original_name: 'chkOutros1', semantic_name: 'delivered_other_item_1', content_signature: 'Boolean. Catch-all for additional delivered items.', indexable_as: ['checklist_item'] },
      chkOutros2: { original_name: 'chkOutros2', semantic_name: 'delivered_other_item_2', content_signature: 'Boolean. Second catch-all for additional delivered items.', indexable_as: ['checklist_item'] },
      // Outstanding fines parallel arrays — normalize to outstanding_fines_at_handover[]
      'txtMulta{1..5}': {
        original_name: 'txtMulta1 … txtMulta5',
        semantic_name: 'outstanding_fines_at_handover[].description',
        content_signature: 'Free-text fine description, e.g. "MULTA VELOCIDADE 120KM/H". Up to 5 parallel fields.',
        indexable_as: [],
        notes: 'NORMALIZE with vrMulta{N} and dtMulta{N} into outstanding_fines_at_handover[] array.',
      },
      'vrMulta{1..5}': {
        original_name: 'vrMulta1 … vrMulta5',
        semantic_name: 'outstanding_fines_at_handover[].amount_brl',
        content_signature: 'Decimal BRL, fine amount.',
        indexable_as: ['pricing'],
      },
      'dtMulta{1..5}': {
        original_name: 'dtMulta1 … dtMulta5',
        semantic_name: 'outstanding_fines_at_handover[].date',
        content_signature: 'Access Date → ISO date of the fine.',
        indexable_as: [],
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbPedidosClientes — client want-list / pipeline (139 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbPedidosClientes: {
    mdb_table: 'tbPedidosClientes',
    supabase_table: 'orders',
    semantic_name: 'customer_vehicle_pipeline',
    description: 'Wish-list entries: vehicles a client is looking for, with budget and payment details. Also used for service follow-up.',
    row_count_approx: 139,
    fields: {
      pedID: { original_name: 'pedID', semantic_name: 'order_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      DtPedido: { original_name: 'DtPedido', semantic_name: 'order_date', content_signature: 'Access Date → ISO date.', indexable_as: [] },
      cliNome: { original_name: 'cliNome', semantic_name: 'client_name', content_signature: 'Denormalized client name (not always FK). Uppercase.', indexable_as: ['person_name'] },
      cliFones: { original_name: 'cliFones', semantic_name: 'client_phones', content_signature: 'Free-text phone(s), may contain multiple numbers separated by / or ,.', indexable_as: ['contact', 'phone_br'] },
      cliEmail: { original_name: 'cliEmail', semantic_name: 'client_email', content_signature: 'Email address.', indexable_as: ['contact', 'email'] },
      carDescricao: { original_name: 'carDescricao', semantic_name: 'vehicle_description', content_signature: 'Free-text wish description, e.g. "ZAFIRA OU DOBLO 7L", "CELTA OU GOL ATE 2010".', indexable_as: ['vehicle_model'] },
      carAno: { original_name: 'carAno', semantic_name: 'desired_manufacture_year', content_signature: 'Integer year.', indexable_as: [] },
      carAnoModelo: { original_name: 'carAnoModelo', semantic_name: 'desired_model_year', content_signature: 'Integer year.', indexable_as: [] },
      carCor: { original_name: 'carCor', semantic_name: 'desired_color', content_signature: 'Free-text color preference.', indexable_as: [] },
      carValor: { original_name: 'carValor', semantic_name: 'desired_max_price_brl', content_signature: 'Decimal BRL, client budget ceiling.', indexable_as: ['pricing'] },
      cliFormaPagto: { original_name: 'cliFormaPagto', semantic_name: 'payment_form_or_trade_in', content_signature: 'Free-text, often describes trade-in, e.g. "TEM UM AGILE LT 2010" or "FINANCIADO".', indexable_as: [] },
      funID: { original_name: 'funID', semantic_name: 'salesperson_id', content_signature: 'Integer FK → tbFuncionario / tbFornecedor. Assigned salesperson.', indexable_as: ['party_id'], fk_table: 'tbFornecedor' },
      Observacoes: { original_name: 'Observacoes', semantic_name: 'order_notes', content_signature: 'Free-text memo.', indexable_as: [] },
      statusID: { original_name: 'statusID', semantic_name: 'order_status_code', content_signature: 'Integer FK → enumTipo=50. 131=EM ABERTO, 132=ATENDIDO, 133=CANCELADO.', indexable_as: [], enum_type: 50 },
      tipoPedido: { original_name: 'tipoPedido', semantic_name: 'order_type_code', content_signature: 'Integer FK → enumTipo=80. 134=ATENDIMENTO, 135=OFERTA, 136=PROCURA.', indexable_as: [], enum_type: 80 },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbVeiculoMulta — traffic fines per vehicle (335 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbVeiculoMulta: {
    mdb_table: 'tbVeiculoMulta',
    supabase_table: 'vehicle_fines',
    semantic_name: 'vehicle_traffic_fine',
    description: 'Traffic fines attached to specific vehicles while in the dealer\'s possession.',
    row_count_approx: 335,
    fields: {
      muID: { original_name: 'muID', semantic_name: 'fine_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      muDtPagto: { original_name: 'muDtPagto', semantic_name: 'fine_payment_date', content_signature: 'Access Date → ISO date. Null = unpaid.', indexable_as: [] },
      muValorPagto: { original_name: 'muValorPagto', semantic_name: 'fine_amount_paid_brl', content_signature: 'Decimal BRL.', indexable_as: ['pricing'] },
      muDtRec: { original_name: 'muDtRec', semantic_name: 'fine_received_date', content_signature: 'Access Date → ISO date, when fine notice was received.', indexable_as: [] },
      muValorRec: { original_name: 'muValorRec', semantic_name: 'fine_amount_received_brl', content_signature: 'Decimal BRL, face value of fine.', indexable_as: ['pricing'] },
      muDescricao: { original_name: 'muDescricao', semantic_name: 'fine_description', content_signature: 'Free-text, e.g. "1 MULTA DE 12/10/2013 GUIA 474809778 DE CINTO SEGURANÇA".', indexable_as: ['ledger_description'] },
      movID: { original_name: 'movID', semantic_name: 'ledger_entry_id', content_signature: 'Integer FK → tbMovimento.movID. The cash-flow entry for this fine payment.', indexable_as: ['ledger_entry_id'], fk_table: 'tbMovimento' },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbVeiculoPendencia — open items per vehicle (174 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbVeiculoPendencia: {
    mdb_table: 'tbVeiculoPendencia',
    supabase_table: 'vehicle_pendencies',
    semantic_name: 'vehicle_open_item',
    description: 'Outstanding action items or document pendencies for a vehicle. Tracks resolution date and responsible party.',
    row_count_approx: 174,
    fields: {
      pendID: { original_name: 'pendID', semantic_name: 'pendency_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
      pendData: { original_name: 'pendData', semantic_name: 'pendency_created_date', content_signature: 'Access Date → ISO date.', indexable_as: [] },
      pendDataBaixa: { original_name: 'pendDataBaixa', semantic_name: 'pendency_resolved_date', content_signature: 'Access Date → ISO date. Null = still open.', indexable_as: [] },
      pendDescri: { original_name: 'pendDescri', semantic_name: 'pendency_description', content_signature: 'Free-text, e.g. "DUT", "PROCURAÇÃO", "RECIBO E PROCURAÇÃO", "LAUDO CAUTELAR".', indexable_as: [] },
      pendHistorico: { original_name: 'pendHistorico', semantic_name: 'pendency_audit_trail', content_signature: 'Free-text audit trail, concatenated notes about resolution progress.', indexable_as: [] },
      pednTipo: { original_name: 'pednTipo', semantic_name: 'responsible_party_type_code', content_signature: 'Integer FK → enumTipo=400. e.g. 137=CLIENTE, 138=DESPACHANTE, 139=FINANCEIRA.', indexable_as: [], enum_type: 400 },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbContasCorrentes — dealer bank accounts (28 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbContasCorrentes: {
    mdb_table: 'tbContasCorrentes',
    supabase_table: 'bank_accounts',
    semantic_name: 'dealer_bank_account',
    description: 'The dealer\'s own bank accounts used for operational cash flow.',
    row_count_approx: 28,
    fields: {
      ccID: { original_name: 'ccID', semantic_name: 'bank_account_id', content_signature: 'Auto-increment integer.', indexable_as: ['bank_account'] },
      ccNome: { original_name: 'ccNome', semantic_name: 'account_alias', content_signature: 'Human-readable name, e.g. "ITAÚ SILVÉRIO", "CAIXA INTERNA".', indexable_as: ['bank_account'] },
      ccBanco: { original_name: 'ccBanco', semantic_name: 'bank_code_br', content_signature: '3-digit Brazilian bank code, e.g. "341" = Itaú, "237" = Bradesco, "001" = Banco do Brasil.', indexable_as: ['bank_account'] },
      ccAgencia: { original_name: 'ccAgencia', semantic_name: 'bank_agency_number', content_signature: 'Agency number, free-text.', indexable_as: ['bank_account'] },
      ccConta: { original_name: 'ccConta', semantic_name: 'bank_account_number', content_signature: 'Account number, free-text.', indexable_as: ['bank_account'] },
      ccTipo: { original_name: 'ccTipo', semantic_name: 'account_type_code', content_signature: 'Integer FK → enumTipo=38. e.g. 109=CONTA CORRENTE, 113=CAPTAÇÃO.', indexable_as: ['bank_account'], enum_type: 38 },
      ccLimite: { original_name: 'ccLimite', semantic_name: 'credit_limit_brl', content_signature: 'Decimal BRL, overdraft or credit limit.', indexable_as: ['pricing'] },
      ccContaPadrao: { original_name: 'ccContaPadrao', semantic_name: 'is_default_account', content_signature: 'Boolean. True = this is the default operational account.', indexable_as: [] },
      ccGerente: { original_name: 'ccGerente', semantic_name: 'account_manager_name', content_signature: 'Free-text name of the bank account manager.', indexable_as: ['person_name'] },
      ccCarteira: { original_name: 'ccCarteira', semantic_name: 'boleto_portfolio_code', content_signature: 'Bank portfolio code used for boleto (bank slip) generation.', indexable_as: [] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // tbCadastroTextos — legal text templates (159 rows)
  // ────────────────────────────────────────────────────────────────────────────
  tbCadastroTextos: {
    mdb_table: 'tbCadastroTextos',
    supabase_table: 'text_configurations',
    semantic_name: 'legal_document_template',
    description: 'Reusable legal text templates (purchase receipts, sale declarations, warranties, powers of attorney). NOT user data — these are boilerplate documents.',
    row_count_approx: 159,
    fields: {
      txtID: { original_name: 'txtID', semantic_name: 'template_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      txtDescri: { original_name: 'txtDescri', semantic_name: 'template_label', content_signature: 'Human label, e.g. "RECIBO DE COMPRA ( PADRÃO SILVÉRIO )", "GARANTIA 90 DIAS".', indexable_as: ['legal_template'] },
      txtTexto: { original_name: 'txtTexto', semantic_name: 'template_body_portuguese', content_signature: 'Full Portuguese legal template text. May be several paragraphs. Contains placeholder tokens like [NOME_CLIENTE], [PLACA], [VALOR].', indexable_as: ['legal_template', 'portuguese_contract'] },
      txtTipo: { original_name: 'txtTipo', semantic_name: 'template_type_code', content_signature: 'Integer FK → enumTipo=10. e.g. 39=RECIBO DE COMPRA, 37=GARANTIA.', indexable_as: ['legal_template'], enum_type: 10 },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // NFe tables — Brazilian electronic invoice (5,552–5,573 rows each)
  // ────────────────────────────────────────────────────────────────────────────
  'tbNFe_ide': {
    mdb_table: 'tbNFe ide',
    supabase_table: 'nfe_ide',
    semantic_name: 'nfe_invoice_header',
    description: 'NFe header (SEFAZ standard). Preserve original field names for downstream Brazilian tax software compatibility. Key cross-reference: nNF + serie identifies the invoice.',
    row_count_approx: 5552,
    fields: {
      idNFe: { original_name: 'idNFe', semantic_name: 'nfe_access_key', content_signature: '44-character NFe access key, unique per invoice.', indexable_as: ['brazilian_id'] },
      nNF: { original_name: 'nNF', semantic_name: 'invoice_number', content_signature: 'Integer invoice number within the series.', indexable_as: [] },
      serie: { original_name: 'serie', semantic_name: 'invoice_series', content_signature: 'Integer, typically 1.', indexable_as: [] },
      dEmi: { original_name: 'dEmi', semantic_name: 'issue_date', content_signature: 'Access Date → ISO date.', indexable_as: [] },
      natOp: { original_name: 'natOp', semantic_name: 'operation_nature', content_signature: 'Free-text, e.g. "Venda", "Compra", "Devolução".', indexable_as: [] },
      tpNF: { original_name: 'tpNF', semantic_name: 'invoice_direction', content_signature: 'Integer: 0=Entrada (inbound), 1=Saída (outbound).', indexable_as: [] },
      nStatus: { original_name: 'nStatus', semantic_name: 'sefaz_status', content_signature: 'Integer SEFAZ processing status code.', indexable_as: [] },
      carID: { original_name: 'carID', semantic_name: 'vehicle_id', content_signature: 'Integer FK → tbVeiculo.carID when NF relates to a vehicle.', indexable_as: ['vehicle_id'], fk_table: 'tbVeiculo' },
    },
  },

  'tbNFe_prod': {
    mdb_table: 'tbNFe prod',
    supabase_table: 'nfe_prod',
    semantic_name: 'nfe_invoice_item',
    description: 'NFe line items. xProd field is the richest natural-language vehicle description in the entire database — use as secondary source for vehicle metadata.',
    row_count_approx: 5573,
    fields: {
      xProd: {
        original_name: 'xProd',
        semantic_name: 'product_description',
        content_signature: 'Full vehicle description embedding model, year, chassis, RENAVAM, e.g. "CHEVROLET MONTANA OFF ROAD 1.4 2011/2012 PRATA CH:9BGXF80004C206086 RENAVAM:00951924770". Cross-reference with tbVeiculo for validation.',
        indexable_as: ['vehicle_model', 'vehicle_description_natural_language', 'vin'],
      },
      vProd: { original_name: 'vProd', semantic_name: 'item_amount_brl', content_signature: 'Decimal BRL, item total value.', indexable_as: ['pricing'] },
      NCM: { original_name: 'NCM', semantic_name: 'ncm_code', content_signature: '8-digit NCM product classification code.', indexable_as: [] },
      CFOP: { original_name: 'CFOP', semantic_name: 'cfop_code', content_signature: '4-digit CFOP fiscal operation code.', indexable_as: [] },
      vFrete: { original_name: 'vFrete', semantic_name: 'freight_amount_brl', content_signature: 'Decimal BRL.', indexable_as: ['pricing'] },
      vSeg: { original_name: 'vSeg', semantic_name: 'insurance_amount_brl', content_signature: 'Decimal BRL.', indexable_as: ['pricing'] },
      vDesc: { original_name: 'vDesc', semantic_name: 'discount_amount_brl', content_signature: 'Decimal BRL.', indexable_as: ['pricing'] },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Dimension / lookup tables
  // ────────────────────────────────────────────────────────────────────────────
  tbOrigemCliente: {
    mdb_table: 'tbOrigemCliente',
    supabase_table: 'customer_origins',
    semantic_name: 'customer_acquisition_source_catalog',
    description: 'Lookup table of customer acquisition channels. Tenant-configurable. Common values: JÁ É CLIENTE, WEBMOTORS, PASSAGEM, FACEBOOK, INDICAÇÃO, OLX, INSTAGRAM.',
    row_count_approx: 38,
    fields: {
      oriID: { original_name: 'oriID', semantic_name: 'source_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      oriDescri: { original_name: 'oriDescri', semantic_name: 'source_name', content_signature: 'Free-text channel name in uppercase.', indexable_as: ['customer_acquisition_source'] },
    },
  },

  tbPlanoContas: {
    mdb_table: 'tbPlanoContas',
    supabase_table: 'plan_accounts',
    semantic_name: 'chart_of_accounts',
    description: '2-level chart of accounts hierarchy. gr0 and gr1 group accounts into categories.',
    row_count_approx: 94,
    fields: {
      plaID: { original_name: 'plaID', semantic_name: 'account_id', content_signature: 'Auto-increment integer.', indexable_as: [] },
      PlaNome: { original_name: 'PlaNome', semantic_name: 'account_name', content_signature: 'Account name in uppercase, e.g. "ENERGIA ELÉTRICA", "COMBUSTÍVEL", "ADMINISTRATIVAS".', indexable_as: ['ledger_description'] },
      gr0: { original_name: 'gr0', semantic_name: 'account_group_level_0', content_signature: 'Top-level grouping category.', indexable_as: [] },
      gr1: { original_name: 'gr1', semantic_name: 'account_group_level_1', content_signature: 'Second-level grouping category.', indexable_as: [] },
    },
  },
}

// ─── LLM-readable summary ─────────────────────────────────────────────────────

/**
 * Returns a compact text summary of a table's fields for inclusion in LLM prompts.
 * Format: "semantic_name (original_name): content_signature [tags]"
 */
export function tableSummaryForLLM(mdbTableName: string): string {
  const table = FIELD_MAP[mdbTableName]
  if (!table) return `Unknown table: ${mdbTableName}`
  const lines = [
    `Table: ${table.mdb_table} → ${table.supabase_table ?? '(no Supabase mapping)'} [~${table.row_count_approx.toLocaleString()} rows]`,
    `Description: ${table.description}`,
    '',
    ...Object.entries(table.fields).map(([, f]) => {
      const tags = f.indexable_as.length > 0 ? ` [${f.indexable_as.join(', ')}]` : ''
      const enumNote = f.enum_type !== undefined ? ` (enum:${f.enum_type})` : ''
      return `  ${f.semantic_name} (${f.original_name})${enumNote}: ${f.content_signature}${tags}`
    }),
  ]
  return lines.join('\n')
}
