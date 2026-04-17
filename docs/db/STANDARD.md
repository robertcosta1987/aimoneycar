# Moneycar Database Standard

## Authority Chain

The authoritative source of truth for the Moneycar database schema is:

```
estrutura_banco_de_dados_moneycar.xlsx
    ↓ encoded as
packages/moneycar-schema/src/moneycar-schema.standard.ts
    ↓ consumed by
apps/import-service   (field mapping + proxyColumnFilters)
apps/web/lib/ai       (system prompt via generateSchemaPrompt())
packages/database     (SQL migrations)
```

All agents, importers, and data layers must derive their field mappings from `moneycar-schema.standard.ts`. Never hardcode field names from the MDB without checking the standard first.

## Critical Non-Obvious Rules

### 1. tbDadosCompra.cliID → tbCliente (NOT tbFornecedor)
When a vehicle is purchased from a person (not a business), the seller is registered as a **customer** (`tbCliente`), not a vendor (`tbFornecedor`). The `cliID` field in `tbDadosCompra` is the seller's customer ID. The `forID` field in the same table references the payment intermediary or financing institution.

In `purchase_data`: `seller_customer_external_id` = cliID (customer), `supplier_external_id` = forID (vendor/business).

### 2. tbVeiculo.carConsignado and carDistrato are FKs, not booleans
Both fields are foreign keys to `tbCadastroTextos`, not boolean flags. Inventory status is derived:
- `carConsignado` IS NULL AND `carDistrato` IS NULL → `owned_stock`
- `carConsignado` IS NOT NULL → `consigned`
- `carDistrato` IS NOT NULL → `consignment_returned`

### 3. Salesperson identification chain
`tbDadosVenda.vendedorID` is a **forID** (FK to `tbFornecedor`), NOT a funID. To get the employee:
```
vendedorID (forID) → tbFuncionario.forID → tbFuncionario.funID → employees.external_id
```

Employee names: `tbFuncionario.forID → tbFornecedor.forRazSoc`

### 4. tbComissao.forID → tbFornecedor (salesperson)
Commission records link to the salesperson via `forID` (tbFornecedor PK), not `funID` (tbFuncionario PK). Translate: `forID → tbFuncionario.forID → funID`.

### 5. Enum resolution
`tbEnumGeral` is a polymorphic dictionary. Every FK to it requires filtering by `enuTipo` group. See `ENUM_GROUPS` in `packages/moneycar-schema/src/moneycar-enum-groups.ts` for the group registry (54 groups).

## Schema Package

```
packages/moneycar-schema/
├── src/
│   ├── moneycar-schema.standard.ts   # TableSpec/FieldSpec definitions for all ~25 MDB tables
│   ├── moneycar-enum-groups.ts        # ENUM_GROUPS registry (54 enum tipo groups)
│   ├── moneycar-relationships.ts      # Relationship graph + findJoinPath + KNOWN_PATHS
│   ├── schema-prompt.ts               # generateSchemaPrompt() — compact AI-injectable text
│   ├── index.ts                       # Barrel exports
│   └── schema-compliance.test.ts      # Compliance tests
├── package.json
└── tsconfig.json
```

## Migration Sequence

| # | File | Purpose |
|---|------|---------|
| 001 | initial.sql | Core tables |
| 002 | mdb_full_import.sql | Full import support |
| 003-008 | calendar*.sql, fixes | Calendar and dashboard |
| 009 | import_status_stages.sql | Import status stages |
| 010 | sale_data_employee.sql | Salesperson on sale_data |
| 011 | fix_calendario_config_fk.sql | ON DELETE SET NULL for employee FK |
| 012 | purchase_data_seller.sql | Seller (customer) + supplier UUID on purchase_data |

## Field Naming Conventions (MDB → Postgres)

| MDB pattern | Postgres column |
|-------------|----------------|
| carID | external_id (vehicles) |
| cliID | customer_external_id / seller_customer_external_id |
| forID | vendor_external_id / supplier_external_id |
| funID | employee_external_id |
| forID (in tbFuncionario) | forIdToFunId translation map |
| coID / comID | external_id (commissions, both variants) |
| cpaID / coID | external_id (commission_standards, both variants) |
| salID / funcID | external_id (employee_salaries, both variants) |
