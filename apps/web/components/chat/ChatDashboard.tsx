'use client'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { DashboardConfig, ChartConfig } from '@/types/dashboard'

const PALETTE = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#A78BFA', '#FB923C', '#34D399', '#F472B6']

const KPI_COLORS: Record<string, string> = {
  green:   'rgb(var(--success))',
  red:     'rgb(var(--danger))',
  yellow:  'rgb(var(--warning))',
  blue:    'rgb(var(--primary))',
  default: 'rgb(var(--fg-muted))',
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgb(var(--bg-elevated))',
    border: '1px solid rgb(var(--border))',
    borderRadius: 12,
    fontSize: 12,
    color: 'rgb(var(--fg))',
  },
  labelStyle: { color: 'rgb(var(--fg-muted))' },
  itemStyle:  { color: 'rgb(var(--fg))' },
}

const AXIS_TICK  = { fontSize: 11, fill: 'rgb(var(--fg-muted))' }
const GRID_STYLE = { strokeDasharray: '3 3', stroke: 'rgb(var(--border))' }

function renderChart(chart: ChartConfig) {
  const colors = chart.series.map((s, i) => s.color ?? PALETTE[i % PALETTE.length])

  if (chart.type === 'pie') {
    const dataKey = chart.series[0]?.key ?? 'value'
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chart.data}
            dataKey={dataKey}
            nameKey={chart.xKey}
            cx="50%"
            cy="50%"
            outerRadius={80}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {chart.data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 11, color: 'rgb(var(--fg-muted))' }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chart.data}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey={chart.xKey} tick={AXIS_TICK} />
          <YAxis tick={AXIS_TICK} width={50} />
          <Tooltip {...TOOLTIP_STYLE} />
          {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: 'rgb(var(--fg-muted))' }} />}
          {chart.series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={colors[i]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chart.data}>
          <defs>
            {chart.series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors[i]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colors[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey={chart.xKey} tick={AXIS_TICK} />
          <YAxis tick={AXIS_TICK} width={50} />
          <Tooltip {...TOOLTIP_STYLE} />
          {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: 'rgb(var(--fg-muted))' }} />}
          {chart.series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={colors[i]}
              fill={`url(#grad-${s.key})`}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  // Default: bar
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chart.data} barGap={2}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={chart.xKey} tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} width={50} />
        <Tooltip {...TOOLTIP_STYLE} />
        {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: 'rgb(var(--fg-muted))' }} />}
        {chart.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ChatDashboard({ dashboard }: { dashboard: DashboardConfig }) {
  return (
    <div className="mt-3 w-full space-y-3">
      {/* Title */}
      <div className="flex items-center gap-2 pb-1 border-b border-border">
        <span className="text-xs font-semibold text-primary uppercase tracking-wider">{dashboard.title}</span>
      </div>

      {/* KPIs */}
      {dashboard.kpis.length > 0 && (
        <div className={`grid gap-2 ${dashboard.kpis.length <= 2 ? 'grid-cols-2' : dashboard.kpis.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {dashboard.kpis.map((kpi, i) => (
            <div key={i} className="bg-background-paper rounded-xl p-3 border border-border">
              <p className="text-[10px] text-foreground-muted leading-none mb-1">{kpi.label}</p>
              <p className="text-lg font-bold leading-none" style={{ color: KPI_COLORS[kpi.color ?? 'default'] }}>
                {kpi.value}
              </p>
              {kpi.trend && (
                <p className="text-[10px] mt-1" style={{
                  color: kpi.trend.startsWith('+') || kpi.trend.startsWith('▲') ? 'rgb(var(--success))' :
                    kpi.trend.startsWith('-') || kpi.trend.startsWith('▼') ? 'rgb(var(--danger))' : 'rgb(var(--fg-muted))'
                }}>
                  {kpi.trend}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {dashboard.charts.length > 0 && (
        <div className={`grid gap-3 ${dashboard.charts.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {dashboard.charts.map((chart, i) => (
            <div key={i} className="bg-background-paper rounded-xl p-3 border border-border">
              <p className="text-[11px] font-semibold text-foreground-muted mb-3">{chart.title}</p>
              {chart.data.length === 0 ? (
                <p className="text-xs text-foreground-subtle text-center py-8">Sem dados no período</p>
              ) : (
                renderChart(chart)
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
