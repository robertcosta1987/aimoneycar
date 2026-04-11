export interface KPI {
  label: string
  value: string
  color?: 'green' | 'red' | 'yellow' | 'blue' | 'default'
  trend?: string
}

export interface ChartSeries {
  key: string
  label: string
  color?: string
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'area' | 'pie'
  title: string
  data: Record<string, unknown>[]
  xKey: string
  series: ChartSeries[]
}

export interface DashboardConfig {
  title: string
  kpis: KPI[]
  charts: ChartConfig[]
}
