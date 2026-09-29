'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, BarChart3, Shield, TrendingUp, FlaskConical,
  Lightbulb, DollarSign, Globe, Bot, ArrowRight,
  ArrowUpRight, ArrowDownRight, ChevronDown, Database, Brain,
  Search, Users, Lock, Zap, LineChart, FileText, Wrench,
} from 'lucide-react';

/* ───────── Palette (from chart-theme.ts & globals.css) ───────── */

const C = {
  primary: '#F3A169',
  olive: '#576558',
  chart3: '#D4976A',
  chart4: '#8A9A6E',
  chart5: '#F2CB6E',
  red: '#F27C7C',
  green: '#6ECB8A',
  card: '#0A0B10',
} as const;

/* ───────── Mock KPI Data (matches real dashboard screenshot) ───────── */

const MOCK_KPIS_ROW1 = [
  { icon: LineChart, label: 'Total de Contratos', value: '117', delta: '3.5%', dir: 'up' as const, positiveIsGood: true, spark: [95, 100, 105, 108, 112, 115, 110, 108, 110, 117] },
  { icon: FileText, label: 'Saldo Nominal', value: 'R$ 108,04 mi', delta: '2.7%', dir: 'up' as const, positiveIsGood: true, spark: [85, 88, 92, 95, 98, 100, 102, 104, 106, 108] },
  { icon: DollarSign, label: 'Saldo Devedor', value: 'R$ 108,04 mi', delta: '2.7%', dir: 'up' as const, positiveIsGood: true, spark: [84, 87, 91, 94, 97, 99, 101, 103, 105, 108] },
];

const MOCK_KPIS_ROW2 = [
  { icon: Shield, label: 'Valor em Atraso', value: 'R$ 95,66 mil', delta: '119.1%', dir: 'up' as const, positiveIsGood: false, spark: [10, 12, 15, 20, 30, 35, 40, 55, 70, 96] },
  { icon: TrendingUp, label: 'Inadimplência', value: '0,09%', delta: '113.3%', dir: 'up' as const, positiveIsGood: false, spark: [0.02, 0.02, 0.03, 0.03, 0.04, 0.04, 0.05, 0.06, 0.07, 0.09] },
  { icon: BarChart3, label: 'Atraso > 90 dias', value: '0,05%', delta: '0%', dir: 'up' as const, positiveIsGood: false, neutral: true, spark: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05] },
];

function AreaSparkline({ data, id, color = C.primary }: { data: number[]; id: string; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 200;
  const h = 48;
  const pad = 2;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }));
  const line = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-12 mt-3">
      <defs>
        <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg-${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity={0.7} />
    </svg>
  );
}

/* ───────── Beam effect (conic gradient border animation, same as useBeamEffect) ───────── */

function useBeam() {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const angleRef = useRef(0);

  useEffect(() => {
    if (!hovered) {
      if (ref.current) {
        ref.current.style.removeProperty('--beam-bg');
        ref.current.style.removeProperty('--glow-bg');
        ref.current.style.boxShadow = '';
      }
      return;
    }
    // O loop do rAF vive dentro do efeito: uma função que se re-agenda a partir
    // do próprio `useCallback` lê a si mesma antes de estar declarada.
    let frame = 0;
    const paint = () => {
      if (!ref.current) return;
      angleRef.current = (angleRef.current + 1.5) % 360;
      const a = angleRef.current;
      ref.current.style.setProperty('--beam-bg', `conic-gradient(from ${a}deg at 50% 50%, rgba(243,161,105,0.2) 0%, rgba(243,161,105,0.08) 30%, transparent 50%, #F3A169 85%, rgba(243,161,105,0.3) 100%)`);
      ref.current.style.setProperty('--glow-bg', `conic-gradient(from ${a}deg at 50% 50%, rgba(243,161,105,0.08) 0%, rgba(243,161,105,0.12) 20%, rgba(243,161,105,0.2) 40%, rgba(243,161,105,0.3) 60%, #F3A169 80%, rgba(243,161,105,0.35) 100%)`);
      ref.current.style.boxShadow = 'inset 0 0 0 0.5px rgba(243,161,105,0.2)';
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [hovered]);

  return { ref, hovered, setHovered };
}

/* ───────── BeamCard — card with animated conic-gradient border on hover ───────── */

function BeamCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, hovered, setHovered } = useBeam();
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative rounded-2xl p-px transition-all duration-300 ${!hovered ? 'bg-gradient-to-br from-foreground/[0.08] via-foreground/[0.03] to-transparent' : ''} ${className}`}
      style={hovered ? { background: 'var(--beam-bg, linear-gradient(to br, var(--color-foreground) 8%, transparent))' } : undefined}
    >
      {/* Ambilight glow */}
      <div
        className="pointer-events-none absolute -inset-1 rounded-2xl -z-10 transition-opacity duration-300"
        style={{
          background: hovered ? 'var(--glow-bg, transparent)' : 'transparent',
          filter: 'blur(18px)',
          opacity: hovered ? 0.5 : 0,
        }}
      />
      <div className="relative rounded-2xl bg-card h-full">
        {children}
      </div>
    </div>
  );
}

/* ───────── Mock KPI Card (matches real dashboard RichKpiCard with beam effect) ───────── */

function MockKpiCard({ kpi, idx }: { kpi: { icon: React.ElementType; label: string; value: string; delta: string; dir: 'up' | 'down'; positiveIsGood: boolean; spark: number[]; neutral?: boolean }; idx: number }) {
  const Icon = kpi.icon;
  const isPositive = kpi.positiveIsGood ? kpi.dir === 'up' : kpi.dir === 'down';
  const badgeColor = kpi.neutral ? 'var(--color-muted-foreground)' : isPositive ? C.green : C.red;
  const badgeBg = kpi.neutral ? 'var(--color-muted)' : `${badgeColor}15`;
  const BadgeIcon = kpi.dir === 'up' ? ArrowUpRight : ArrowDownRight;

  return (
    <BeamCard>
      <div className="h-full flex flex-col">
        <div className="p-5 pb-0">
          {/* Header: icon + label + badge + chevron */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04]">
                <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: badgeBg, color: badgeColor }}
              >
                {!kpi.neutral && <BadgeIcon className="h-3 w-3" />}
                {kpi.neutral ? '— 0%' : kpi.delta}
              </span>
              <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
            </div>
          </div>

          {/* Value */}
          <p className="font-display text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent drop-shadow-sm">
            {kpi.value}
          </p>
        </div>

        {/* Area sparkline — edge to edge */}
        <div className="mt-auto overflow-hidden rounded-b-2xl">
          <AreaSparkline data={kpi.spark} id={`kpi-${idx}`} />
        </div>
      </div>
    </BeamCard>
  );
}

/* ───────── Mock Chat ───────── */

const MOCK_CHAT = [
  { role: 'user' as const, text: 'Quais contratos têm maior risco de inadimplência nos próximos 3 meses?' },
  { role: 'assistant' as const, text: 'Identifiquei **12 contratos com probabilidade de default acima de 30%** nos próximos 3 meses. Os principais fatores de risco são: LTV acima de 80%, atraso crescente nos últimos 2 meses e rating D ou inferior. Recomendo priorizar ação de cobrança nesses contratos.' },
];

/* ───────── Feature Cards ───────── */

const FEATURES = [
  { icon: BarChart3, title: 'Painel Executivo', description: 'Indicadores atualizados em tempo real, comparação entre períodos e detalhamento interativo de cada métrica da carteira.' },
  { icon: Brain, title: 'IA Conversacional', description: 'Pergunte qualquer coisa sobre sua carteira em linguagem natural e receba análises completas em segundos.' },
  { icon: TrendingUp, title: 'Projeções Estatísticas', description: 'Projeções que capturam padrões sazonais, tendências e entregam intervalos de confiança para apoiar decisões.' },
  { icon: FlaskConical, title: 'Simulação e Stress Test', description: 'Teste cenários de estresse, sensibilidade a variáveis e impacto macroeconômico antes que aconteçam.' },
  { icon: Shield, title: 'Compliance Automatizado', description: 'Monitoramento contínuo de elegibilidade CRI, limites CVM 60, covenants e detecção automática de anomalias.' },
  { icon: DollarSign, title: 'Fluxo de Caixa', description: 'WAL, excess spread, cobertura OC/IC, fluxo esperado vs contratado e decomposição de pagamentos em uma visão integrada.' },
  { icon: Lightbulb, title: 'Recomendações Inteligentes', description: 'Priorização automática de ações de cobrança, repasse e reestruturação com base no retorno esperado.' },
  { icon: Globe, title: 'Cenário Macroeconômico', description: 'Acompanhamento de Selic, IPCA, CDI e benchmarks de mercado com análise de impacto direto na carteira.' },
];

/* ───────── Agent Cards ───────── */

const AGENTS = [
  { icon: BarChart3, name: 'Resumo da carteira', desc: '"O que aconteceu?"', tagline: 'Entenda o estado atual da sua carteira em segundos', capabilities: ['Panorama completo de KPIs da carteira', 'Estatísticas descritivas por qualquer dimensão', 'Curvas vintage: desempenho de cada safra ao longo do tempo', 'Matriz de transição de ratings entre períodos', 'Consultas livres em linguagem natural'] },
  { icon: Search, name: 'Diagnóstico', desc: '"Por que aconteceu?"', tagline: 'Descubra as causas por trás dos números', capabilities: ['Correlação entre variáveis (ex: LTV alto × atraso)', 'Índice de concentração da carteira', 'Decomposição: o que mudou e quanto cada fator contribuiu', 'Testes estatísticos para validar hipóteses'] },
  { icon: TrendingUp, name: 'Projeções', desc: '"O que vai acontecer?"', tagline: 'Antecipe riscos antes que se materializem', capabilities: ['Projeção de indicadores com intervalos de confiança', 'Estimativa de PD e perda esperada por contrato', 'Curvas de sobrevivência de adimplência', 'Alertas antecipados de aproximação a covenants', 'Taxas de pré-pagamento (CPR) e default (CDR)'] },
  { icon: FlaskConical, name: 'Simulação', desc: '"E se...?"', tagline: 'Teste cenários antes de tomar decisões', capabilities: ['4 cenários prontos: base, conservador, adverso e severo', 'Análise de sensibilidade a variáveis individuais', 'Simulação Monte Carlo com VaR e CVaR', 'Stress macroeconômico: Selic, IPCA, desemprego', 'Perda esperada estressada para cada cenário'] },
  { icon: Lightbulb, name: 'Recomendações', desc: '"O que devemos fazer?"', tagline: 'Ações concretas baseadas nos dados', capabilities: ['Ranking de ações por impacto e viabilidade', 'Avaliação antes/depois de intervenções', 'Segmentação automática por comportamento', 'Análise causal: a ação realmente causou o resultado?', 'Otimização de alocação de recursos'] },
  { icon: Shield, name: 'Alertas e Compliance', desc: '"Algo está errado?"', tagline: 'Monitore riscos e conformidade regulatória', capabilities: ['Detecção automática de anomalias', 'Verificação de elegibilidade de lastro para CRI', 'Monitoramento de limites CVM 60', 'Acompanhamento de gatilhos de covenants', 'Relatório de compliance consolidado'] },
  { icon: DollarSign, name: 'Fluxo de caixa', desc: '"Como estão os fluxos?"', tagline: 'Acompanhe cada real que entra e sai', capabilities: ['WAL: tempo médio de retorno do capital', 'Excess spread: margem de segurança da operação', 'Razões de cobertura OC e IC', 'Comparação de fluxo previsto vs. realizado', 'Decomposição de pagamentos por tipo'] },
  { icon: Globe, name: 'Cenário externo', desc: '"O que acontece no mundo?"', tagline: 'Conecte sua carteira ao cenário macro', capabilities: ['Indicadores atualizados: Selic, IPCA, CDI, IGP-M', 'Monitoramento de mudanças regulatórias', 'Benchmarks de mercado para CRI e FIDC', 'Análise de sentimento do mercado imobiliário', 'Dados macro interpretados no contexto da carteira'] },
];

/* ───────── Tool Categories ───────── */

const TOOL_CATEGORIES = [
  { icon: Database, name: 'Consulta e Exploração', desc: 'Acesse qualquer informação da carteira com perguntas em linguagem natural.', count: 3, tools: ['Consulta livre', 'Amostra de dados', 'Estrutura dos dados'] },
  { icon: BarChart3, name: 'Estatísticas e Distribuição', desc: 'Entenda como os dados se distribuem e quais padrões se destacam.', count: 5, tools: ['Estatísticas descritivas', 'Correlações', 'Concentração (HHI)', 'Decomposição de variação', 'Teste de hipótese'] },
  { icon: LineChart, name: 'Comportamento Histórico', desc: 'Analise como a carteira se comportou ao longo do tempo.', count: 3, tools: ['Curvas vintage', 'Matriz de transição', 'Curva de sobrevivência'] },
  { icon: TrendingUp, name: 'Projeções e Alertas', desc: 'Antecipe o que vai acontecer com base em modelos estatísticos.', count: 4, tools: ['Projeção de indicadores', 'PD e perda esperada', 'Pré-pagamento e default', 'Alertas antecipados'] },
  { icon: FlaskConical, name: 'Simulação e Stress', desc: 'Teste cenários hipotéticos e meça o impacto na carteira.', count: 5, tools: ['Cenários deterministas', 'Sensibilidade', 'Monte Carlo', 'Stress macroeconômico', 'Perda estressada'] },
  { icon: Lightbulb, name: 'Recomendações e Otimização', desc: 'Receba sugestões de ação baseadas em dados e modelos.', count: 5, tools: ['Ações prioritárias', 'Avaliação de impacto', 'Segmentação', 'Análise causal', 'Otimização de alocação'] },
  { icon: Shield, name: 'Compliance e Monitoramento', desc: 'Garanta conformidade regulatória e detecte problemas cedo.', count: 5, tools: ['Detecção de anomalias', 'Elegibilidade de lastro', 'Limites de concentração', 'Gatilhos de covenants', 'Relatório de compliance'] },
  { icon: DollarSign, name: 'Fluxo de Caixa e Cobertura', desc: 'Acompanhe a saúde financeira da operação em detalhe.', count: 5, tools: ['Vida média ponderada', 'Spread excedente', 'Razões de cobertura', 'Previsto vs. realizado', 'Composição de pagamentos'] },
  { icon: Globe, name: 'Cenário Externo e Mercado', desc: 'Contextualize sua carteira com dados de mercado e regulação.', count: 6, tools: ['Indicadores do Banco Central', 'Notícias de mercado', 'Atualizações regulatórias', 'Benchmarks de mercado', 'Sentimento de mercado', 'Dados macroeconômicos'] },
];

/* ───────── Tech Stack ───────── */

const TECH = [
  { icon: Database, label: 'Dados na nuvem Google' },
  { icon: Brain, label: 'IA generativa' },
  { icon: Zap, label: 'Carregamento instantâneo' },
  { icon: Lock, label: 'Autenticação segura' },
  { icon: Shield, label: 'Dados criptografados' },
  { icon: Users, label: 'Acesso por equipe' },
];

/* ───────── Animate on scroll ───────── */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('in'); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useInView();
  return (
    <section
      ref={ref}
      id={id}
      className={`opacity-0 translate-y-6 transition-all duration-700 [transition-timing-function:cubic-bezier(0,0,0.17,1)] [&.in]:opacity-100 [&.in]:translate-y-0 ${className}`}
    >
      {children}
    </section>
  );
}

/* ───────── Reusable card wrapper matching dashboard gradient-border pattern ───────── */

function GlassCard({ children, className = '', glow = false, hover = true }: { children: React.ReactNode; className?: string; glow?: boolean; hover?: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hover || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`group/card relative rounded-2xl bg-gradient-to-br from-foreground/[0.08] via-foreground/[0.03] to-transparent p-px transition-all duration-300 ${hover ? 'hover:from-foreground/[0.12] hover:via-foreground/[0.05]' : ''} ${className}`}
    >
      {/* Radial glow following mouse */}
      {hover && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
          style={{ background: `radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${C.primary}08, transparent 60%)` }}
        />
      )}
      {/* Ambilight glow */}
      {glow && (
        <div
          className="pointer-events-none absolute -inset-1.5 -z-10 rounded-2xl transition-opacity duration-500"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${C.primary}15, transparent 70%)`, filter: 'blur(18px)' }}
        />
      )}
      <div className="relative rounded-2xl bg-card h-full">
        {children}
      </div>
    </div>
  );
}

/* ───────── Badge (matches dashboard trend badge) ───────── */

/* ═══════════════════════ MODE SELECTOR ═══════════════════════ */

function ModeSelector() {
  return (
    <Section className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Painéis e IA no mesmo lugar
          </h2>
          <p className="mt-3 text-muted-foreground">
            Os indicadores prontos para consultar, e o assistente em qualquer tela
          </p>
        </div>

        {/*
          Eram dois cartões — "Dashboard Tradicional" e "Análise Conversacional",
          esta apontando para `/explore`. A escolha existia porque as duas coisas
          eram produtos separados, com assistentes diferentes. O assistente passou
          a construir e editar página de dentro do próprio dashboard, e a tela
          separada saiu: um seletor de modo com um modo só não é escolha.
        */}
        <div className="mx-auto max-w-md">
          <Link href="/dashboard" className="group/mode block">
            <GlassCard glow>
              <div className="p-6 transition-transform duration-300 group-hover/mode:scale-[1.01]">
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-300"
                    style={{ backgroundColor: `${C.primary}12` }}
                  >
                    <BarChart3 className="h-5 w-5 transition-colors duration-300" style={{ color: C.primary }} strokeWidth={1.5} />
                  </div>
                  <Sparkles className="h-5 w-5" style={{ color: C.primary }} strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-[17px] font-semibold text-foreground">
                  Dashboard
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  Indicadores de carteira, inadimplência, covenants e simulações de stress, prontos para análise. Descreva o que falta e o assistente monta a página com você.
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-[13px] font-medium transition-colors duration-200" style={{ color: C.primary }}>
                  Acessar dashboard
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/mode:translate-x-1" />
                </div>
              </div>
            </GlassCard>
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ═══════════════════════ LANDING PAGE ═══════════════════════ */

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">

      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${C.primary}15` }}>
              <Sparkles className="h-4 w-4" style={{ color: C.primary }} strokeWidth={1.5} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">DataViz</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Já tenho conta
            </Link>
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-black transition-colors hover:opacity-85" style={{ backgroundColor: C.primary }}>
              Agendar demonstração
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <header className="relative flex min-h-[90vh] flex-col items-center justify-center px-6 pt-16 text-center">
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full blur-[120px]" style={{ backgroundColor: `${C.primary}08` }} />

        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px]" style={{ borderColor: `${C.primary}30`, backgroundColor: `${C.primary}08`, color: C.primary }}>
            <Sparkles className="h-3.5 w-3.5" />
            Plataforma para securitizadoras e gestores de CRI
          </div>

          <h1 className="font-display text-5xl font-bold leading-[1.1] tracking-tight md:text-7xl">
            Pare de descobrir problemas na carteira{' '}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(135deg, ${C.primary}, ${C.chart3})` }}>
              depois que já aconteceram
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            Monitore covenants em tempo real, antecipe inadimplência antes que vire problema
            e simule cenários de stress em segundos — tudo com inteligência artificial.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="group relative flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold text-black transition-all hover:shadow-[0_0_30px_rgba(243,161,105,0.3)]"
              style={{ backgroundColor: C.primary }}
            >
              <span className="pointer-events-none absolute -inset-1 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: `radial-gradient(ellipse, ${C.primary}25, transparent 70%)`, filter: 'blur(12px)' }} />
              Agendar demonstração
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-[15px] text-muted-foreground transition-colors hover:border-foreground/[0.12] hover:text-muted-foreground"
            >
              Ver funcionalidades
              <ChevronDown className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </div>
      </header>

      {/* ─── Mode Selector ─── */}
      <ModeSelector />

      {/* ─── Pain points ─── */}
      <Section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 text-center text-[13px] font-medium uppercase tracking-widest text-muted-foreground">Você se identifica?</p>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { text: 'Descobrir que um covenant foi violado só na reunião mensal com o trustee.' },
              { text: 'Passar dias consolidando planilhas para entender por que a inadimplência subiu.' },
              { text: 'Não conseguir simular o impacto de um cenário de stress antes da próxima emissão.' },
            ].map((pain) => (
              <GlassCard key={pain.text}>
                <div className="p-5 flex items-start gap-3">
                  <span className="mt-0.5 text-[18px]" style={{ color: C.red }}>&#10005;</span>
                  <p className="text-[14px] leading-relaxed text-muted-foreground">{pain.text}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── Dashboard Mock (faithful to real dashboard) ─── */}
      <Section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <GlassCard glow hover={false}>
            <div className="p-6 md:p-8">
              {/* Toolbar — matches real dashboard header */}
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-2xl font-bold tracking-tight text-foreground">Visão Geral</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">Resumo consolidado da carteira securitizada com indicadores-chave e tendências</p>
                </div>
                <div className="hidden sm:flex gap-2">
                  <span className="rounded-full border px-3.5 py-1.5 text-[11px] font-medium" style={{ borderColor: `${C.primary}40`, backgroundColor: `${C.primary}10`, color: C.primary }}>Último mês</span>
                  <span className="rounded-full border border-border bg-foreground/[0.02] px-3.5 py-1.5 text-[11px] text-muted-foreground">Todo o período</span>
                  <span className="rounded-full border border-border bg-foreground/[0.02] px-3.5 py-1.5 text-[11px] text-muted-foreground">mai/2025 — jan/2026</span>
                </div>
              </div>

              {/* KPI Row 1 — 3 cards (like screenshot top row) */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {MOCK_KPIS_ROW1.map((kpi, idx) => (
                  <MockKpiCard key={kpi.label} kpi={kpi} idx={idx} />
                ))}
              </div>

              {/* KPI Row 2 — 3 cards (like screenshot second row) */}
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                {MOCK_KPIS_ROW2.map((kpi, idx) => (
                  <MockKpiCard key={kpi.label} kpi={{ ...kpi, neutral: 'neutral' in kpi ? kpi.neutral : false }} idx={idx + 3} />
                ))}
              </div>

              {/* Charts Row — Evolução Saldo + Faixa Atraso (with beam effect) */}
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* Evolução do Saldo Devedor */}
                <BeamCard>
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-[13px] font-medium text-muted-foreground">Evolução do Saldo Devedor</p>
                        <p className="text-[11px] text-muted-foreground">Variação mês a mês do saldo devedor total da carteira</p>
                      </div>
                      <span className="rounded-lg border border-border bg-foreground/[0.02] px-2.5 py-1 text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">Ver detalhes <ArrowUpRight className="h-3 w-3" /></span>
                    </div>
                    <div className="flex">
                      <div className="flex flex-col justify-between text-[10px] text-muted-foreground font-mono pr-2 py-1 shrink-0" style={{ height: 160 }}>
                        <span>120mi</span><span>90mi</span><span>60mi</span><span>30mi</span><span>0mi</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Bars + SVG overlay stacked */}
                        <div className="relative" style={{ height: 160 }}>
                          <div className="absolute inset-0 flex items-end gap-1">
                            {[72, 68, 75, 85, 88, 82, 90, 88, 92].map((h, i) => (
                              <div key={i} className="flex-1 group/bar">
                                <div
                                  className="w-full rounded-t transition-all duration-200 group-hover/bar:opacity-100 opacity-80"
                                  style={{ height: `${h}%`, background: `linear-gradient(to top, ${C.olive}50, ${C.olive}B0)` }}
                                />
                              </div>
                            ))}
                          </div>
                          {/* Line overlay on top of bars */}
                          <svg viewBox="0 0 200 160" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                            <defs>
                              <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={C.primary} stopOpacity={0.15} />
                                <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <polygon points="0,160 0,70 22,80 44,62 66,38 88,30 110,45 132,25 154,30 176,20 200,20 200,160" fill="url(#trend-grad)" />
                            <polyline points="0,70 22,80 44,62 66,38 88,30 110,45 132,25 154,30 176,20 200,20" fill="none" stroke={C.primary} strokeWidth="2" strokeLinejoin="round" opacity={0.6} />
                          </svg>
                        </div>
                        <div className="flex mt-1.5">
                          {['mai/25','jun/25','jul/25','ago/25','set/25','out/25','nov/25','dez/25','jan/26'].map(l => (
                            <span key={l} className="flex-1 text-center text-[9px] text-muted-foreground">{l}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </BeamCard>

                {/* Contratos por Faixa de Atraso */}
                <BeamCard>
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-[13px] font-medium text-muted-foreground">Contratos por Faixa de Atraso</p>
                        <p className="text-[11px] text-muted-foreground">Quantidade de contratos agrupados por dias de atraso</p>
                      </div>
                      <span className="rounded-lg border border-border bg-foreground/[0.02] px-2.5 py-1 text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">Ver detalhes <ArrowUpRight className="h-3 w-3" /></span>
                    </div>
                    <div className="flex">
                      <div className="flex flex-col justify-between text-[10px] text-muted-foreground font-mono pr-2 py-1 shrink-0" style={{ height: 160 }}>
                        <span>120</span><span>90</span><span>60</span><span>30</span><span>0</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Bars + SVG overlay stacked */}
                        <div className="relative" style={{ height: 160 }}>
                          <div className="absolute inset-0 flex items-end gap-2.5">
                            {[
                              { h: 95, c: C.primary },
                              { h: 12, c: C.chart3 },
                              { h: 6, c: C.chart5 },
                              { h: 4, c: C.red },
                              { h: 2, c: '#C45858' },
                            ].map((bar, i) => (
                              <div key={i} className="flex-1 group/bar">
                                <div
                                  className="w-full rounded-t transition-all duration-200 group-hover/bar:opacity-100 opacity-80"
                                  style={{ height: `${bar.h}%`, background: `linear-gradient(to top, ${bar.c}40, ${bar.c}A0)` }}
                                />
                              </div>
                            ))}
                          </div>
                          {/* Distribution line overlay */}
                          <svg viewBox="0 0 200 160" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                            <defs>
                              <linearGradient id="dist-grad" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor={C.primary} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={C.red} stopOpacity={0.1} />
                              </linearGradient>
                            </defs>
                            <polygon points="0,160 0,8 40,140 80,150 120,152 160,154 200,156 200,160" fill="url(#dist-grad)" />
                            <polyline points="0,8 40,140 80,150 120,152 160,154 200,156" fill="none" stroke={C.primary} strokeWidth="2" strokeLinejoin="round" opacity={0.5} />
                          </svg>
                        </div>
                        <div className="flex mt-1.5">
                          {['Sem atraso', '1-30 dias', '31-60 dias', '61-90 dias', '> 90 dias'].map(l => (
                            <span key={l} className="flex-1 text-center text-[9px] text-muted-foreground">{l}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </BeamCard>
              </div>
            </div>
          </GlassCard>
        </div>
      </Section>

      {/* ─── Features Grid ─── */}
      <Section className="px-6 py-20" id="features">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Tudo que você precisa em uma plataforma
            </h2>
            <p className="mt-3 text-muted-foreground">
              Do acompanhamento diário até recomendações de ação, passando por compliance e simulações de cenários.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <GlassCard key={f.title}>
                <div className="p-5 transition-transform duration-300 group-hover/card:scale-[1.01]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/[0.04] transition-colors duration-300 group-hover/card:bg-foreground/[0.07]">
                    <f.icon className="h-4.5 w-4.5 text-muted-foreground transition-colors duration-300 group-hover/card:text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <h3 className="mt-3 font-display text-[15px] font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.description}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── AI Agents ─── */}
      <Section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px]" style={{ borderColor: `${C.primary}25`, backgroundColor: `${C.primary}08`, color: C.primary }}>
              <Bot className="h-3.5 w-3.5" />
              8 Agentes Especializados
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              A IA responde qualquer pergunta sobre sua carteira
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground leading-relaxed">
              Pergunte em linguagem natural e receba análises completas. A plataforma identifica automaticamente o tipo de análise necessária e combina diferentes agentes para responder.
            </p>
          </div>

          <div className="grid items-start gap-12 lg:grid-cols-[1fr,400px]">
            {/* Left: Agent grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {AGENTS.map((a) => (
                <GlassCard key={a.name}>
                  <div className="p-4 transition-transform duration-300 group-hover/card:scale-[1.01]">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] transition-colors duration-300 group-hover/card:bg-foreground/[0.07]">
                        <a.icon className="h-4.5 w-4.5 text-muted-foreground transition-colors duration-300 group-hover/card:text-muted-foreground" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-[14px] font-semibold text-foreground">{a.name}</h3>
                          <span className="text-[11px] text-muted-foreground italic">{a.desc}</span>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{a.tagline}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {a.capabilities.slice(0, 3).map((cap) => (
                        <span key={cap} className="rounded-md bg-foreground/[0.03] px-2 py-0.5 text-[10px] text-muted-foreground border border-foreground/[0.04]">{cap}</span>
                      ))}
                      {a.capabilities.length > 3 && (
                        <span className="rounded-md bg-foreground/[0.03] px-2 py-0.5 text-[10px] text-muted-foreground border border-foreground/[0.04]">+{a.capabilities.length - 3}</span>
                      )}
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>

            {/* Right: Chat mock */}
            <div className="lg:sticky lg:top-24">
              <GlassCard glow>
                <div className="p-5">
                  <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                    <Sparkles className="h-4 w-4" style={{ color: C.primary }} />
                    <span className="text-[13px] font-semibold text-foreground">Assistente AI</span>
                  </div>

                  <div className="space-y-4">
                    {MOCK_CHAT.map((msg, i) => (
                      <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${msg.role === 'user' ? 'bg-foreground/[0.06]' : ''}`} style={msg.role === 'assistant' ? { backgroundColor: `${C.primary}10` } : undefined}>
                          {msg.role === 'user'
                            ? <Users className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
                            : <Sparkles className="h-3 w-3" style={{ color: C.primary }} strokeWidth={1.5} />}
                        </div>
                        <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${msg.role === 'user' ? 'bg-foreground/[0.04] text-muted-foreground' : 'text-muted-foreground'}`}>
                          {msg.text.split('**').map((part, j) =>
                            j % 2 === 1 ? <strong key={j} className="text-foreground font-semibold">{part}</strong> : part
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Tool indicator — matches ToolStepIndicator */}
                    <div className="rounded-lg border px-2.5 py-2 text-[11px]" style={{ borderColor: `${C.primary}20`, backgroundColor: `${C.primary}08` }}>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3" style={{ color: C.primary }} strokeWidth={2} />
                        <span className="font-medium" style={{ color: C.primary }}>Análise de risco concluída</span>
                        <span className="ml-auto rounded bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-muted-foreground">12.3s</span>
                      </div>
                    </div>
                  </div>

                  {/* Input */}
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.03] px-3 py-2.5">
                    <span className="flex-1 text-[13px] text-muted-foreground">Pergunte algo...</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: C.primary }}>
                      <ArrowRight className="h-3.5 w-3.5 text-black" />
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── Tool Categories (44 ferramentas) ─── */}
      <Section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-foreground/[0.02] px-3 py-1 text-[12px] text-muted-foreground">
              <Wrench className="h-3.5 w-3.5" />
              44 Ferramentas Analíticas
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Capacidades analíticas nos bastidores
            </h2>
            <p className="mt-3 text-muted-foreground">
              Os agentes combinam automaticamente estas ferramentas para responder suas perguntas com precisão.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOL_CATEGORIES.map((cat) => (
              <GlassCard key={cat.name}>
                <div className="p-4 transition-transform duration-300 group-hover/card:scale-[1.01]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] transition-colors duration-300 group-hover/card:bg-foreground/[0.07]">
                      <cat.icon className="h-4 w-4 text-muted-foreground transition-colors duration-300 group-hover/card:text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="font-display text-[13px] font-semibold text-foreground">{cat.name}</h3>
                      <span className="text-[11px] text-muted-foreground">{cat.count} ferramentas</span>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">{cat.desc}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {cat.tools.map((t) => (
                      <span key={t} className="rounded-md bg-foreground/[0.03] px-2 py-0.5 text-[10px] text-muted-foreground border border-foreground/[0.04]">{t}</span>
                    ))}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── Compliance & Simulation ─── */}
      <Section className="px-6 py-20">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-2">
          {/* Compliance */}
          <GlassCard>
            <div className="p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04]">
                  <Shield className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-[16px] font-bold text-foreground">Compliance Automatizado</h3>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Limites CVM 60', value: 'OK', ok: true },
                  { label: 'Elegibilidade CRI', value: '78,2%', ok: true },
                  { label: 'Covenant Inadimplência (< 7%)', value: '6,8%', ok: false },
                  { label: 'Covenant Over 90 (< 5%)', value: '3,2%', ok: true },
                  { label: 'LTV Médio (< 80%)', value: '53,4%', ok: true },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.015] px-3.5 py-2.5 transition-colors duration-200 hover:bg-foreground/[0.03]">
                    <span className="text-[13px] text-muted-foreground">{item.label}</span>
                    <span className="text-[13px] font-medium" style={{ color: item.ok ? C.green : C.chart5 }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Simulation */}
          <GlassCard>
            <div className="p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04]">
                  <FlaskConical className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-[16px] font-bold text-foreground">Simulação de Stress</h3>
              </div>
              <div className="space-y-2">
                {[
                  { scenario: 'Base', devaluation: '0%', delay: '+0d', impact: '0,09%', c: C.green },
                  { scenario: 'Conservador', devaluation: '-5%', delay: '+15d', impact: '0,42%', c: C.chart5 },
                  { scenario: 'Adverso', devaluation: '-15%', delay: '+60d', impact: '1,85%', c: C.primary },
                  { scenario: 'Severo', devaluation: '-30%', delay: '+90d', impact: '4,20%', c: C.red },
                ].map((s) => (
                  <div key={s.scenario} className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.015] px-3.5 py-2.5 transition-colors duration-200 hover:bg-foreground/[0.03]">
                    <div>
                      <span className="text-[13px] font-medium text-muted-foreground">{s.scenario}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">{s.devaluation} imóvel, {s.delay} atraso</span>
                    </div>
                    <span className="text-[13px] font-mono font-medium" style={{ color: s.c }}>{s.impact}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>
      </Section>

      {/* ─── Multi-client ───
          A seção "Quem confia no DataViz" listava Oceanica, BRZ, CONX
          e IMCASA. São clientes que não existem mais no produto, e é a página
          PÚBLICA — manter os nomes seria afirmação falsa. Removida inteira em
          vez de reduzida a um card só; volta quando houver o que anunciar. */}

      {/* ─── Tech Stack ─── */}
      <Section className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight">Segurança e infraestrutura</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {TECH.map((t) => (
              <div key={t.label} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-foreground/[0.015] px-3 py-4 transition-all duration-200 hover:bg-foreground/[0.03] hover:border-foreground/[0.10]">
                <t.icon className="h-5 w-5 text-muted-foreground transition-colors duration-200 group-hover:text-muted-foreground" strokeWidth={1.5} />
                <span className="text-center text-[11px] text-muted-foreground">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── CTA ─── */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Pronto para antecipar riscos em vez de reagir a eles?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Agende uma demonstração e veja como a plataforma funciona com os dados da sua carteira.
          </p>
          <Link
            href="/login"
            className="group relative mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-[15px] font-semibold text-black transition-all hover:shadow-[0_0_40px_rgba(243,161,105,0.25)]"
            style={{ backgroundColor: C.primary }}
          >
            <span className="pointer-events-none absolute -inset-1 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: `radial-gradient(ellipse, ${C.primary}25, transparent 70%)`, filter: 'blur(14px)' }} />
            Agendar demonstração
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" style={{ color: `${C.primary}50` }} />
              <span className="font-display font-semibold">DataViz</span>
            </div>
            <div className="flex flex-wrap gap-6 text-[12px] text-muted-foreground">
              <a href="mailto:contato@midasapps.com" className="transition-colors hover:text-muted-foreground">Contato</a>
              <a href="#" className="transition-colors hover:text-muted-foreground">Política de Privacidade</a>
              <a href="#" className="transition-colors hover:text-muted-foreground">Termos de Uso</a>
            </div>
          </div>
          <div className="mt-6 border-t border-border pt-4 text-[11px] text-muted-foreground">
            Midas Apps — Seus dados são tratados conforme a LGPD (Lei 13.709/2018).
          </div>
        </div>
      </footer>
    </div>
  );
}
