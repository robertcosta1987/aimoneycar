/**
 * packages/moneycar-schema/src/schema-prompt.ts
 * Generates the compact schema block injected into the AI agent's system prompt.
 * Derived from MONEYCAR_SCHEMA + KNOWN_PATHS — never write this output by hand.
 */

import { MONEYCAR_SCHEMA } from './moneycar-schema.standard'
import { KNOWN_PATHS } from './moneycar-relationships'
import { ENUM_GROUPS } from './moneycar-enum-groups'

export function generateSchemaPrompt(): string {
  const lines: string[] = []

  lines.push('## TABELAS E RELACIONAMENTOS MONEYCAR (fonte de verdade)')
  lines.push('AGENTE: use SOMENTE os edges abaixo. Nunca invente um JOIN.')
  lines.push('')

  for (const table of Object.values(MONEYCAR_SCHEMA)) {
    const pk = Array.isArray(table.primaryKey)
      ? table.primaryKey.join(', ')
      : table.primaryKey
    lines.push(`**${table.name}** [PK: ${pk}]${table.isJunctionTable ? ' [junction]' : ''}`)
    if (table.notes) {
      const shortNote = table.notes.split('.')[0]
      lines.push(`  → ${shortNote}`)
    }

    const fkFields = table.fields.filter(f => f.isForeignKey && !f.legacyNote?.startsWith('Alternate'))
    for (const f of fkFields) {
      if (f.referencesTable === 'tbEnumGeral') {
        const groupName = Object.entries(ENUM_GROUPS)
          .find(([, v]) => v === f.enumGroup)?.[0] ?? `group_${f.enumGroup}`
        lines.push(`  ${f.name} → tbEnumGeral/${groupName}`)
      } else if (f.referencesTable) {
        const note = f.rule ? ` ⚠️ ${f.rule.split('.')[0]}` : (f.description ? ` — ${f.description.split('.')[0]}` : '')
        lines.push(`  ${f.name} → ${f.referencesTable}${note}`)
      } else if (f.referencesTables) {
        lines.push(`  ${f.name} → [${f.referencesTables.join(' | ')}] (polymorphic, try in order)`)
      }
    }
    lines.push('')
  }

  lines.push('## CAMINHOS DE JOIN PRÉ-VALIDADOS')
  lines.push('Use estes atalhos — não recalcule joins:')
  for (const [key, { path, note }] of Object.entries(KNOWN_PATHS)) {
    lines.push(`- ${key}: ${path.join(' → ')}`)
    lines.push(`  (${note})`)
  }

  lines.push('')
  lines.push('## REGRAS DO AGENTE')
  lines.push('- NUNCA invente um join path. Use apenas os edges acima.')
  lines.push('- tbDadosCompra.cliID → tbCliente (vendedor registrado como cliente, NÃO tbFornecedor)')
  lines.push('- tbVeiculo.carConsignado e carDistrato são FKs para tbCadastroTextos (não booleanos)')
  lines.push('- Para nome do vendedor: tbDadosVenda.vendedorID → tbFornecedor.forRazSoc')
  lines.push('- Para nome do funcionário: tbFuncionario.forID → tbFornecedor.forRazSoc')
  lines.push('- Para comissão por veiculo: tbComissao.forID → tbFornecedor (salesperson)')
  lines.push('- tbMovimento é o ledger geral. Para P&L: use tbVisaoGeralMovimentacao se disponível')
  lines.push('- Nunca exponha enums como inteiros. Resolva via tbEnumGeral antes de mostrar ao usuário')

  return lines.join('\n')
}
