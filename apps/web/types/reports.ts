export type ReportType =
  | 'sales_overview'
  | 'inventory_health'
  | 'margin_analysis'
  | 'lead_funnel'
  | 'expense_breakdown'
  | 'salesperson_performance'
  | 'monthly_comparison'

export type Frequency = 'daily' | 'weekly' | 'monthly'

export interface ScheduledReport {
  id: string
  dealership_id: string
  name: string
  tipo: ReportType
  frequencia: Frequency
  dia_semana?: number | null
  dia_mes?: number | null
  hora: string
  destinatarios: string[]
  periodo_dias: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface ReportLog {
  id: string
  relatorio_id: string
  dealership_id: string
  enviado_em: string
  destinatarios: string[]
  status: 'sent' | 'failed'
  erro?: string | null
  resend_id?: string | null
}

export interface ReportTemplate {
  tipo: ReportType
  label: string
  description: string
  icon: string
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    tipo: 'sales_overview',
    label: 'Visão Geral de Vendas',
    description: 'Faturamento, lucro, quantidade de vendas e margem média do período',
    icon: '📊',
  },
  {
    tipo: 'inventory_health',
    label: 'Saúde do Estoque',
    description: 'Distribuição por tempo em estoque, veículos críticos e alertas',
    icon: '🚗',
  },
  {
    tipo: 'margin_analysis',
    label: 'Análise de Margens',
    description: 'Margem por veículo, marca e modelo — identifica os mais lucrativos',
    icon: '📈',
  },
  {
    tipo: 'expense_breakdown',
    label: 'Breakdown de Despesas',
    description: 'Despesas por categoria, veículo e percentual sobre receita',
    icon: '💸',
  },
  {
    tipo: 'salesperson_performance',
    label: 'Performance por Vendedor',
    description: 'Ranking de vendedores por volume, margem e tempo médio de fechamento',
    icon: '👤',
  },
  {
    tipo: 'monthly_comparison',
    label: 'Comparativo Mensal',
    description: 'Mês atual vs mês anterior: vendas, lucro, estoque e giro',
    icon: '📅',
  },
  {
    tipo: 'lead_funnel',
    label: 'Funil de Leads',
    description: 'Leads do chat, conversões, agendamentos e taxa de fechamento',
    icon: '🔁',
  },
]

// Data structures returned by the report generator
export interface SalesOverviewData {
  period: string
  revenue: number
  profit: number
  count: number
  avgMargin: number
  salesByDay: Array<{ day: string; revenue: number; profit: number }>
  topVehicles: Array<{ name: string; profit: number; margin: number }>
}

export interface InventoryHealthData {
  total: number
  healthy: number
  warning: number
  critical: number
  avgDays: number
  criticalVehicles: Array<{ name: string; plate: string; days: number; price: number }>
}

export interface ReportPayload {
  tipo: ReportType
  dealership_id: string
  periodo_dias: number
  generated_at: string
  dealership_name: string
  data: Record<string, unknown>
  insights: string[]
}
