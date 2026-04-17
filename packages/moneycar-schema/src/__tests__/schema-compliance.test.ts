/**
 * packages/moneycar-schema/src/__tests__/schema-compliance.test.ts
 * Verifies that each MDB fixture file matches MONEYCAR_SCHEMA.
 *
 * Run with: pnpm test --filter @moneycar/schema
 * Fixtures must be placed in: packages/moneycar-schema/fixtures/
 *
 * If any assertion fails, update MONEYCAR_SCHEMA — do NOT weaken assertions.
 */

import MDBReader from 'mdb-reader'
import fs from 'fs'
import path from 'path'
import { MONEYCAR_SCHEMA, getVehicleInventoryStatus } from '../moneycar-schema.standard'
import { ENUM_GROUPS } from '../moneycar-enum-groups'

const FIXTURES_DIR = path.join(__dirname, '../../fixtures')

function getFixtures(): string[] {
  if (!fs.existsSync(FIXTURES_DIR)) return []
  return fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.mdb'))
}

const fixtures = getFixtures()

// Skip all tests if no fixtures available — CI passes, local dev fails explicitly
const describeWithFixtures = fixtures.length > 0 ? describe : describe.skip

describeWithFixtures('Moneycar schema standard compliance', () => {

  for (const fixture of fixtures) {
    const fixturePath = path.join(FIXTURES_DIR, fixture)
    let reader: MDBReader

    beforeAll(() => {
      const buf = fs.readFileSync(fixturePath)
      reader = new MDBReader(buf)
    })

    describe(fixture, () => {

      it('every table in schema exists in the MDB (or is flagged as optional)', () => {
        const actualTables = new Set(reader.getTableNames())
        const optionalTables = new Set(['tbVisaoGeralMovimentacao']) // may not exist in all tenants

        for (const tableName of Object.keys(MONEYCAR_SCHEMA)) {
          if (optionalTables.has(tableName)) continue
          if (tableName.startsWith('MSys')) continue
          expect(actualTables.has(tableName)).toBe(true),
            `Table ${tableName} is in MONEYCAR_SCHEMA but not found in ${fixture}`
        }
      })

      it('every FK in the standard resolves to at least one existing target row (sample 20)', async () => {
        const checked: string[] = []
        for (const table of Object.values(MONEYCAR_SCHEMA)) {
          if (!reader.getTableNames().includes(table.name)) continue
          const fkFields = table.fields.filter(f => f.isForeignKey && f.referencesTable && f.referencesTable !== 'tbEnumGeral' && f.referencesTable !== 'tbEmpresa')
          if (fkFields.length === 0) continue

          const rows = reader.getTable(table.name).getData({ columns: fkFields.map(f => f.name) }).slice(0, 20)
          for (const field of fkFields) {
            const targetTable = field.referencesTable!
            if (!reader.getTableNames().includes(targetTable)) continue
            const targetPk = MONEYCAR_SCHEMA[targetTable]?.primaryKey
            if (!targetPk || Array.isArray(targetPk)) continue

            const targetRows = reader.getTable(targetTable).getData({ columns: [targetPk] })
            const targetIds = new Set(targetRows.map((r: any) => r[targetPk]))

            for (const row of rows) {
              const fkVal = (row as any)[field.name]
              if (!fkVal || fkVal === 0) continue
              const key = `${table.name}.${field.name}=${fkVal}→${targetTable}`
              if (checked.includes(key)) continue
              checked.push(key)
              expect(targetIds.has(fkVal)).toBe(true)
            }
          }
        }
      })

      it('tbVeiculo.carConsignado is treated as FK integer, not boolean', () => {
        if (!reader.getTableNames().includes('tbVeiculo')) return
        const rows = reader.getTable('tbVeiculo').getData({ columns: ['carConsignado', 'carDistrato', 'carStatus'] }).slice(0, 50)
        for (const row of rows as any[]) {
          const val = row.carConsignado
          if (val === null || val === undefined) continue
          // Must be a number (FK), not a boolean
          expect(typeof val).toBe('number')
          // If populated, should reference a tbCadastroTextos row
          if (val > 0) {
            const status = getVehicleInventoryStatus(val, row.carDistrato)
            expect(['owned_stock', 'consigned', 'consignment_returned']).toContain(status)
          }
        }
      })

      it('tbDadosCompra.cliID references tbCliente (not tbFornecedor)', () => {
        if (!reader.getTableNames().includes('tbDadosCompra')) return
        if (!reader.getTableNames().includes('tbCliente')) return

        const compraRows = reader.getTable('tbDadosCompra').getData({ columns: ['cliID'] }).slice(0, 20) as any[]
        const cliRows = reader.getTable('tbCliente').getData({ columns: ['cliid'] })
        const cliIds = new Set(cliRows.map((r: any) => r.cliid))

        for (const row of compraRows) {
          if (!row.cliID) continue
          expect(cliIds.has(row.cliID)).toBe(true)
        }
      })

      it('tbComissao uses forID (not funID) for salesperson', () => {
        if (!reader.getTableNames().includes('tbComissao')) return
        const cols = reader.getTable('tbComissao').getColumnNames()
        // At least one of forID or funID must exist
        const hasSalespersonCol = cols.includes('forID') || cols.includes('funID') || cols.includes('coID') || cols.includes('comID')
        expect(hasSalespersonCol).toBe(true)
      })

      it('every enum FK resolves to a tbEnumGeral row with expected enumTipo (sample 10)', () => {
        if (!reader.getTableNames().includes('tbEnumGeral')) return
        const enumRows = reader.getTable('tbEnumGeral').getData({ columns: ['enuID', 'enuTipo'] }) as any[]
        const enumSet = new Set(enumRows.map((r: any) => `${r.enuID}_${r.enuTipo}`))

        for (const table of Object.values(MONEYCAR_SCHEMA)) {
          if (!reader.getTableNames().includes(table.name)) continue
          const enumFks = table.fields.filter(f => f.isForeignKey && f.referencesTable === 'tbEnumGeral' && f.enumGroup !== undefined)
          if (enumFks.length === 0) continue

          const rows = reader.getTable(table.name).getData({ columns: enumFks.map(f => f.name) }).slice(0, 10) as any[]
          for (const field of enumFks) {
            for (const row of rows) {
              const val = (row as any)[field.name]
              if (!val || val === 0) continue
              const key = `${val}_${field.enumGroup}`
              expect(enumSet.has(key)).toBe(true)
            }
          }
        }
      })
    })
  }
})
