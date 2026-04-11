/**
 * QuickChart.io — generate chart image URLs for email embedding.
 * Free tier, no API key required. Returns a URL pointing to a PNG image.
 */

const BASE_URL = 'https://quickchart.io/chart'

function encode(config: object): string {
  return encodeURIComponent(JSON.stringify(config))
}

/** Bar chart: revenue + profit by day */
export function salesByDayChartUrl(
  data: Array<{ day: string; revenue: number; profit: number }>
): string {
  const labels = data.map(d => d.day)
  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Receita',
          data: data.map(d => d.revenue),
          backgroundColor: 'rgba(0, 217, 255, 0.8)',
        },
        {
          label: 'Lucro',
          data: data.map(d => d.profit),
          backgroundColor: 'rgba(0, 230, 118, 0.8)',
        },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: '#ffffff' } },
        title: { display: true, text: 'Faturamento por Dia', color: '#ffffff' },
      },
      scales: {
        x: { ticks: { color: '#aaaaaa' }, grid: { color: '#333333' } },
        y: { ticks: { color: '#aaaaaa' }, grid: { color: '#333333' } },
      },
    },
  }
  return `${BASE_URL}?c=${encode(config)}&backgroundColor=%23111820&width=600&height=300`
}

/** Doughnut chart: stock health buckets */
export function stockHealthChartUrl(
  healthy: number,
  warning: number,
  critical: number
): string {
  const config = {
    type: 'doughnut',
    data: {
      labels: ['Saudável (0–30d)', 'Atenção (31–60d)', 'Crítico (+60d)'],
      datasets: [
        {
          data: [healthy, warning, critical],
          backgroundColor: ['#00E676', '#FFB800', '#FF5252'],
        },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: '#ffffff' } },
        title: { display: true, text: 'Saúde do Estoque', color: '#ffffff' },
      },
    },
  }
  return `${BASE_URL}?c=${encode(config)}&backgroundColor=%23111820&width=400&height=300`
}

/** Horizontal bar: expense by category */
export function expenseByCategoryChartUrl(
  data: Array<{ cat: string; total: number }>
): string {
  const config = {
    type: 'horizontalBar',
    data: {
      labels: data.map(d => d.cat),
      datasets: [
        {
          label: 'Total (R$)',
          data: data.map(d => d.total),
          backgroundColor: 'rgba(255, 184, 0, 0.8)',
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Despesas por Categoria', color: '#ffffff' },
      },
      scales: {
        x: { ticks: { color: '#aaaaaa' }, grid: { color: '#333333' } },
        y: { ticks: { color: '#aaaaaa' }, grid: { color: '#333333' } },
      },
    },
  }
  return `${BASE_URL}?c=${encode(config)}&backgroundColor=%23111820&width=600&height=300`
}

/** Bar: margin per vehicle (top 8) */
export function marginChartUrl(
  data: Array<{ name: string; margin: number }>
): string {
  const config = {
    type: 'bar',
    data: {
      labels: data.map(d => d.name),
      datasets: [
        {
          label: 'Margem (%)',
          data: data.map(d => +d.margin.toFixed(1)),
          backgroundColor: data.map(d =>
            d.margin >= 12 ? 'rgba(0, 230, 118, 0.8)' : d.margin >= 8 ? 'rgba(255, 184, 0, 0.8)' : 'rgba(255, 82, 82, 0.8)'
          ),
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Margem por Veículo (%)', color: '#ffffff' },
      },
      scales: {
        x: { ticks: { color: '#aaaaaa', maxRotation: 30 }, grid: { color: '#333333' } },
        y: { ticks: { color: '#aaaaaa' }, grid: { color: '#333333' } },
      },
    },
  }
  return `${BASE_URL}?c=${encode(config)}&backgroundColor=%23111820&width=600&height=300`
}
