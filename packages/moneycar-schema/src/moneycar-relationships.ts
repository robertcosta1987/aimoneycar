/**
 * packages/moneycar-schema/src/moneycar-relationships.ts
 * Derived from MONEYCAR_SCHEMA — do not hand-edit FK edges here.
 * Add any new FK to moneycar-schema.standard.ts and this file updates conceptually.
 */

import { MONEYCAR_SCHEMA } from './moneycar-schema.standard'

export interface Relationship {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  cardinality: 'many-to-one' | 'one-to-one' | 'one-to-many'
  isPolymorphic: boolean
  alternativeTargets?: string[]
  enumGroup?: number
  note?: string
}

/** All FK relationships extracted from MONEYCAR_SCHEMA */
export const RELATIONSHIPS: Relationship[] = (() => {
  const rels: Relationship[] = []
  for (const table of Object.values(MONEYCAR_SCHEMA)) {
    const oneToOne = table.oneToOneWith
    for (const field of table.fields) {
      if (!field.isForeignKey) continue
      if (field.referencesTable) {
        rels.push({
          fromTable: table.name,
          fromColumn: field.name,
          toTable: field.referencesTable,
          toColumn: field.referencesTable === 'tbEnumGeral' ? 'enuID' : field.referencesTable === 'tbVeiculo' ? 'carID' : field.referencesTable === 'tbCliente' ? 'cliid' : field.referencesTable === 'tbFornecedor' ? 'forID' : field.referencesTable === 'tbFuncionario' ? 'funID' : 'id',
          cardinality: oneToOne === field.referencesTable ? 'one-to-one' : 'many-to-one',
          isPolymorphic: false,
          enumGroup: field.enumGroup,
          note: field.rule ?? field.description,
        })
      } else if (field.referencesTables) {
        rels.push({
          fromTable: table.name,
          fromColumn: field.name,
          toTable: field.referencesTables[0],
          toColumn: 'id',
          cardinality: 'many-to-one',
          isPolymorphic: true,
          alternativeTargets: field.referencesTables,
          note: field.rule ?? field.description,
        })
      }
    }
  }
  return rels
})()

/**
 * Find all FK edges from one table to another (direct or via known join paths).
 * Returns null if no path exists. Max depth = 3 hops.
 */
export function findJoinPath(from: string, to: string, maxDepth = 3): Relationship[] | null {
  if (from === to) return []

  function dfs(current: string, target: string, depth: number, visited: Set<string>): Relationship[] | null {
    if (depth === 0) return null
    const edges = RELATIONSHIPS.filter(r => r.fromTable === current && !visited.has(r.toTable))
    for (const edge of edges) {
      if (edge.toTable === target) return [edge]
      visited.add(edge.toTable)
      const rest = dfs(edge.toTable, target, depth - 1, visited)
      if (rest) return [edge, ...rest]
      visited.delete(edge.toTable)
    }
    return null
  }

  return dfs(from, to, maxDepth, new Set([from]))
}

/**
 * Well-known join paths pre-computed for agent use.
 * The agent MUST use these paths — never invent new join edges.
 */
export const KNOWN_PATHS: Record<string, { path: string[]; note: string }> = {
  'vehicle→buyer':       { path: ['tbVeiculo', 'tbDadosVenda', 'tbCliente'],  note: 'tbDadosVenda.cliID → tbCliente' },
  'vehicle→seller':      { path: ['tbVeiculo', 'tbDadosCompra', 'tbCliente'], note: 'tbDadosCompra.cliID → tbCliente (seller is a customer)' },
  'vehicle→salesperson': { path: ['tbVeiculo', 'tbDadosVenda', 'tbFornecedor'], note: 'tbDadosVenda.vendedorID → tbFornecedor (then .forRazSoc for name)' },
  'vehicle→commission':  { path: ['tbVeiculo', 'tbComissao', 'tbFornecedor'], note: 'tbComissao.forID → tbFornecedor for salesperson' },
  'vehicle→brand':       { path: ['tbVeiculo', 'tbFabricantes'],              note: 'tbVeiculo.fabID → tbFabricantes.fabNome' },
  'vehicle→financing':   { path: ['tbVeiculo', 'tbFinanciamento', 'tbFornecedor'], note: 'tbFinanciamento.forID → tbFornecedor (forTipo=FINANCEIRA)' },
  'employee→name':       { path: ['tbFuncionario', 'tbFornecedor'],           note: 'tbFuncionario.forID → tbFornecedor.forRazSoc' },
  'commission→employee': { path: ['tbComissao', 'tbFornecedor', 'tbFuncionario'], note: 'tbComissao.forID=tbFornecedor.forID → tbFuncionario.forID=funID' },
  'movement→account':    { path: ['tbMovimento', 'tbPlanoContas'],            note: 'tbMovimento.plaID → tbPlanoContas.PlaNome' },
  'movement→vehicle':    { path: ['tbMovimento', 'tbVeiculo'],                note: 'tbMovimento.carReferencia → tbVeiculo.carID' },
}
