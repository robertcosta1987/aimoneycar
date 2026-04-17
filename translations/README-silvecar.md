# Silvecar (empID=582) — Translation Layer Reference

**Source file:** `Moneycar-582-Silvecar-2026-04-13_-_sem_visao_geral.mdb` (544 MB)
**Tenant:** Silverio Multimarcas Com. de Autom. Ltda ME — CNPJ 09.210.753/0001-04 — Sorocaba/SP
**Total rows (approx):** 1.1 M across 43 tables
**Generated:** 2026-04-13

---

## Files in this directory

| File | Purpose |
|---|---|
| `silvecar-582-extension.ts` | Field-level descriptor map (`FIELD_MAP`) — every MDB column with semantic name, content signature, canonical tags, and enum/FK metadata |
| `enum-registry.ts` | Centralized decoder for `tbEnumGeral` — enumTipo → {enumID: label}; `resolveEnum()` runtime helper |
| `canonical-tags.ts` | Semantic tag → field-path index for LLM retrieval; `getTaggedFields()` / `getFieldTags()` helpers |
| `README-silvecar.md` | This file |

The existing high-level documentation is in `/MONEYCAR_AI_FIELD_MAP.md`. This README documents **what is new or different** in the Silvecar dump relative to that baseline.

---

## Tables covered by this extension

All 24 tables below had fields not present or not fully documented in `MONEYCAR_AI_FIELD_MAP.md`.

| MDB Table | Supabase Table | Row Count | Notes |
|---|---|---|---|
| `tbCliente` | `customers` | 13,232 | PK column is lowercase `cliid`, not `cliID` |
| `tbClienteComplemento` | `customer_complements` | 163 | Full demographic complement (marital, education, occupation) |
| `tbClienteDadosComerciais` | `customer_commercial_data` | 143 | Employment + full spouse (`conjuge_*`) block |
| `tbClienteReferenciasBens` | `customer_asset_references` | 185 | 2 personal refs, 2 bank accounts, 3 assets |
| `tbVeiculo` | `vehicles` | 10,842 | Incl. FIPE, floor price, web price, GNV expiry |
| `tbDadosCompra` | `purchase_data` | 62,407 | Vehicle acquisition records |
| `tbDadosVenda` | `sale_data` | 49,403 | Vehicle sale records |
| `tbMovimento` | `expenses` | 549,503 | Polymorphic ledger — `movSinal` occasionally carries role codes (see §Gotchas) |
| `tbFornecedor` | `vendors` / `employees` | 15,438 | Polymorphic party directory — `forTipo` discriminates role |
| `tbFuncionario` | `employees` | 244 | Extends `tbFornecedor` row; additional labor fields |
| `tbfuncionarioSalario` | `commission_standards` | 293 | Tiered commission rates per transaction type |
| `tbFinanciamento` | `financings` | 11,198 | Financing details incl. TAC, kickback (`finIdxRetorno`) |
| `tbSeguro` | `insurances` | 10,842 | Insurance policies incl. kickback (`segIdxRet`) |
| `tbComissao` | `commissions` | 25,998 | Actual paid commission per deal |
| `tbRateioVeiculo` | `vehicle_apportionment` | 27,037 | Parallel arrays `Data{1..10}` / `Valor{1..10}` / `Tipo{1..10}` |
| `tbVeiculoDocumento` | `vehicle_documents` | 10,860 | 9 boolean checklist items for purchase-side workflow |
| `tbVeiculoProtocoloEntrega` | `vehicle_delivery_protocols` | 10,309 | 17 boolean checklists + 5 fine arrays |
| `tbPedidosClientes` | `orders` | 139 | Customer want-list / pipeline |
| `tbVeiculoMulta` | `vehicle_fines` | 335 | Traffic fines attached to vehicle |
| `tbVeiculoPendencia` | `vehicle_pendencies` | 174 | Open documentation/regulatory pendencies |
| `tbContasCorrentes` | `bank_accounts` | 28 | Dealership bank accounts |
| `tbCadastroTextos` | `text_configurations` | 159 | Legal document templates |
| `tbNFe_ide` | `nfe_ide` | 5,552 | NFe invoice header |
| `tbNFe_prod` | `nfe_prod` | 5,573 | NFe invoice line items |
| `tbPlanoContas` | *(reference)* | 94 | Chart of accounts (import maps to `expenses.account_plan`) |
| `tbOrigemCliente` | `customer_origins` | 38 | Customer acquisition source lookup |

### Tables NOT yet in the extension (stubs needed)

These appear in the MDB but are not yet fully mapped:

- `tbVeiculoDocumentoCompra` — purchase-side document checklist, identical schema to `tbVeiculoDocumento`
- `tbBancosCadastro` — Brazilian bank reference list (~28 rows)
- `tbFabricantes` — manufacturer catalog (211 rows) — linked from `tbVeiculo.carFabricante`
- `tbCombustivel` — fuel type lookup (12 rows)
- `tbOpcionais` — optional equipment catalog (178 rows), grouped by `optGrupo` (enumTipo=41)
- `tbVeiculoOpcionais` — vehicle ↔ optional junction table
- `tbveiculoTroca` — trade-in junction
- `tbMotivoCancelamento` — cancellation reason master (6 rows; overlaps enumTipo=29)
- `tbNaturezaOp` — fiscal operation nature + CFOP codes (25 rows)
- `tbNFe_emit` / `tbNFe_dest` — NFe issuer/recipient tables (~5,552 rows each)
- `tbDespesaPosVenda` — post-sale expense classification flags

---

## New canonical tags introduced

The following tags were added in `canonical-tags.ts` and are not present in the baseline field map:

| Tag | What it covers |
|---|---|
| `party_id` | Primary keys across `tbCliente` and `tbFornecedor` in both MDB and Supabase |
| `driver_license` | `cliCNH`, `cliCNH_Categoria` on clients and forwarders |
| `personal_document` | Unified tag for CPF, CNPJ, RG, CNH, PIS, labor card across all party tables |
| `email` | Email-only subset of `contact` |
| `phone_br` | Phone-only subset of `contact` |
| `cep` | Brazilian ZIP code (`cliCEP`, `forCEP`) |
| `vin` | Chassis / VIN number |
| `vehicle_description_natural_language` | Free-text natural language description of a vehicle (NFe `xProd`, `movDescri`, `carDescri`) |
| `fipe` | FIPE reference value (`carValorTabela`) |
| `floor_price` | Minimum authorized sale price (`carValorMinimo`) |
| `public_price` | Web listing price (`carValorWeb`) |
| `ledger_entry_id` | Movement/expense primary key |
| `payment_status` | Movement and financing payment state |
| `dealer_commission` | Kickback/return index on financings and insurances |
| `kickback` | Narrower tag: actual kickback amount + receipt date |
| `brazilian_tax_withholding` | IR, INSS, other tax withheld from a `tbMovimento` entry |
| `brazilian_vehicle_tax` | IPVA, DPVAT in checklists and document tables |
| `brazilian_financing_fee` | TAC (Tarifa de Abertura de Crédito) in financings and apportionment |
| `brazilian_vehicle_compliance` | GNV kit expiry, vehicle inspection, laudo, licensing |
| `brazilian_labor_id` | PIS, Carteira de Trabalho (`funCT`, `funCT_serie`) |
| `spouse_profile` | Full `conjuge_*` block in `tbClienteDadosComerciais` |
| `employment` | Employer name, CNPJ, role, admission date, monthly income |
| `financial_profile` | Monthly income, other incomes, bank accounts, asset values |
| `personal_reference` | Two named personal references (name, relationship, phone) |
| `asset_declaration` | Three declared assets (type, description, current value, lien, creditor) |
| `bank_account` | Dealership accounts (`tbContasCorrentes`) and client bank data |
| `legal_template` | Text templates in `tbCadastroTextos` |
| `portuguese_contract` | Free-text contract body (`txtTexto`) |
| `checklist_item` | Boolean document checklist fields across `tbVeiculoDocumento` and `tbVeiculoProtocoloEntrega` |
| `consent` | `cliOpt_in` — marketing/communication opt-in |
| `customer_acquisition_source` | Where/how the customer was acquired |

---

## Polymorphic gotchas

### 1. `tbFornecedor` — one table, many roles

`tbFornecedor` (15,438 rows) is a **polymorphic party directory**. The discriminator is `forTipo` (enumTipo=7):

| forTipo value | Label | Notes |
|---|---|---|
| 22 | INTERNO | Reserved / system |
| 23 | INTERNO | Duplicate — older entries |
| 24 | DESPACHANTE | Vehicle licensing agent |
| 25 | FINANCEIRA | Financing bank or lender |
| 26 | FORNECEDOR | General supplier |
| 27 | CORRETORAS | Insurance broker |
| 28 | PREST.SERVIÇO | Service provider |
| 29 | CLIENTE | Customer (rare — clients also appear here) |

Employee rows (`funID` in `tbFuncionario`) point to a `forID` row in `tbFornecedor` — so every employee is also a supplier row. **Always filter by `forTipo` before querying suppliers by role.**

`resolveParty(row)` in `silvecar-582-extension.ts` builds a normalized `Party` object from any `tbFornecedor` row.

### 2. `movSinal` overloading in `tbMovimento`

`tbMovimento.movSinal` is declared as enumTipo=14 (76=CRÉDITO, 77=DÉBITO). However, a subset of historical rows stores **supplier-role codes** (e.g. `79` for VENDA) in this field due to a legacy overload inherited from older Moneycar versions.

**Safe access pattern:**

```typescript
const sign = resolveEnum(14, row.movSinal)
// if sign === String(row.movSinal) (no mapping found), treat as anomalous
// and fall back to raw integer or contextual inference
```

Do NOT assume `movSinal` is always 76 or 77. Always validate the resolved label before branching on debit/credit.

### 3. `tbRateioVeiculo` — parallel arrays `Data{1..10}` / `Valor{1..10}` / `Tipo{1..10}`

`tbRateioVeiculo` stores up to 10 payment installments as **parallel positional arrays** rather than child rows:

```
Data1 / Valor1 / Tipo1   — installment 1 (date / amount / payment method)
Data2 / Valor2 / Tipo2   — installment 2
…
Data10 / Valor10 / Tipo10 — installment 10
```

Unused slots are `NULL`. `Tipo{n}` is an integer FK → enumTipo=40 (119=DINHEIRO, 120=CHEQUE, 121=CARTÃO CRÉDITO, 122=CARTÃO DÉBITO, 123=OUTROS).

When normalizing to Supabase `vehicle_apportionment`, collect `{ date, amount, type }` for each non-null slot and write them as a `payment_splits` JSONB array.

The same parallel-array pattern appears in `tbVeiculoProtocoloEntrega` for traffic fines: `multa_tipo{1..5}` / `multa_valor{1..5}` / `multa_data{1..5}`.

### 4. `cliCNPJ_CPF` — one column, two document types

`tbCliente.cliCNPJ_CPF` holds **either a CPF or a CNPJ** in the same text column. Disambiguate by digit count after stripping non-numeric characters:

```typescript
const digits = raw.replace(/\D/g, '')
const cpf  = digits.length === 11 ? raw : null
const cnpj = digits.length === 14 ? raw : null
```

Do not assume format consistency — values may include masks (`123.456.789-01`), partial masks, or be entirely numeric. Always strip before counting.

### 5. `tbFuncionario` / `tbfuncionarioSalario` — tiered commission rates

Each employee salary record in `tbfuncionarioSalario` stores **two thresholds** per transaction type (purchase, sale, financing, insurance, dispatch):

- `funComCompra1` / `funComCompra2` — commission rates at tier 1 / tier 2 for vehicle purchases
- `funComVenda1` / `funComVenda2` — for sales
- `funComFinanciamento1` / `funComFinanciamento2` — for financed deals
- `funComSeguro1` / `funComSeguro2` — for insurance
- `FunComDespachante1` / `FunComDespachante2` — for dispatch fees

The tier boundary (the amount at which tier 1 switches to tier 2) is not stored in this table — it is defined in the business rules / commission plan, not in the MDB.

### 6. `tbNFe_prod.xProd` — richest vehicle description

The NFe line-item description (`xProd`) is the most complete human-readable vehicle description in the entire schema. It typically includes make, model, trim, year, color, and chassis/VIN, e.g.:

```
CHEVROLET MONTANA OFF ROAD 1.4 2011/2012 PRATA VIN:9BG...
```

When building LLM prompts or search indices, prefer `xProd` over `carDescri` for natural-language vehicle descriptions.

---

## Enum groups quick reference

Full registry is in `enum-registry.ts`. Most commonly referenced groups:

| enumTipo | Domain | Key values |
|---|---|---|
| 0 | gender | 1=MASCULINO, 2=FEMININO, 3=PESSOA JURÍDICA |
| 1 | client_status | 3=ATIVO, 4=INATIVO |
| 2 | vehicle_category | 6=NOVO, 7=SEMI-NOVO, 10=CARRO, 11=MOTO, 12=CAMINHÃO |
| 3 | vehicle_status | 10=DISPONÍVEL, 11=VENDIDO, 12=DEVOLVIDO |
| 5 | movement_status | 16=PREVISAO, 18=EMITIDO, 19=CANCELADO |
| 7 | supplier_role | 24=DESPACHANTE, 25=FINANCEIRA, 27=CORRETORAS — see §Gotchas |
| 11 | payment_method | 42=BOLETO, 44=CHEQUE, 45=DEPÓSITO, 46=DINHEIRO |
| 12 | brazilian_state | 72=SP (most common in Silvecar) |
| 14 | movement_sign | 76=CRÉDITO, 77=DÉBITO — see §Gotchas |
| 15 | transaction_modality | 78=COMPRA, 79=VENDA, 80=FINANCIAMENTO, 81=SEGURO |
| 21 | movement_payment_status | 100=ABERTO, 101=PAGO |
| 38 | bank_account_type | 109=CONTA CORRENTE, 110=POUPANÇA, 114=INTERNO |
| 39 | financial_status | 115=ABERTO, 116=PAGO, 117=CANCELADO, 118=CONCILIADO |
| 40 | installment_payment_method | 119=DINHEIRO, 120=CHEQUE, 121=CARTÃO CRÉDITO |
| 41 | option_group | 124=GERAL, 125=INTERNO, 126=EXTERNO, 127=MECÂNICA |
| 600 | marital_status | 144=SOLTEIRO(A), 145=CASADO(A) |
| 720 | icms_exemption_reason | 169=TÁXI, 170=DEFICIENTE FÍSICO, 172=FROTISTA/LOCADORA |

---

## Runtime usage

```typescript
import { FIELD_MAP, resolveFieldValue, resolveParty } from './silvecar-582-extension'
import { resolveEnum, mergeEnumRows } from './enum-registry'
import { getTaggedFields, getFieldTags } from './canonical-tags'

// Resolve an enum FK
resolveEnum(7, 25)              // → "FINANCEIRA"
resolveEnum(12, 72)             // → "SP"

// Get all fields in a table
const clienteFields = FIELD_MAP.tbCliente.fields

// Resolve a typed field value
const descriptor = clienteFields['cliStatus']
resolveFieldValue(descriptor, 3)  // → "ATIVO"

// Look up fields by semantic concept
getTaggedFields('spouse_profile')
// → ['mdb.tbClienteDadosComerciais.conjuge_Nome', …]

// Look up which concepts a field belongs to
getFieldTags('mdb.tbCliente.cliCNPJ_CPF')
// → ['brazilian_id', 'tax_id', 'personal_document']

// Build a Party from a tbFornecedor row
resolveParty(forRow)  // → { id, name, role: "FINANCEIRA", tax_id, is_individual }

// Merge tenant-specific enum rows (call after loading MDB)
mergeEnumRows(tbEnumGeralRows)  // adds new entries without overwriting existing

// Get a compact LLM-ready summary of a table
import { tableSummaryForLLM } from './silvecar-582-extension'
tableSummaryForLLM('tbMovimento')
```

---

## Column name pitfalls

Known cases where the MDB column name differs from what you'd expect based on naming patterns:

| Table | Expected | Actual | Impact |
|---|---|---|---|
| `tbCliente` | `cliID` | `cliid` | Filtering `r.cliID` returns `undefined` — zero customers imported |
| `tbCliente` | `cliLogradouro` | `CliEnd` | Address street field (capital C, no prefix) |
| `tbCliente` | `cliTelefone` | `cliFone1` / `cliFone2` | Phone is split across numbered fields |
| `tbCliente` | `cliCPF` / `cliCNPJ` | `cliCNPJ_CPF` | Single combined field — split by digit count |
| `tbCliente` | `cliRG` | `cliRG_IE` | Holds either RG (individual) or IE (state tax registration for companies) |
| `tbCliente` | `cliObservacoes` | `cliOBS` | Notes field |
| `tbCliente` | `cliDataNascimento` | `cliDataNasc` | Birth date |

When adding column filters for new tables, always validate against actual `Object.keys(rows[0])` output from a test row before assuming naming conventions hold.
