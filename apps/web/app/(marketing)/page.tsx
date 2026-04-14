import Link from 'next/link'
import { ArrowRight, Zap, Bell, MessageSquare, BarChart3, Car, TrendingUp, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const features = [
  { icon: Bell, title: 'Alertas Inteligentes', desc: 'Saiba quais veículos precisam de ação antes de perder dinheiro.', color: 'text-warning bg-warning/10' },
  { icon: MessageSquare, title: 'WhatsApp Diário', desc: 'Resumo das prioridades todo dia às 8h no seu WhatsApp.', color: 'text-success bg-success/10' },
  { icon: BarChart3, title: 'Análise de Margem', desc: 'Veja em tempo real quanto está ganhando em cada veículo.', color: 'text-primary bg-primary/10' },
  { icon: Car, title: 'Estoque Inteligente', desc: 'Identifique veículos parados e a hora certa de baixar o preço.', color: 'text-secondary bg-secondary/10' },
  { icon: TrendingUp, title: 'Chat IA', desc: 'Converse com seu assistente e tire dúvidas sobre o negócio.', color: 'text-primary bg-primary/10' },
  { icon: Zap, title: 'Importação Fácil', desc: 'Importe dados da sua plataforma com um clique.', color: 'text-success bg-success/10' },
]

const plans = [
  {
    name: 'Grátis',
    price: 'R$ 0',
    period: '/mês',
    desc: 'Para experimentar',
    features: ['5 veículos', 'Alertas básicos', 'Chat IA limitado'],
    cta: 'Começar grátis',
    variant: 'outline' as const,
  },
  {
    name: 'Pro',
    price: 'R$ 297',
    period: '/mês',
    desc: 'Para revendas ativas',
    features: ['Veículos ilimitados', 'Alertas WhatsApp diários', 'Chat IA ilimitado', 'Análise completa', 'Suporte prioritário'],
    cta: 'Assinar Pro',
    variant: 'default' as const,
    badge: 'Mais popular',
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    desc: 'Para grupos e franquias',
    features: ['Multi-revenda', 'API dedicada', 'Gerente de conta', 'SLA garantido'],
    cta: 'Falar com vendas',
    variant: 'outline' as const,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-background-paper/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-40 flex items-center justify-between">
          <span className="font-black text-[34px] text-primary tracking-tight">Moneycar <span className="text-foreground">IA</span></span>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost" size="sm">Entrar</Button></Link>
            <Link href="/register"><Button size="sm">Criar conta</Button></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <Badge variant="default" className="mb-6 text-xs px-4 py-1.5">
          ✨ Inteligência Artificial para Revendas
        </Badge>
        <h1 className="text-5xl font-bold text-foreground mb-6 leading-tight">
          Sua revenda mais<br />
          <span className="text-primary">lucrativa com IA</span>
        </h1>
        <p className="text-lg text-foreground-muted max-w-2xl mx-auto mb-10">
          Analise seu estoque, controle despesas e receba alertas inteligentes no WhatsApp.
          Tome decisões baseadas em dados, não em intuição.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register">
            <Button size="lg" className="gap-2 w-full sm:w-auto">
              Começar grátis <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/demo">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Ver demo
            </Button>
          </Link>
        </div>
        <p className="text-xs text-foreground-subtle mt-4">14 dias grátis · Sem cartão</p>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Tudo que sua revenda precisa</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <Card key={f.title} className="hover:border-border-hover transition-colors">
              <CardContent className="p-6">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-foreground-muted">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">Planos simples e transparentes</h2>
        <p className="text-center text-foreground-muted mb-12">Cancele quando quiser, sem burocracia</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <Card key={plan.name} className={plan.badge ? 'border-primary shadow-glow-primary' : ''}>
              <CardContent className="p-6">
                {plan.badge && (
                  <Badge className="mb-4 text-xs">{plan.badge}</Badge>
                )}
                <p className="font-semibold text-foreground">{plan.name}</p>
                <div className="flex items-end gap-1 mt-2 mb-1">
                  <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-foreground-muted text-sm mb-1">{plan.period}</span>
                </div>
                <p className="text-sm text-foreground-muted mb-6">{plan.desc}</p>
                <ul className="space-y-2 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-foreground-muted">
                      <Check className="w-4 h-4 text-success flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="block">
                  <Button variant={plan.variant} className="w-full">{plan.cta}</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background-paper py-8 text-center text-sm text-foreground-muted">
        <p>© {new Date().getFullYear()} Moneycar IA. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}
