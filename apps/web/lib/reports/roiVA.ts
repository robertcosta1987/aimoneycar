/**
 * lib/reports/roiVA.ts
 *
 * Gera o Relatório de ROI e Valor Agregado do Moneycar AI.
 * Conteúdo consolidado de todas as funcionalidades da plataforma,
 * com estimativas de retorno, benefícios e impacto operacional.
 * Exportável como HTML autossuficiente.
 */

export interface Feature {
  id: string
  categoria: string
  nome: string
  descricao: string
  beneficios: string[]
  roiEstimado: string
  economiaHoras: string | null   // horas/mês economizadas
  impactoReceita: string | null  // impacto em receita estimado
  impactoMargem: string | null
  kpis: { label: string; valor: string; cor: string }[]
  nivel: 'alto' | 'medio' | 'base'  // nível de impacto
}

export const features: Feature[] = [
  {
    id: 'chat-ia',
    categoria: 'Inteligência Artificial',
    nome: 'Assistente IA Interno (Chat IA)',
    descricao:
      'Assistente de inteligência artificial disponível 24/7 para equipe interna. Responde dúvidas sobre veículos, tabela FIPE, documentação, financiamentos, legislação e processos com base no contexto da revenda. Elimina buscas manuais em sites externos e reduz dependência de gestores.',
    beneficios: [
      'Respostas instantâneas sobre precificação, FIPE e condições de mercado',
      'Apoio técnico para vendedores durante negociações',
      'Onboarding acelerado de novos colaboradores',
      'Redução de erros por desinformação ou decisão sem dados',
      'Acesso imediato ao histórico e contexto da revenda',
    ],
    roiEstimado: '4x–8x',
    economiaHoras: '20–40h/mês',
    impactoReceita: null,
    impactoMargem: '+0,5% a +1,5% por negociação mais bem embasada',
    kpis: [
      { label: 'Horas economizadas/mês', valor: '20–40h', cor: '#3b82f6' },
      { label: 'Redução de erros de precificação', valor: '~80%', cor: '#22c55e' },
      { label: 'Disponibilidade', valor: '24/7', cor: '#8b5cf6' },
    ],
    nivel: 'alto',
  },
  {
    id: 'chat-clientes',
    categoria: 'Atendimento ao Cliente',
    nome: 'Chat IA para Clientes',
    descricao:
      'Canal de atendimento digital inteligente integrado ao site da revenda. O cliente inicia a conversa a qualquer hora e recebe respostas imediatas sobre estoque disponível, condições de financiamento, agendamento de visitas e promoções. Leads capturados automaticamente e encaminhados para a equipe de vendas.',
    beneficios: [
      'Atendimento digital disponível fora do horário comercial',
      'Captura e qualificação automática de leads',
      'Redução do tempo de resposta de horas para segundos',
      'Filtro de intenção: separa compradores sérios de curiosos',
      'Integração direta com agenda para agendamento instantâneo',
    ],
    roiEstimado: '6x–12x',
    economiaHoras: '15–25h/mês',
    impactoReceita: '+3 a +8 vendas adicionais/mês por leads capturados',
    impactoMargem: null,
    kpis: [
      { label: 'Leads adicionais/mês', valor: '+3 a +8', cor: '#22c55e' },
      { label: 'Tempo de resposta', valor: '<5 segundos', cor: '#3b82f6' },
      { label: 'Disponibilidade', valor: '24/7', cor: '#8b5cf6' },
    ],
    nivel: 'alto',
  },
  {
    id: 'whatsapp-ia',
    categoria: 'Inteligência Artificial',
    nome: 'WhatsApp IA — Atendimento Automático',
    descricao:
      'Integração completa com WhatsApp Business via WASender. O assistente de IA responde clientes automaticamente, apresenta veículos do estoque, esclarece dúvidas sobre financiamento e, o mais importante, agenda visitas presenciais diretamente na agenda da revenda — tudo sem intervenção humana. Suporte a agendamento, cancelamento e reagendamento via conversa natural.',
    beneficios: [
      'Respostas automáticas 24/7 no canal preferido do cliente brasileiro',
      'Agendamento de visitas direto pelo WhatsApp sem operador',
      'Nunca perde um lead por demora no atendimento',
      'Tom personalizado com nome, endereço e telefone da revenda',
      'Transferência para humano quando necessário, com alerta automático',
      'Redução de abandono por falta de resposta rápida',
    ],
    roiEstimado: '8x–15x',
    economiaHoras: '30–60h/mês',
    impactoReceita: '+5 a +15 agendamentos/mês que seriam perdidos',
    impactoMargem: null,
    kpis: [
      { label: 'Agendamentos automáticos/mês', valor: '+5 a +15', cor: '#22c55e' },
      { label: 'Redução de leads perdidos', valor: '~70%', cor: '#3b82f6' },
      { label: 'Operadores adicionais necessários', valor: 'Zero', cor: '#8b5cf6' },
    ],
    nivel: 'alto',
  },
  {
    id: 'agenda',
    categoria: 'Operacional',
    nome: 'Agenda Integrada de Atendimentos',
    descricao:
      'Sistema de agendamento centralizado, integrado com Chat IA, WhatsApp AI e Chat Clientes. Elimina conflitos de horário, centraliza todos os compromissos em um único lugar e permite que clientes agendem visitas presenciais de forma autônoma. Visualização por dia/semana com histórico completo.',
    beneficios: [
      'Zero conflito de agenda entre membros da equipe',
      'Clientes agendam sozinhos sem ocupar a equipe',
      'Histórico de visitas e conversões por agendamento',
      'Redução de no-shows por lembretes automáticos',
      'Visibilidade em tempo real de capacidade de atendimento',
    ],
    roiEstimado: '3x–5x',
    economiaHoras: '10–20h/mês',
    impactoReceita: null,
    impactoMargem: null,
    kpis: [
      { label: 'Horas de coordenação economizadas', valor: '10–20h/mês', cor: '#3b82f6' },
      { label: 'Redução de conflitos de agenda', valor: '~100%', cor: '#22c55e' },
      { label: 'Agendamentos self-service', valor: 'Ilimitados', cor: '#8b5cf6' },
    ],
    nivel: 'medio',
  },
  {
    id: 'gestao-veiculos',
    categoria: 'Operacional',
    nome: 'Gestão Completa de Estoque',
    descricao:
      'Cadastro, atualização e visualização de todo o estoque em tempo real. Controle de entrada, custos de aquisição, gastos com preparação, margem esperada e status de venda. Base de dados estruturada que alimenta todos os módulos de IA, relatórios e análises da plataforma.',
    beneficios: [
      'Visibilidade total do estoque em tempo real',
      'Base estruturada para análises automáticas de margem e giro',
      'Histórico completo de cada veículo: compra, custos, venda',
      'Eliminação de planilhas manuais e informações dispersas',
      'Fundação para todos os demais módulos de inteligência',
    ],
    roiEstimado: '2x–4x',
    economiaHoras: '10–15h/mês',
    impactoReceita: null,
    impactoMargem: 'Garante precisão de margem em 100% das negociações',
    kpis: [
      { label: 'Precisão de dados de estoque', valor: '100%', cor: '#22c55e' },
      { label: 'Planilhas eliminadas', valor: 'Todas', cor: '#3b82f6' },
      { label: 'Tempo de busca por veículo', valor: '<30 seg', cor: '#8b5cf6' },
    ],
    nivel: 'base',
  },
  {
    id: 'giro-estoque',
    categoria: 'Análise de Estoque',
    nome: 'Giro de Estoque e Envelhecimento',
    descricao:
      'Monitoramento automático do tempo de permanência de cada veículo em estoque. Categoriza veículos por faixas (0–15, 16–30, 31–60 e +60 dias) com alertas visuais e notificações para ação imediata. Identifica capital imobilizado em veículos parados e apoia decisões de reprecificação ou desconto estratégico.',
    beneficios: [
      'Identificação imediata de veículos com risco de desvalorização',
      'Alertas automáticos antes que o problema se agrave',
      'Base para decisões de desconto estratégico antes da perda de valor',
      'Redução do ciclo médio de estoque',
      'Liberação de capital para novas aquisições mais rentáveis',
      'Análise de performance de compra por modelo/marca',
    ],
    roiEstimado: '5x–10x',
    economiaHoras: '8–12h/mês',
    impactoReceita: 'Liberação de R$30k–R$100k em capital imobilizado/mês',
    impactoMargem: '+2% a +4% por redução de veículos em oferta forçada',
    kpis: [
      { label: 'Redução do ciclo de estoque', valor: '15–25%', cor: '#22c55e' },
      { label: 'Capital liberado estimado', valor: 'R$30k–100k/mês', cor: '#3b82f6' },
      { label: 'Melhora de margem média', valor: '+2% a +4%', cor: '#f59e0b' },
    ],
    nivel: 'alto',
  },
  {
    id: 'custos-margem',
    categoria: 'Financeiro',
    nome: 'Custos & Margem por Veículo',
    descricao:
      'Lançamento e controle de todos os custos associados a cada veículo: aquisição, preparação, documentação, funilaria, mecânica, vistoria e outros. Cálculo automático de margem real após todos os custos. Identifica veículos vendidos abaixo do custo real e padrões de gasto que comprometem a rentabilidade.',
    beneficios: [
      'Margem real calculada automaticamente em cada venda',
      'Eliminação de vendas acidentais abaixo do custo',
      'Identificação de categorias de custo que mais impactam a margem',
      'Histórico de custo por tipo de veículo para compras futuras mais inteligentes',
      'Dados precisos para negociações e precificação estratégica',
    ],
    roiEstimado: '10x–20x',
    economiaHoras: '5–10h/mês',
    impactoReceita: null,
    impactoMargem: '+3% a +8% por eliminação de vendas desinformadas',
    kpis: [
      { label: 'Precisão de margem por venda', valor: '100%', cor: '#22c55e' },
      { label: 'Melhora de margem média', valor: '+3% a +8%', cor: '#f59e0b' },
      { label: 'Vendas abaixo do custo', valor: 'Eliminadas', cor: '#3b82f6' },
    ],
    nivel: 'alto',
  },
  {
    id: 'alertas',
    categoria: 'Inteligência Artificial',
    nome: 'Alertas Inteligentes com IA',
    descricao:
      'Sistema de monitoramento contínuo com alertas gerados por IA baseados em dados reais do negócio. Notificações proativas sobre veículos em envelhecimento crítico, margens abaixo do esperado, anomalias financeiras, solicitações de atendimento humano pelo WhatsApp e oportunidades de ação imediata.',
    beneficios: [
      'Gestão proativa em vez de reativa: antecipa problemas',
      'Zero perda de informação crítica no dia a dia',
      'Alertas priorizados por urgência e impacto financeiro',
      'Visibilidade de solicitações de atendimento humano via IA',
      'Redução de perdas por falta de ação no momento certo',
    ],
    roiEstimado: '3x–6x',
    economiaHoras: null,
    impactoReceita: 'Cada alerta atendido pode representar R$1k–R$5k de impacto evitado',
    impactoMargem: null,
    kpis: [
      { label: 'Alertas críticos detectados/mês', valor: '5–20', cor: '#ef4444' },
      { label: 'Tempo de resposta a problemas', valor: 'Horas vs. dias', cor: '#3b82f6' },
      { label: 'Impacto evitado por alerta', valor: 'R$1k–R$5k', cor: '#22c55e' },
    ],
    nivel: 'medio',
  },
  {
    id: 'despesas',
    categoria: 'Financeiro',
    nome: 'Controle de Despesas Operacionais',
    descricao:
      'Registro e categorização de todas as despesas operacionais da revenda: aluguel, salários, marketing, taxas, serviços de terceiros e outros. Visão consolidada do fluxo de caixa e estrutura de custos fixos e variáveis. Base para cálculo de lucratividade real e planejamento tributário.',
    beneficios: [
      'Visão completa do fluxo de caixa em tempo real',
      'Categorização automática facilita análise por centro de custo',
      'Dados prontos para declaração fiscal e contabilidade',
      'Identificação de despesas desnecessárias ou excessivas',
      'Relatórios de despesas prontos para reuniões de gestão',
    ],
    roiEstimado: '2x–4x',
    economiaHoras: '8–16h/mês',
    impactoReceita: null,
    impactoMargem: 'Controle de despesas pode reduzir custos em 5–15%',
    kpis: [
      { label: 'Horas de contabilidade economizadas', valor: '8–16h/mês', cor: '#3b82f6' },
      { label: 'Redução de despesas identificáveis', valor: '5–15%', cor: '#22c55e' },
      { label: 'Tempo para preparar balanço', valor: 'Minutos vs. horas', cor: '#8b5cf6' },
    ],
    nivel: 'base',
  },
  {
    id: 'relatorios',
    categoria: 'Análise e Relatórios',
    nome: 'Relatórios de Performance por Período',
    descricao:
      'Painel analítico completo com visão de vendas, estoque, despesas e performance operacional. Seleção por período rolling (7, 30, 90, 365 dias) ou por mês específico, permitindo comparação histórica. Gráficos de evolução de faturamento, lucro, volume de vendas e aging de estoque. Recomendações automáticas da IA baseadas nos dados do período.',
    beneficios: [
      'Visão completa do negócio em segundos, não horas',
      'Análise de meses históricos para identificar tendências',
      'Recomendações automáticas da IA baseadas em dados reais',
      'Eliminação de relatórios manuais em planilhas',
      'Dados confiáveis para tomada de decisão gerencial',
      'Comparação de performance entre períodos',
    ],
    roiEstimado: '4x–8x',
    economiaHoras: '15–30h/mês',
    impactoReceita: null,
    impactoMargem: null,
    kpis: [
      { label: 'Horas de relatório eliminadas', valor: '15–30h/mês', cor: '#3b82f6' },
      { label: 'Tempo para gerar relatório', valor: '<1 minuto', cor: '#22c55e' },
      { label: 'Profundidade histórica', valor: '24 meses', cor: '#8b5cf6' },
    ],
    nivel: 'medio',
  },
  {
    id: 'relatorio-executivo',
    categoria: 'Análise e Relatórios',
    nome: 'Relatório Executivo com Exportação HTML',
    descricao:
      'Relatório executivo completo com análise financeira, performance de vendas, saúde do estoque, despesas categorizadas, dados de financiamentos e métricas operacionais. Gerado automaticamente e exportável como HTML autocontido, perfeito para apresentações a sócios, investidores ou gestores. Inclui alertas e recomendações estratégicas geradas por IA.',
    beneficios: [
      'Relatório de nível C-level gerado em menos de 1 minuto',
      'Exportação HTML com gráficos que funcionam em qualquer dispositivo',
      'Resumo executivo gerado automaticamente pela IA',
      'Alertas e recomendações estratégicas integrados',
      'Ideal para reuniões com sócios, investidores e financiadores',
      'Consolida dados de todas as áreas do negócio em um documento',
    ],
    roiEstimado: '5x–10x',
    economiaHoras: '10–20h/mês',
    impactoReceita: null,
    impactoMargem: null,
    kpis: [
      { label: 'Tempo para preparar relatório executivo', valor: '<60 segundos', cor: '#22c55e' },
      { label: 'Horas de consolidação eliminadas', valor: '10–20h/mês', cor: '#3b82f6' },
      { label: 'Qualidade profissional para apresentações', valor: 'Sim', cor: '#8b5cf6' },
    ],
    nivel: 'medio',
  },
  {
    id: 'email-reports',
    categoria: 'Análise e Relatórios',
    nome: 'Relatórios Automáticos por E-mail',
    descricao:
      'Agendamento de envio automático de relatórios de performance por e-mail para gestores, sócios ou consultores. Configuração de frequência (diário, semanal, mensal), destinatários e período de cobertura. Zero esforço manual para manter stakeholders informados.',
    beneficios: [
      'Stakeholders sempre informados sem nenhum esforço manual',
      'Consistência: relatório enviado sempre no prazo configurado',
      'Elimina o risco de "esqueci de enviar o relatório"',
      'Sócios e investidores recebem dados em primeira mão',
      'Histórico de envios para auditoria e governança',
    ],
    roiEstimado: '3x–6x',
    economiaHoras: '5–10h/mês',
    impactoReceita: null,
    impactoMargem: null,
    kpis: [
      { label: 'Esforço de envio de relatórios', valor: 'Zero', cor: '#22c55e' },
      { label: 'Horas/mês economizadas', valor: '5–10h', cor: '#3b82f6' },
      { label: 'Taxa de entrega no prazo', valor: '100%', cor: '#8b5cf6' },
    ],
    nivel: 'base',
  },
  {
    id: 'importar',
    categoria: 'Operacional',
    nome: 'Importação de Dados de Veículos',
    descricao:
      'Ferramenta para importação em massa de dados de veículos a partir de planilhas ou sistemas legados. Elimina o trabalho manual de cadastro individual, especialmente útil em migrações iniciais ou atualizações de estoque em grande volume.',
    beneficios: [
      'Migração de dados históricos sem retrabalho manual',
      'Cadastro em massa de estoque inicial em minutos',
      'Redução de erros de digitação em importações grandes',
      'Integração com dados existentes da revenda',
    ],
    roiEstimado: '2x–4x',
    economiaHoras: '20–40h na implantação',
    impactoReceita: null,
    impactoMargem: null,
    kpis: [
      { label: 'Veículos importados por lote', valor: 'Ilimitado', cor: '#3b82f6' },
      { label: 'Horas economizadas na implantação', valor: '20–40h', cor: '#22c55e' },
      { label: 'Taxa de erro vs. digitação manual', valor: '<1%', cor: '#8b5cf6' },
    ],
    nivel: 'base',
  },
]

// ─── Estatísticas consolidadas ────────────────────────────────────────────────

export const consolidado = {
  totalHorasMes:        '130–280h',
  economiaFuncionario:  '0,75 a 1,75 FTE equivalente',
  impactoReceitaMes:    '+8 a +30 vendas adicionais potenciais',
  roiMedioPlatforma:    '5x–10x',
  modulosIA:            features.filter(f => f.categoria === 'Inteligência Artificial').length,
  totalFuncionalidades: features.length,
  disponibilidade:      '24/7',
}

// ─── HTML Generator ───────────────────────────────────────────────────────────

function escape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function nivelLabel(n: Feature['nivel']) {
  return n === 'alto' ? 'Alto Impacto' : n === 'medio' ? 'Médio Impacto' : 'Fundação'
}
function nivelColor(n: Feature['nivel']) {
  return n === 'alto' ? '#16a34a' : n === 'medio' ? '#2563eb' : '#6b7280'
}
function nivelBg(n: Feature['nivel']) {
  return n === 'alto' ? '#f0fdf4' : n === 'medio' ? '#eff6ff' : '#f9fafb'
}
function nivelBorder(n: Feature['nivel']) {
  return n === 'alto' ? '#bbf7d0' : n === 'medio' ? '#bfdbfe' : '#e5e7eb'
}

function catColor(c: string): string {
  const map: Record<string, string> = {
    'Inteligência Artificial': '#7c3aed',
    'Atendimento ao Cliente':  '#0284c7',
    'Operacional':             '#0891b2',
    'Financeiro':              '#b45309',
    'Análise e Relatórios':    '#1d4ed8',
    'Análise de Estoque':      '#15803d',
  }
  return map[c] ?? '#374151'
}

function featureCard(f: Feature): string {
  const kpiItems = f.kpis.map(k =>
    `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;text-align:center;flex:1;min-width:120px">
      <div style="font-size:18px;font-weight:800;color:${k.cor}">${k.valor}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:3px">${k.label}</div>
    </div>`
  ).join('')

  const bullets = f.beneficios.map(b =>
    `<li style="padding:3px 0;font-size:13px;color:#374151">${b}</li>`
  ).join('')

  const extras = [
    f.economiaHoras    ? `<div style="display:inline-block;margin:3px 4px 3px 0;padding:4px 10px;background:#eff6ff;border-radius:20px;font-size:11px;color:#1d4ed8;font-weight:600">⏱ ${f.economiaHoras} economizados</div>` : '',
    f.impactoReceita   ? `<div style="display:inline-block;margin:3px 4px 3px 0;padding:4px 10px;background:#f0fdf4;border-radius:20px;font-size:11px;color:#15803d;font-weight:600">📈 ${f.impactoReceita}</div>` : '',
    f.impactoMargem    ? `<div style="display:inline-block;margin:3px 4px 3px 0;padding:4px 10px;background:#fefce8;border-radius:20px;font-size:11px;color:#854d0e;font-weight:600">💰 ${f.impactoMargem}</div>` : '',
  ].join('')

  return `
<div style="border:1px solid ${nivelBorder(f.nivel)};border-radius:14px;padding:24px;margin-bottom:20px;background:${nivelBg(f.nivel)};page-break-inside:avoid">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
    <div>
      <span style="display:inline-block;padding:3px 10px;border-radius:20px;background:${catColor(f.categoria)}22;color:${catColor(f.categoria)};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${f.categoria}</span>
      <h3 style="margin:0;font-size:17px;font-weight:800;color:#111827">${f.nome}</h3>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="padding:4px 12px;border-radius:20px;background:${nivelBg(f.nivel)};border:1px solid ${nivelBorder(f.nivel)};color:${nivelColor(f.nivel)};font-size:11px;font-weight:700">${nivelLabel(f.nivel)}</span>
      <span style="padding:4px 14px;border-radius:20px;background:#111827;color:#fff;font-size:12px;font-weight:800">ROI ${f.roiEstimado}</span>
    </div>
  </div>

  <p style="margin:0 0 14px;font-size:13px;color:#374151;line-height:1.65">${f.descricao}</p>

  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${extras}</div>

  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">${kpiItems}</div>

  <div>
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Principais Benefícios</p>
    <ul style="margin:0;padding-left:18px">${bullets}</ul>
  </div>
</div>`
}

export function generateRoiHTML(): string {
  const byCategory = features.reduce<Record<string, Feature[]>>((acc, f) => {
    ;(acc[f.categoria] = acc[f.categoria] ?? []).push(f)
    return acc
  }, {})

  const categorySections = Object.entries(byCategory).map(([cat, feats]) => `
<div style="margin-bottom:40px">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #e5e7eb">
    <div style="width:4px;height:28px;background:${catColor(cat)};border-radius:2px"></div>
    <h2 style="margin:0;font-size:20px;font-weight:800;color:#111827">${cat}</h2>
    <span style="padding:3px 10px;border-radius:20px;background:${catColor(cat)}18;color:${catColor(cat)};font-size:11px;font-weight:700">${feats.length} funcionalidade${feats.length > 1 ? 's' : ''}</span>
  </div>
  ${feats.map(featureCard).join('')}
</div>`
  ).join('')

  const tableRows = features.map((f, i) => `
<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
  <td style="padding:8px 12px;font-size:12px;color:#111827;font-weight:600;border-bottom:1px solid #f3f4f6">${f.nome}</td>
  <td style="padding:8px 12px;font-size:11px;color:${catColor(f.categoria)};font-weight:700;border-bottom:1px solid #f3f4f6">${f.categoria}</td>
  <td style="padding:8px 12px;font-size:12px;font-weight:800;color:#111827;border-bottom:1px solid #f3f4f6">${f.roiEstimado}</td>
  <td style="padding:8px 12px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6">${f.economiaHoras ?? '—'}</td>
  <td style="padding:8px 12px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6">${f.impactoReceita ?? f.impactoMargem ?? '—'}</td>
  <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #f3f4f6">
    <span style="padding:3px 10px;border-radius:20px;background:${nivelBg(f.nivel)};border:1px solid ${nivelBorder(f.nivel)};color:${nivelColor(f.nivel)};font-size:10px;font-weight:700">${nivelLabel(f.nivel)}</span>
  </td>
</tr>`).join('')

  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Moneycar AI — ROI e Valor Agregado</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:32px;background:#fff;color:#111827;max-width:960px;margin:0 auto}
    @media print{
      body{padding:0;max-width:100%;font-size:10pt}
      .no-print{display:none!important}
    }
    @page{margin:15mm}
  </style>
</head>
<body>

<!-- CAPA -->
<div style="text-align:center;padding:48px 24px 36px;border-radius:20px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%);margin-bottom:40px;color:#fff">
  <div style="display:inline-block;padding:6px 20px;border-radius:20px;background:#ffffff22;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px">Relatório Estratégico</div>
  <div style="font-size:13px;color:#94a3b8;font-weight:600;margin-bottom:8px">Moneycar AI</div>
  <h1 style="margin:0 0 12px;font-size:36px;font-weight:900;color:#fff;line-height:1.2">ROI e Valor Agregado</h1>
  <p style="margin:0 0 24px;font-size:16px;color:#cbd5e1;max-width:520px;margin:0 auto 24px;line-height:1.6">
    Análise consolidada de todas as funcionalidades disponíveis na plataforma,
    com retorno sobre investimento, benefícios operacionais e impacto direto no resultado da revenda.
  </p>
  <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-top:28px">
    <div style="background:#ffffff18;border:1px solid #ffffff30;border-radius:12px;padding:14px 24px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#22c55e">${consolidado.totalFuncionalidades}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">Funcionalidades</div>
    </div>
    <div style="background:#ffffff18;border:1px solid #ffffff30;border-radius:12px;padding:14px 24px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#60a5fa">${consolidado.totalHorasMes}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">Horas Economizadas/Mês</div>
    </div>
    <div style="background:#ffffff18;border:1px solid #ffffff30;border-radius:12px;padding:14px 24px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#f59e0b">${consolidado.roiMedioPlatforma}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">ROI Médio da Plataforma</div>
    </div>
    <div style="background:#ffffff18;border:1px solid #ffffff30;border-radius:12px;padding:14px 24px;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#a78bfa">${consolidado.disponibilidade}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">Disponibilidade</div>
    </div>
  </div>
</div>

<!-- RESUMO EXECUTIVO -->
<div style="margin-bottom:40px;padding:24px 28px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:800;color:#14532d">Resumo Executivo</h2>
  <p style="margin:0 0 12px;font-size:14px;color:#166534;line-height:1.7">
    O <strong>Moneycar AI</strong> é uma plataforma integrada de inteligência artificial e gestão operacional desenvolvida
    especificamente para revendas de veículos. Diferente de sistemas genéricos, cada funcionalidade foi projetada para endereçar
    um problema real do dia a dia da revenda: leads perdidos, capital imobilizado em estoque parado, margens mal calculadas,
    relatórios manuais demorados e atendimento limitado ao horário comercial.
  </p>
  <p style="margin:0;font-size:14px;color:#166534;line-height:1.7">
    O conjunto de funcionalidades gera uma economia estimada de <strong>${consolidado.totalHorasMes} de trabalho manual por mês</strong>,
    equivalente a <strong>${consolidado.economiaFuncionario}</strong>, além de potencial de
    <strong>${consolidado.impactoReceitaMes}</strong> pela captura e conversão de leads que seriam perdidos sem automação.
    Com ROI médio de plataforma de <strong>${consolidado.roiMedioPlatforma}</strong>, o investimento se paga nos primeiros meses de uso.
  </p>
</div>

<!-- TABELA CONSOLIDADA -->
<div style="margin-bottom:40px;page-break-inside:avoid">
  <h2 style="font-size:18px;font-weight:800;color:#111827;margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid #e5e7eb">Visão Consolidada — Todas as Funcionalidades</h2>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <thead style="background:#0f172a">
        <tr>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#e2e8f0;font-weight:700">Funcionalidade</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#e2e8f0;font-weight:700">Categoria</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#e2e8f0;font-weight:700">ROI Est.</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#e2e8f0;font-weight:700">Horas/Mês</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#e2e8f0;font-weight:700">Impacto Principal</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:#e2e8f0;font-weight:700">Nível</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</div>

<!-- FUNCIONALIDADES DETALHADAS -->
<div>
  <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 24px;padding-bottom:12px;border-bottom:3px solid #0f172a">Análise Detalhada por Funcionalidade</h2>
  ${categorySections}
</div>

<!-- COMO OS VALORES FORAM CALCULADOS -->
<div style="margin:40px 0;padding:24px 28px;background:#fffbeb;border:1px solid #fcd34d;border-radius:16px;page-break-inside:avoid">
  <h2 style="margin:0 0 12px;font-size:16px;font-weight:800;color:#78350f">Metodologia dos Cálculos de ROI</h2>
  <p style="margin:0 0 10px;font-size:13px;color:#92400e;line-height:1.65">
    Os valores de ROI, horas economizadas e impacto em receita apresentados neste relatório são
    <strong>estimativas baseadas em médias de revendas de veículos de pequeno e médio porte no Brasil</strong>,
    considerando as seguintes premissas:
  </p>
  <ul style="margin:0;padding-left:18px">
    <li style="font-size:13px;color:#92400e;padding:3px 0">Custo hora de trabalho: R$35–R$80 (vendedor/gestor)</li>
    <li style="font-size:13px;color:#92400e;padding:3px 0">Ticket médio de veículo: R$40.000–R$80.000</li>
    <li style="font-size:13px;color:#92400e;padding:3px 0">Margem média de mercado: 8–15% por veículo</li>
    <li style="font-size:13px;color:#92400e;padding:3px 0">Volume: 10–30 veículos vendidos por mês</li>
    <li style="font-size:13px;color:#92400e;padding:3px 0">Taxa de conversão de lead digital: 3–8%</li>
  </ul>
  <p style="margin:10px 0 0;font-size:12px;color:#a16207">
    Os resultados reais variam conforme volume de operação, perfil de equipe e nível de adoção da plataforma.
    Recomenda-se acompanhar os KPIs mensalmente pelo Relatório de Performance para mensurar o impacto real.
  </p>
</div>

<!-- RODAPÉ -->
<div style="text-align:center;padding:24px 0;border-top:1px solid #e5e7eb;margin-top:16px">
  <p style="margin:0;font-size:12px;color:#6b7280;font-weight:700">Moneycar AI — Plataforma Integrada de Gestão e Inteligência Artificial para Revendas</p>
  <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">
    Relatório gerado em ${now} · Documento confidencial destinado ao uso interno e apresentações comerciais.
  </p>
  <p style="margin:6px 0 0;font-size:11px;color:#d1d5db">Este documento pode ser impresso ou salvo como PDF pelo navegador.</p>
</div>

</body>
</html>`
}

export function downloadRoiHTML(): void {
  const html = generateRoiHTML()
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `moneycar-ai-roi-valor-agregado-${new Date().toISOString().slice(0, 10)}.html`
  a.click()
  URL.revokeObjectURL(url)
}
