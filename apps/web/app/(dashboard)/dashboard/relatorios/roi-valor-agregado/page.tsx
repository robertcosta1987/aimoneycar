'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Download, TrendingUp, Clock, DollarSign, Zap, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { features, consolidado, downloadRoiHTML } from '@/lib/reports/roiVA'
import type { Feature } from '@/lib/reports/roiVA'

const catColor: Record<string, string> = {
  'Inteligência Artificial': 'text-purple-600 bg-purple-50 border-purple-200',
  'Atendimento ao Cliente':  'text-sky-600 bg-sky-50 border-sky-200',
  'Operacional':             'text-cyan-600 bg-cyan-50 border-cyan-200',
  'Financeiro':              'text-amber-600 bg-amber-50 border-amber-200',
  'Análise e Relatórios':    'text-blue-600 bg-blue-50 border-blue-200',
  'Análise de Estoque':      'text-green-600 bg-green-50 border-green-200',
}

const nivelColor: Record<Feature['nivel'], string> = {
  alto:  'text-green-700 bg-green-50 border-green-200',
  medio: 'text-blue-700 bg-blue-50 border-blue-200',
  base:  'text-gray-600 bg-gray-50 border-gray-200',
}
const nivelLabel: Record<Feature['nivel'], string> = {
  alto:  'Alto Impacto',
  medio: 'Médio Impacto',
  base:  'Fundação',
}

function FeatureCard({ f }: { f: Feature }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`rounded-2xl border p-5 transition-all ${
      f.nivel === 'alto' ? 'border-green-200 bg-green-50/40' :
      f.nivel === 'medio' ? 'border-blue-200 bg-blue-50/30' :
      'border-border bg-background-paper'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${catColor[f.categoria] ?? ''}`}>
            {f.categoria}
          </Badge>
          <h3 className="font-bold text-base text-foreground">{f.nome}</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-[10px] font-bold ${nivelColor[f.nivel]}`}>
            {nivelLabel[f.nivel]}
          </Badge>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-foreground text-background text-xs font-black">
            ROI {f.roiEstimado}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="mt-3 text-sm text-foreground-muted leading-relaxed">{f.descricao}</p>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mt-3">
        {f.economiaHoras && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold">
            <Clock className="w-3 h-3" /> {f.economiaHoras} economizados
          </span>
        )}
        {f.impactoReceita && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-[11px] font-semibold">
            <TrendingUp className="w-3 h-3" /> {f.impactoReceita}
          </span>
        )}
        {f.impactoMargem && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold">
            <DollarSign className="w-3 h-3" /> {f.impactoMargem}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        {f.kpis.map(k => (
          <div key={k.label} className="rounded-xl border border-border bg-background p-3 text-center">
            <div className="text-base font-black" style={{ color: k.cor }}>{k.valor}</div>
            <div className="text-[10px] text-foreground-muted mt-0.5 leading-tight">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Benefits toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-4 text-xs font-semibold text-primary hover:underline"
      >
        {expanded ? '▲ Ocultar benefícios' : '▼ Ver benefícios detalhados'}
      </button>
      {expanded && (
        <ul className="mt-3 space-y-1.5">
          {f.beneficios.map(b => (
            <li key={b} className="flex items-start gap-2 text-sm text-foreground-muted">
              <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RoiValorAgregadoPage() {
  const categories = Array.from(new Set(features.map(f => f.categoria)))

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      {/* Back + Export */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/relatorios" className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Relatórios
        </Link>
        <Button onClick={downloadRoiHTML} className="gap-2">
          <Download className="w-4 h-4" />
          Exportar HTML
        </Button>
      </div>

      {/* Hero */}
      <div className="rounded-2xl bg-foreground text-background p-8 text-center">
        <div className="inline-block px-4 py-1 rounded-full bg-white/10 text-white/80 text-xs font-bold uppercase tracking-widest mb-4">
          Relatório Estratégico
        </div>
        <h1 className="text-3xl font-black mb-2">ROI e Valor Agregado</h1>
        <p className="text-sm text-white/70 max-w-xl mx-auto leading-relaxed">
          Análise consolidada de todas as funcionalidades do Moneycar AI com retorno sobre investimento,
          benefícios operacionais e impacto direto no resultado da revenda.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {[
            { label: 'Funcionalidades', valor: consolidado.totalFuncionalidades, cor: '#4ade80' },
            { label: 'Horas/mês economizadas', valor: consolidado.totalHorasMes, cor: '#60a5fa' },
            { label: 'ROI médio', valor: consolidado.roiMedioPlatforma, cor: '#fbbf24' },
            { label: 'Disponibilidade', valor: consolidado.disponibilidade, cor: '#c084fc' },
          ].map(k => (
            <div key={k.label} className="rounded-xl bg-white/10 border border-white/20 p-3 text-center">
              <div className="text-2xl font-black" style={{ color: k.cor }}>{k.valor}</div>
              <div className="text-[10px] text-white/60 mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Executive summary */}
      <div className="rounded-2xl border border-green-200 bg-green-50/50 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-green-600" />
          <h2 className="font-bold text-green-800 text-sm uppercase tracking-wide">Resumo Executivo</h2>
        </div>
        <p className="text-sm text-green-900 leading-relaxed mb-3">
          O <strong>Moneycar AI</strong> é uma plataforma integrada de inteligência artificial e gestão
          operacional desenvolvida especificamente para revendas de veículos. Cada funcionalidade endereça
          um problema real do dia a dia: leads perdidos, capital imobilizado, margens mal calculadas,
          relatórios manuais demorados e atendimento limitado ao horário comercial.
        </p>
        <p className="text-sm text-green-900 leading-relaxed">
          O conjunto de funcionalidades gera uma economia estimada de{' '}
          <strong>{consolidado.totalHorasMes} de trabalho manual por mês</strong>,
          equivalente a <strong>{consolidado.economiaFuncionario}</strong>, além de potencial de{' '}
          <strong>{consolidado.impactoReceitaMes}</strong> pela captura e conversão de leads que seriam perdidos
          sem automação. Com ROI médio de <strong>{consolidado.roiMedioPlatforma}</strong>, o investimento se
          paga nos primeiros meses de uso.
        </p>
      </div>

      {/* Consolidated table */}
      <div>
        <h2 className="text-lg font-black mb-4">Visão Consolidada</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-foreground text-background">
              <tr>
                {['Funcionalidade', 'Categoria', 'ROI Est.', 'Horas/mês', 'Impacto', 'Nível'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => (
                <tr key={f.id} className={i % 2 === 0 ? 'bg-background' : 'bg-background-paper'}>
                  <td className="px-4 py-2.5 font-semibold text-foreground text-xs">{f.nome}</td>
                  <td className="px-4 py-2.5 text-[11px]">
                    <Badge variant="outline" className={`text-[10px] font-bold ${catColor[f.categoria] ?? ''}`}>{f.categoria}</Badge>
                  </td>
                  <td className="px-4 py-2.5 font-black text-xs">{f.roiEstimado}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground-muted">{f.economiaHoras ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground-muted max-w-[180px]">{f.impactoReceita ?? f.impactoMargem ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={`text-[10px] font-bold ${nivelColor[f.nivel]}`}>{nivelLabel[f.nivel]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Features by category */}
      {categories.map(cat => (
        <div key={cat}>
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
            <h2 className="text-xl font-black text-foreground">{cat}</h2>
            <Badge variant="outline" className={`text-[10px] font-bold ${catColor[cat] ?? ''}`}>
              {features.filter(f => f.categoria === cat).length} funcionalidade{features.filter(f => f.categoria === cat).length > 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="space-y-4">
            {features.filter(f => f.categoria === cat).map(f => (
              <FeatureCard key={f.id} f={f} />
            ))}
          </div>
        </div>
      ))}

      {/* Methodology note */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6">
        <h3 className="font-bold text-amber-800 mb-2 text-sm">Metodologia dos Cálculos de ROI</h3>
        <p className="text-xs text-amber-700 leading-relaxed mb-2">
          Os valores apresentados são estimativas baseadas em médias de revendas de veículos de pequeno e médio porte no Brasil,
          considerando: custo hora R$35–R$80, ticket médio R$40k–R$80k, margem de 8–15% e volume de 10–30 veículos/mês.
        </p>
        <p className="text-xs text-amber-600">
          Resultados reais variam conforme volume, perfil de equipe e nível de adoção.
          Acompanhe os KPIs mensalmente pelo Relatório de Performance para mensurar o impacto real na sua operação.
        </p>
      </div>

      {/* Bottom export CTA */}
      <div className="flex justify-center pb-4">
        <Button onClick={downloadRoiHTML} size="lg" className="gap-2">
          <Download className="w-5 h-5" />
          Exportar Relatório Completo em HTML
        </Button>
      </div>
    </div>
  )
}
