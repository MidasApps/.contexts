/**
 * Perguntas pré-definidas (sugestões) específicas para cada indicador e tipo de componente.
 * Quando o usuário abre o modal de um indicador, ele vê 4 sugestões de perguntas contextuais.
 * Ao clicar, o fullPrompt completo é enviado para a IA.
 *
 * Chaves devem corresponder ao label/title exato do KPI, gráfico ou tabela.
 */
export const INDICATOR_SUGGESTIONS: Record<string, { label: string; fullPrompt: string }[]> = {

  // ─────────────────────────────────────────────────────────
  // KPIs do Dashboard
  // ─────────────────────────────────────────────────────────

  'Total de Contratos': [
    {
      label: 'Distribuição por empreendimento',
      fullPrompt: 'Mostre a distribuição do "Total de Contratos" por empreendimento. Quais projetos concentram mais contratos e qual a participação relativa de cada um na carteira?',
    },
    {
      label: 'Evolução mensal da originação',
      fullPrompt: 'Analise a evolução mensal do "Total de Contratos" da carteira. A originação está acelerando ou desacelerando? Há sazonalidade identificável nas safras?',
    },
    {
      label: 'Contratos por faixa de rating',
      fullPrompt: 'Qual a distribuição do "Total de Contratos" por faixa de Rating Liquid (A a H)? Existe concentração excessiva em alguma faixa de risco que mereça atenção?',
    },
    {
      label: 'Elegibilidade da base ativa',
      fullPrompt: 'Do "Total de Contratos" ativos, quantos são elegíveis para securitização (Carteira Elegível A/B)? Qual percentual está em elegibilidade possível ou futura, e quantos são inelegíveis?',
    },
  ],

  'Saldo Nominal': [
    {
      label: 'Composição por empreendimento',
      fullPrompt: 'Qual a composição do "Saldo Nominal" por empreendimento? Identifique concentrações de exposição e o percentual que cada projeto representa sobre o total contratado.',
    },
    {
      label: 'Relação com saldo devedor',
      fullPrompt: 'Analise a relação entre "Saldo Nominal" e "Saldo Devedor" da carteira. Qual o percentual de amortização acumulada? Como isso impacta o LTV médio e a qualidade da carteira?',
    },
    {
      label: 'Ticket médio por safra',
      fullPrompt: 'Calcule o ticket médio (Saldo Nominal / Total de Contratos) e analise sua evolução por safra de originação. O ticket médio está crescendo ou reduzindo ao longo do tempo?',
    },
    {
      label: 'Exposição por faixa MCMV',
      fullPrompt: 'Qual a distribuição do "Saldo Nominal" por faixa do programa MCMV? Existe concentração em alguma faixa que represente risco regulatório ou de crédito elevado?',
    },
  ],

  'Saldo Devedor': [
    {
      label: 'Evolução temporal do saldo',
      fullPrompt: 'Analise a evolução temporal do "Saldo Devedor" nos últimos meses. A carteira está amortizando conforme esperado ou há sinais de crescimento por inadimplência acumulada?',
    },
    {
      label: 'Concentração por rating',
      fullPrompt: 'Qual a distribuição do "Saldo Devedor" por Rating Liquid? Quanto da exposição total está concentrada em ratings de maior risco (D a H) e qual a PDD associada?',
    },
    {
      label: 'Saldo devedor vs LTV',
      fullPrompt: 'Cruze o "Saldo Devedor" com as faixas de LTV. Qual o percentual do saldo devedor em contratos com LTV acima de 80%? Qual o risco de perda em cenário de stress imobiliário?',
    },
    {
      label: 'Impacto no fluxo de caixa',
      fullPrompt: 'Como o "Saldo Devedor" atual se relaciona com o fluxo de parcelas esperado? Qual o prazo remanescente ponderado e a duration da carteira?',
    },
  ],

  'Valor em Atraso': [
    {
      label: 'Distribuição por faixa de atraso',
      fullPrompt: 'Detalhe a composição do "Valor em Atraso" por faixa de dias (1-5, 6-30, 30-60, 60-90, >90). Qual faixa concentra maior volume financeiro e qual a tendência de migração?',
    },
    {
      label: 'Concentração por empreendimento',
      fullPrompt: 'Quais empreendimentos concentram o maior "Valor em Atraso"? Há algum projeto específico que esteja deteriorando a carteira de forma desproporcional?',
    },
    {
      label: 'Aging e migração de faixas',
      fullPrompt: 'Analise o aging do "Valor em Atraso": contratos que estavam na faixa 30-60 dias migraram para >90 dias? Qual a taxa de cura (roll-back) vs. agravamento (roll-forward)?',
    },
    {
      label: 'Impacto na provisão (PDD)',
      fullPrompt: 'Quanto do "Valor em Atraso" já está provisionado via PDD Liquid? Qual o gap entre a provisão regulatória (Bacen) e o modelo interno para esses contratos inadimplentes?',
    },
  ],

  'Inadimplência': [
    {
      label: 'Comparação com benchmark',
      fullPrompt: 'Compare a taxa de "Inadimplência" atual da carteira com benchmarks do mercado de crédito imobiliário brasileiro (SBPE e MCMV). Estamos acima ou abaixo da média setorial?',
    },
    {
      label: 'Inadimplência por safra',
      fullPrompt: 'Analise a "Inadimplência" segmentada por safra de originação (vintage analysis). Quais safras apresentam pior desempenho e o que pode explicar essa deterioração?',
    },
    {
      label: 'Correlação com restrições',
      fullPrompt: 'Qual a correlação entre "Inadimplência" e a presença de restrições cadastrais (PEFIN, REFIN, Protestos)? Contratos com restrições têm inadimplência significativamente maior?',
    },
    {
      label: 'Projeção de inadimplência',
      fullPrompt: 'Com base na tendência atual da "Inadimplência" e no padrão de migração entre faixas de atraso, qual a projeção para os próximos 3 meses? Há risco de deterioração acelerada?',
    },
  ],

  'Atraso > 90 dias': [
    {
      label: 'Contratos em perda provável',
      fullPrompt: 'Quais contratos compõem o indicador "Atraso > 90 dias"? Liste os empreendimentos afetados, o saldo devedor total e o rating Liquid predominante nessa faixa.',
    },
    {
      label: 'Evolução temporal do over 90',
      fullPrompt: 'Analise a evolução do "Atraso > 90 dias" nos últimos 6 meses. O indicador está crescendo? Qual a taxa de migração da faixa 60-90 para >90 dias?',
    },
    {
      label: 'Impacto na elegibilidade',
      fullPrompt: 'Quantos contratos com "Atraso > 90 dias" eram anteriormente elegíveis para securitização? Qual o impacto financeiro da perda de elegibilidade desses contratos?',
    },
    {
      label: 'Estratégia de cobrança',
      fullPrompt: 'Para os contratos com "Atraso > 90 dias", qual o perfil de cobrança recomendado? Cruze com renda familiar, LTV e presença de restrições para definir prioridades de recuperação.',
    },
  ],

  // ─────────────────────────────────────────────────────────
  // KPIs da PDD
  // ─────────────────────────────────────────────────────────

  'Total PDD Liquid': [
    {
      label: 'PDD Liquid por rating',
      fullPrompt: 'Detalhe a composição do "Total PDD Liquid" por faixa de Rating Liquid. Quais ratings concentram a maior provisão e como isso se compara com a distribuição de saldo devedor?',
    },
    {
      label: 'Evolução da provisão',
      fullPrompt: 'Analise a evolução do "Total PDD Liquid" nos últimos meses. A provisão está crescendo mais rápido que o saldo devedor? O que isso indica sobre a qualidade creditícia da carteira?',
    },
    {
      label: 'PDD Liquid vs perda esperada',
      fullPrompt: 'Compare o "Total PDD Liquid" com a perda esperada calculada pelo modelo de scoring. A provisão é suficiente para cobrir o risco estimado ou há déficit de provisionamento?',
    },
    {
      label: 'Sensibilidade a downgrade',
      fullPrompt: 'Simule o impacto no "Total PDD Liquid" caso 10% dos contratos com rating C sofram downgrade para D. Qual o incremento na provisão necessária?',
    },
  ],

  'Total PDD Mín. Bacen': [
    {
      label: 'Composição por faixa Bacen',
      fullPrompt: 'Detalhe a composição do "Total PDD Mín. Bacen" por faixa de classificação (A0 a H) conforme Resolução 2682. Qual faixa representa a maior provisão regulatória?',
    },
    {
      label: 'Adequação regulatória',
      fullPrompt: 'A carteira está provisionada adequadamente conforme o "Total PDD Mín. Bacen"? Compare com o saldo em atraso por faixa de dias e verifique se há contratos classificados incorretamente.',
    },
    {
      label: 'PDD Bacen por empreendimento',
      fullPrompt: 'Qual a distribuição do "Total PDD Mín. Bacen" por empreendimento? Algum projeto específico concentra provisão regulatória desproporcional ao seu peso na carteira?',
    },
    {
      label: 'Tendência regulatória',
      fullPrompt: 'Analise a tendência do "Total PDD Mín. Bacen" ao longo dos últimos meses. O crescimento da provisão regulatória está alinhado com a evolução da inadimplência?',
    },
  ],

  'Delta Total': [
    {
      label: 'Onde está o risco oculto',
      fullPrompt: 'Analise o "Delta Total" (PDD Liquid - PDD Bacen) por rating. Em quais faixas o modelo Liquid identifica mais risco do que a regulação exige? Quais contratos estão sub-provisionados pelo Bacen?',
    },
    {
      label: 'Delta por empreendimento',
      fullPrompt: 'Segmente o "Delta Total" por empreendimento. Quais projetos apresentam maior diferença entre provisão Liquid e Bacen, indicando risco adicional não capturado pela regulação?',
    },
    {
      label: 'Evolução do gap de provisão',
      fullPrompt: 'O "Delta Total" está aumentando ou diminuindo ao longo do tempo? Uma tendência de alta indica que o modelo interno identifica deterioração creditícia antes da regulação.',
    },
    {
      label: 'Impacto no pricing',
      fullPrompt: 'Como o "Delta Total" impacta o pricing da carteira para fins de securitização? Qual o deságio adicional que o delta de provisão implica sobre o valor de mercado?',
    },
  ],

  // ─────────────────────────────────────────────────────────
  // KPIs do Pricing
  // ─────────────────────────────────────────────────────────

  'Pricing Total': [
    {
      label: 'Pricing por rating',
      fullPrompt: 'Detalhe o "Pricing Total" por faixa de Rating Liquid. Qual o valor de mercado estimado para cada faixa e como o deságio varia conforme o risco de crédito?',
    },
    {
      label: 'Pricing vs saldo devedor',
      fullPrompt: 'Compare o "Pricing Total" com o Saldo Devedor da carteira. Qual o ágio ou deságio implícito? Esse spread está coerente com o perfil de risco e as taxas de mercado?',
    },
    {
      label: 'Sensibilidade à taxa',
      fullPrompt: 'Simule o impacto no "Pricing Total" de uma variação de +/- 1 p.p. na taxa de desconto. Qual a sensibilidade (duration) do valor de mercado da carteira?',
    },
    {
      label: 'Carteira elegível vs total',
      fullPrompt: 'Qual o "Pricing Total" da carteira elegível versus a carteira total? Quanto valor é perdido por contratos inelegíveis e qual o deságio adicional que eles carregam?',
    },
  ],

  'Deságio Médio': [
    {
      label: 'Deságio por faixa de rating',
      fullPrompt: 'Analise o "Deságio Médio" segmentado por Rating Liquid. Quanto desconto adicional cada ponto de deterioração no rating implica no valor de mercado?',
    },
    {
      label: 'Comparação com mercado',
      fullPrompt: 'Compare o "Deságio Médio" da carteira com spreads praticados no mercado secundário de CRI e FIDC imobiliário. O deságio está alinhado com as condições atuais de mercado?',
    },
    {
      label: 'Deságio por elegibilidade',
      fullPrompt: 'Qual o "Deságio Médio" por categoria de elegibilidade? Contratos elegíveis têm deságio significativamente menor? Qual o incentivo financeiro de tornar contratos elegíveis?',
    },
    {
      label: 'Tendência do deságio',
      fullPrompt: 'O "Deságio Médio" está aumentando ou diminuindo ao longo dos meses? Correlacione com variações na Selic, inadimplência e composição da carteira por rating.',
    },
  ],

  // ─────────────────────────────────────────────────────────
  // KPIs da Simulação (LTV)
  // ─────────────────────────────────────────────────────────

  'Contratos com LTV > 80%': [
    {
      label: 'Concentração por empreendimento',
      fullPrompt: 'Quais empreendimentos concentram os "Contratos com LTV > 80%"? Há projetos onde a valorização do imóvel ficou abaixo do esperado, elevando o LTV?',
    },
    {
      label: 'Impacto no repasse bancário',
      fullPrompt: 'Quantos dos "Contratos com LTV > 80%" são barrados no repasse bancário por exceder o limite de 80%? Qual o saldo devedor represado e as alternativas de enquadramento?',
    },
    {
      label: 'Migração para LTV > 90%',
      fullPrompt: 'Dos "Contratos com LTV > 80%", quantos estão próximos do limite de 90% (inelegibilidade)? Simule um cenário de desvalorização de 5% e quantifique a migração.',
    },
    {
      label: 'Perfil de risco dos contratos',
      fullPrompt: 'Qual o perfil de risco dos "Contratos com LTV > 80%"? Analise rating médio, inadimplência, presença de restrições e suficiência de renda para esse subgrupo.',
    },
  ],

  'Saldo Devedor com LTV > 80%': [
    {
      label: 'Exposição por faixa de LTV',
      fullPrompt: 'Detalhe o "Saldo Devedor com LTV > 80%" nas subfaixas 80-85%, 85-90% e >90%. Qual a exposição em cada faixa e o risco crescente de perda em caso de execução?',
    },
    {
      label: 'Stress test imobiliário',
      fullPrompt: 'Simule o impacto no "Saldo Devedor com LTV > 80%" em cenário de desvalorização imobiliária de 10% (LTV Banco Stress). Quanto do saldo migraria para faixas de inelegibilidade?',
    },
    {
      label: 'Recuperabilidade estimada',
      fullPrompt: 'Para o "Saldo Devedor com LTV > 80%", qual a perda esperada (LGD) considerando o valor da garantia e custos de execução? Compare com a PDD provisionada.',
    },
    {
      label: 'Evolução temporal',
      fullPrompt: 'O "Saldo Devedor com LTV > 80%" está crescendo ao longo dos meses? Isso se deve a novas originações, desvalorização de imóveis ou amortização insuficiente?',
    },
  ],

  // ─────────────────────────────────────────────────────────
  // KPIs de Elegibilidade / Inadimplência
  // ─────────────────────────────────────────────────────────

  'Contratos Inadimplentes': [
    {
      label: 'Perfil dos inadimplentes',
      fullPrompt: 'Trace o perfil dos "Contratos Inadimplentes": distribuição por faixa de renda, empreendimento, safra de originação e presença de restrições cadastrais. Há padrão identificável?',
    },
    {
      label: 'Taxa de cura histórica',
      fullPrompt: 'Qual a taxa de cura (volta à adimplência) dos "Contratos Inadimplentes" nos últimos 6 meses? Contratos com qual perfil têm maior probabilidade de regularização?',
    },
    {
      label: 'Impacto na elegibilidade',
      fullPrompt: 'Quantos dos "Contratos Inadimplentes" eram elegíveis para securitização antes de entrar em atraso? Qual o saldo devedor que migrou de elegível para inelegível?',
    },
    {
      label: 'Segmentação para cobrança',
      fullPrompt: 'Segmente os "Contratos Inadimplentes" por grupo de repasse (G1 a G8) e perfil de cobrança. Quais segmentos devem ser priorizados na estratégia de recuperação e por quê?',
    },
  ],

  // Elegibilidade - "Valor em Atraso" (key diferente do dashboard principal)
  // O match será feito pela função getIndicatorSuggestions que extrai o nome do prompt

  'Inadimplência %': [
    {
      label: 'Decomposição da taxa',
      fullPrompt: 'Decomponha a "Inadimplência %" nos componentes: atraso curto (1-30d), médio (30-90d) e longo (>90d). Qual faixa está puxando a taxa para cima?',
    },
    {
      label: 'Análise por vintage',
      fullPrompt: 'Analise a "Inadimplência %" por safra de originação. Safras mais recentes performam melhor ou pior que as antigas? Há indicação de afrouxamento no crédito?',
    },
    {
      label: 'Correlação com macro',
      fullPrompt: 'Como a "Inadimplência %" da carteira se correlaciona com indicadores macroeconômicos como Selic, desemprego e inflação? A carteira é sensível a choques econômicos?',
    },
    {
      label: 'Meta vs realizado',
      fullPrompt: 'Qual era a inadimplência esperada pelo modelo de originação vs a "Inadimplência %" realizada? Há desvio significativo que indique erro no scoring de aprovação?',
    },
  ],

  'LTV Médio': [
    {
      label: 'LTV por empreendimento',
      fullPrompt: 'Detalhe o "LTV Médio" ponderado por empreendimento. Quais projetos têm LTV mais elevado e o que explica isso (preço do imóvel, entrada, amortização)?',
    },
    {
      label: 'Distribuição por faixa de LTV',
      fullPrompt: 'Qual a distribuição dos contratos por faixa de LTV em torno do "LTV Médio"? Qual percentual está acima de 80% (limite de repasse) e acima de 90% (limite de elegibilidade)?',
    },
    {
      label: 'LTV vs LTV Stress',
      fullPrompt: 'Compare o "LTV Médio" com o LTV Stress (cenário de desvalorização de 10%). Quantos contratos migrariam para faixas de risco se o mercado imobiliário sofrer correção?',
    },
    {
      label: 'Evolução do LTV médio',
      fullPrompt: 'O "LTV Médio" está subindo ou caindo ao longo do tempo? Correlacione com amortizações, novas originações e evolução dos preços dos imóveis na carteira.',
    },
  ],

  // ─────────────────────────────────────────────────────────
  // KPIs do Repasse
  // ─────────────────────────────────────────────────────────

  // "Total de Contratos" do repasse usa o mesmo key -- será diferenciado pelo contexto do prompt
  // que contém "repasse" ou "analisados para repasse"

  'Saldo Devedor Total': [
    {
      label: 'Exposição por grupo de repasse',
      fullPrompt: 'Detalhe o "Saldo Devedor Total" por grupo de estratégia de repasse (G1 a G8). Qual grupo concentra maior exposição e qual a probabilidade de repasse de cada um?',
    },
    {
      label: 'Saldo elegível vs inelegível',
      fullPrompt: 'Do "Saldo Devedor Total", qual percentual é elegível para repasse bancário imediato? Qual o saldo represado por restrições, LTV alto ou inadimplência?',
    },
    {
      label: 'Concentração por banco',
      fullPrompt: 'O "Saldo Devedor Total" da carteira apresenta concentração de exposição por empreendimento? Quantifique o risco de concentração e sugira limites de diversificação.',
    },
    {
      label: 'Projeção de amortização',
      fullPrompt: 'Com base no prazo remanescente e nas taxas contratuais, projete a amortização esperada do "Saldo Devedor Total" para os próximos 12 meses.',
    },
  ],

  'Índice de Repasse Médio': [
    {
      label: 'Distribuição do índice',
      fullPrompt: 'Analise a distribuição do "Índice de Repasse Médio" por empreendimento. Quais projetos têm maior aptidão ao repasse e quais são os gargalos nos projetos com índice baixo?',
    },
    {
      label: 'Fatores limitantes',
      fullPrompt: 'Quais fatores mais penalizam o "Índice de Repasse Médio"? Restrições cadastrais, LTV elevado, renda insuficiente ou inadimplência? Ranqueie por impacto.',
    },
    {
      label: 'Evolução temporal do índice',
      fullPrompt: 'O "Índice de Repasse Médio" está melhorando ao longo do tempo? Ações de saneamento de carteira (cobrança, regularização) estão surtindo efeito?',
    },
    {
      label: 'Simulação de melhoria',
      fullPrompt: 'Se todos os contratos com restrições cadastrais fossem regularizados, qual seria o novo "Índice de Repasse Médio"? Quantifique o ganho potencial.',
    },
  ],

  'Restrições Cadastrais': [
    {
      label: 'Tipo de restrição prevalente',
      fullPrompt: 'Detalhe as "Restrições Cadastrais" por tipo (PEFIN, REFIN, Protestos). Qual tipo é mais frequente e qual tem maior valor médio? Como cada tipo impacta o repasse?',
    },
    {
      label: 'Restrições por rating',
      fullPrompt: 'Qual a correlação entre "Restrições Cadastrais" e o Rating Liquid? Contratos com rating mais baixo concentram mais restrições? Quantifique por faixa.',
    },
    {
      label: 'Impacto no repasse',
      fullPrompt: 'Quantos contratos estão impossibilitados de repasse bancário exclusivamente por "Restrições Cadastrais"? Qual o saldo devedor represado e a perda de receita estimada?',
    },
    {
      label: 'Plano de regularização',
      fullPrompt: 'Quais "Restrições Cadastrais" são de baixo valor e potencialmente regularizáveis? Priorize por valor/esforço de regularização e estime o ganho em termos de contratos tornados elegíveis.',
    },
  ],

  // ─────────────────────────────────────────────────────────
  // Gráficos (ChartWidget)
  // ─────────────────────────────────────────────────────────

  'Evolução do Saldo Devedor': [
    {
      label: 'Tendência de amortização',
      fullPrompt: 'Analise a "Evolução do Saldo Devedor" e identifique se a carteira está amortizando na velocidade esperada. Compare com o cronograma contratual e sinalize desvios.',
    },
    {
      label: 'Saldo por rating ao longo do tempo',
      fullPrompt: 'Na "Evolução do Saldo Devedor", qual a participação de cada faixa de rating no saldo total ao longo dos meses? Há migração de saldo para ratings piores?',
    },
    {
      label: 'Impacto de novas originações',
      fullPrompt: 'Separe na "Evolução do Saldo Devedor" o efeito de novas originações vs. amortização de contratos existentes. O crescimento é orgânico ou inflado por novos contratos?',
    },
    {
      label: 'Projeção de saldo futuro',
      fullPrompt: 'Com base na "Evolução do Saldo Devedor" histórica e nas taxas contratuais, projete o saldo devedor para os próximos 6 meses assumindo a taxa de inadimplência atual.',
    },
  ],

  'Contratos por Faixa de Atraso': [
    {
      label: 'Migração entre faixas',
      fullPrompt: 'Analise o gráfico "Contratos por Faixa de Atraso" e identifique padrões de migração (roll rates). Contratos estão migrando de faixas leves para faixas mais severas?',
    },
    {
      label: 'Distribuição ideal vs atual',
      fullPrompt: 'Compare a distribuição atual de "Contratos por Faixa de Atraso" com uma distribuição saudável de carteira imobiliária. Quais faixas estão acima do aceitável?',
    },
    {
      label: 'Faixa mais preocupante',
      fullPrompt: 'Qual faixa no gráfico "Contratos por Faixa de Atraso" apresenta maior crescimento relativo? Essa tendência indica deterioração sistêmica ou eventos pontuais?',
    },
    {
      label: 'Ação por faixa',
      fullPrompt: 'Para cada faixa em "Contratos por Faixa de Atraso", sugira a ação de cobrança mais adequada: SMS, ligação, negociação, jurídico. Priorize pelo custo-benefício.',
    },
  ],

  'PDD Liquid vs PDD Mínima Bacen': [
    {
      label: 'Maior gap por rating',
      fullPrompt: 'No gráfico "PDD Liquid vs PDD Mínima Bacen", qual rating apresenta o maior delta (gap) entre as duas provisões? O que isso revela sobre o risco não capturado pela regulação?',
    },
    {
      label: 'Ratings sub-provisionados',
      fullPrompt: 'Identifique no comparativo "PDD Liquid vs PDD Mínima Bacen" quais ratings estão potencialmente sub-provisionados pelo critério regulatório. Qual o valor financeiro em risco?',
    },
    {
      label: 'Impacto no resultado',
      fullPrompt: 'Se adotássemos a "PDD Liquid" ao invés da "PDD Mínima Bacen" como provisão efetiva, qual seria o impacto no resultado (P&L) da operação? Quantifique a diferença.',
    },
    {
      label: 'Tendência do gap',
      fullPrompt: 'O gap entre "PDD Liquid" e "PDD Mínima Bacen" está aumentando ou diminuindo ao longo do tempo? Uma divergência crescente indica deterioração não reconhecida.',
    },
  ],

  'LTV Banco por Faixa': [
    {
      label: 'Concentração em faixas altas',
      fullPrompt: 'No gráfico "LTV Banco por Faixa", qual percentual do saldo devedor está acima de 80%? Compare com o limite de 90% para elegibilidade e quantifique o risco de migração.',
    },
    {
      label: 'Cenário de stress no LTV',
      fullPrompt: 'Simule no gráfico "LTV Banco por Faixa" um cenário de desvalorização imobiliária de 10%. Quantos contratos migrariam para faixas superiores de risco?',
    },
    {
      label: 'LTV por tipo de imóvel',
      fullPrompt: 'A distribuição de "LTV Banco por Faixa" varia conforme o tipo de empreendimento (SBPE vs MCMV)? Qual segmento apresenta maior concentração em faixas elevadas?',
    },
    {
      label: 'Relação LTV vs inadimplência',
      fullPrompt: 'Cruze "LTV Banco por Faixa" com a taxa de inadimplência. Contratos com LTV mais alto têm maior propensão ao default? Quantifique a correlação.',
    },
  ],

  'Composição dos Pagamentos': [
    {
      label: 'Mix de recebimentos',
      fullPrompt: 'Analise a "Composição dos Pagamentos" e identifique a proporção de cada tipo de recebimento (amortização, juros, seguros, taxas). O mix está estável ao longo do tempo?',
    },
    {
      label: 'Tendência de antecipações',
      fullPrompt: 'Na "Composição dos Pagamentos", a proporção de pagamentos antecipados (pré-pagamento) está crescendo? Qual o impacto no duration e no pricing da carteira?',
    },
    {
      label: 'Sazonalidade de pagamentos',
      fullPrompt: 'Há sazonalidade na "Composição dos Pagamentos"? Meses específicos concentram mais recebimentos (13o salário, FGTS)? Isso afeta o fluxo de caixa esperado?',
    },
    {
      label: 'Pagamentos vs esperado',
      fullPrompt: 'Compare a "Composição dos Pagamentos" realizada com o fluxo contratado. Qual o percentual de aderência e quais categorias apresentam maior desvio?',
    },
  ],

  'Fluxo de Parcela Ajustado ao Risco': [
    {
      label: 'Gap entre esperado e contratado',
      fullPrompt: 'No gráfico "Fluxo de Parcela Ajustado ao Risco", qual o gap médio entre fluxo esperado (barras) e fluxo contratado (linha)? Esse gap reflete adequadamente a PDD da carteira?',
    },
    {
      label: 'Meses de maior exposição',
      fullPrompt: 'Identifique no "Fluxo de Parcela Ajustado ao Risco" os meses com maior concentração de recebíveis. Há risco de concentração temporal no fluxo de caixa?',
    },
    {
      label: 'Impacto da inadimplência no fluxo',
      fullPrompt: 'Quanto a inadimplência atual reduz o "Fluxo de Parcela Ajustado ao Risco" em relação ao fluxo contratado? Simule cenário de aumento de 2 p.p. na inadimplência.',
    },
    {
      label: 'Adequação para cobertura de CRI',
      fullPrompt: 'O "Fluxo de Parcela Ajustado ao Risco" é suficiente para cobrir o serviço de dívida de uma emissão de CRI lastreada nesta carteira? Qual o índice de cobertura (DSCR)?',
    },
  ],

  'Evolução do Rating': [
    {
      label: 'Migração de rating',
      fullPrompt: 'Analise a "Evolução do Rating" e identifique a tendência de migração. O percentual de contratos com rating A e B está crescendo ou encolhendo ao longo do tempo?',
    },
    {
      label: 'Concentração em ratings ruins',
      fullPrompt: 'Na "Evolução do Rating", qual o percentual de contratos nos ratings D a H? Esse percentual está estável, melhorando ou deteriorando nos últimos meses?',
    },
    {
      label: 'Rating vs provisão necessária',
      fullPrompt: 'Correlacione a "Evolução do Rating" com a evolução da PDD. A migração de ratings está antecipando necessidades de provisão adicional?',
    },
    {
      label: 'Safras com pior rating',
      fullPrompt: 'Cruze a "Evolução do Rating" com as safras de originação. Safras mais recentes mantêm rating melhor que as mais antigas? Isso indica melhoria no processo de crédito?',
    },
  ],

  'Rating x Empreendimento': [
    {
      label: 'Empreendimentos de maior risco',
      fullPrompt: 'No gráfico "Rating x Empreendimento", quais projetos concentram maior proporção de ratings D a H? Esses empreendimentos compartilham características (localização, faixa de preço)?',
    },
    {
      label: 'Diversificação do risco',
      fullPrompt: 'Analise "Rating x Empreendimento" para avaliar a diversificação de risco. A carteira depende de poucos empreendimentos para ratings bons ou há diversificação adequada?',
    },
    {
      label: 'Empreendimentos para repasse',
      fullPrompt: 'Com base no "Rating x Empreendimento", quais projetos têm melhor perfil para repasse bancário prioritário (concentração de ratings A e B com poucos ratings ruins)?',
    },
    {
      label: 'Ação por empreendimento',
      fullPrompt: 'Para cada empreendimento no gráfico "Rating x Empreendimento", sugira a ação prioritária: repasse, cobrança intensiva, renegociação ou monitoramento. Justifique com base na distribuição de rating.',
    },
  ],

  'Inadimplência por Safra': [
    {
      label: 'Safras problemáticas',
      fullPrompt: 'Identifique na "Inadimplência por Safra" quais safras (meses de originação) apresentam inadimplência acima de 2x a média. O que essas safras têm em comum (período, empreendimento)?',
    },
    {
      label: 'Curva de maturação',
      fullPrompt: 'Analise a "Inadimplência por Safra" sob a ótica de curva de maturação. Quanto tempo após a originação a inadimplência se estabiliza? Safras mais jovens já mostram sinais precoces?',
    },
    {
      label: 'Correlação com cenário macro',
      fullPrompt: 'Cruze "Inadimplência por Safra" com indicadores macroeconômicos (Selic, desemprego) do período de originação. Safras originadas em momentos de stress têm pior performance?',
    },
    {
      label: 'Qualidade da originação',
      fullPrompt: 'A "Inadimplência por Safra" indica melhoria ou piora na qualidade da originação ao longo do tempo? Safras recentes performam melhor, sugerindo aprimoramento nos critérios de crédito?',
    },
  ],

  // ─────────────────────────────────────────────────────────
  // Tabelas (DataTableWidget)
  // ─────────────────────────────────────────────────────────

  'Resumo por Empreendimento': [
    {
      label: 'Ranking de qualidade',
      fullPrompt: 'Com base na tabela "Resumo por Empreendimento", ranqueie os projetos por qualidade creditícia considerando: inadimplência, LTV médio, rating predominante e valor em atraso.',
    },
    {
      label: 'Concentração de exposição',
      fullPrompt: 'Analise a concentração de exposição na tabela "Resumo por Empreendimento". Algum projeto concentra mais de 20% do saldo total? Qual o risco dessa concentração?',
    },
    {
      label: 'Empreendimentos para securitização',
      fullPrompt: 'Quais empreendimentos na tabela "Resumo por Empreendimento" têm melhor perfil para compor um pool de securitização? Considere elegibilidade, inadimplência baixa e LTV controlado.',
    },
    {
      label: 'Empreendimentos deteriorando',
      fullPrompt: 'Identifique na tabela "Resumo por Empreendimento" quais projetos estão com indicadores deteriorando (inadimplência crescente, atraso alto). Sugira ações corretivas para cada um.',
    },
  ],

  'PDD por Rating Liquid': [
    {
      label: 'Adequação da provisão por faixa',
      fullPrompt: 'Analise a tabela "PDD por Rating Liquid" e avalie se a provisão em cada faixa é adequada. Quais ratings apresentam maior delta entre PDD Liquid e PDD Bacen?',
    },
    {
      label: 'Provisão vs perda esperada',
      fullPrompt: 'Na tabela "PDD por Rating Liquid", a provisão total cobre a perda esperada calculada pelo modelo? Há faixas específicas onde o déficit de provisão é preocupante?',
    },
    {
      label: 'Impacto de migração de rating',
      fullPrompt: 'Simule na "PDD por Rating Liquid" o impacto de um downgrade generalizado de 1 nível. Qual seria o incremento necessário na provisão total?',
    },
    {
      label: 'Otimização de provisão',
      fullPrompt: 'Com base na "PDD por Rating Liquid", quais ações reduziriam mais a provisão necessária? Priorize entre cobrança de inadimplentes, renegociação e melhoria de rating.',
    },
  ],

  'Pricing por Rating Liquid': [
    {
      label: 'Deságio implícito por faixa',
      fullPrompt: 'Na tabela "Pricing por Rating Liquid", qual o deságio implícito em cada faixa? Ratings piores têm deságio proporcionalmente maior ou há descontinuidades?',
    },
    {
      label: 'Valor justo vs mercado',
      fullPrompt: 'Compare os valores de "Pricing por Rating Liquid" com spreads praticados em operações comparáveis no mercado de CRI. O pricing está competitivo?',
    },
    {
      label: 'Ganho de pricing por upgrade',
      fullPrompt: 'Na tabela "Pricing por Rating Liquid", quantifique o ganho de valor se contratos rating C migrassem para B. Qual o incentivo financeiro para melhorar a qualidade da carteira?',
    },
    {
      label: 'Pricing da carteira elegível',
      fullPrompt: 'Filtre a tabela "Pricing por Rating Liquid" apenas para contratos elegíveis. Qual o pricing total e o deságio médio dessa subcarteira versus o total?',
    },
  ],

  'Grupos de Estratégia de Repasse': [
    {
      label: 'Priorização de grupos',
      fullPrompt: 'Com base na tabela "Grupos de Estratégia de Repasse", priorize os grupos G1 a G8 por facilidade de repasse. Quais grupos podem ser repassados imediatamente e quais exigem saneamento?',
    },
    {
      label: 'Custo de saneamento',
      fullPrompt: 'Para cada grupo na tabela "Grupos de Estratégia de Repasse" que não é repassável, estime o custo e esforço de saneamento para torná-lo elegível ao repasse bancário.',
    },
    {
      label: 'Saldo represado por grupo',
      fullPrompt: 'Qual o saldo devedor total represado em cada grupo de "Grupos de Estratégia de Repasse"? Qual o custo de oportunidade (carry) de manter esses contratos em carteira?',
    },
    {
      label: 'Critérios bloqueantes',
      fullPrompt: 'Na tabela "Grupos de Estratégia de Repasse", qual critério é o principal bloqueante em cada grupo (restrição, LTV, renda)? Isso orienta a estratégia de regularização.',
    },
  ],

  'Indicadores por Faixa de Atraso': [
    {
      label: 'Saldo por faixa de atraso',
      fullPrompt: 'Analise na tabela "Indicadores por Faixa de Atraso" a distribuição de saldo devedor entre as faixas. Qual percentual do saldo está em faixas de atraso severo (>60 dias)?',
    },
    {
      label: 'Taxa de roll entre faixas',
      fullPrompt: 'Com base na tabela "Indicadores por Faixa de Atraso", estime a taxa de roll (migração) entre faixas consecutivas. Qual a probabilidade de um contrato em 30-60 dias migrar para 60-90?',
    },
    {
      label: 'LTV médio por faixa',
      fullPrompt: 'Na tabela "Indicadores por Faixa de Atraso", contratos com maior atraso também têm LTV mais alto? Isso indica que o risco de crédito e o risco de garantia estão correlacionados?',
    },
    {
      label: 'Provisão adequada por faixa',
      fullPrompt: 'A provisão (PDD) alocada em cada faixa da tabela "Indicadores por Faixa de Atraso" é proporcional ao risco? Compare PDD Liquid vs Bacen para cada faixa de atraso.',
    },
  ],

  'Detalhamento da Base Analítica': [
    {
      label: 'Contratos de maior risco',
      fullPrompt: 'Na tabela "Detalhamento da Base Analítica", identifique os 10 contratos com maior risco combinado (rating baixo + LTV alto + atraso severo). Qual a exposição total desses contratos?',
    },
    {
      label: 'Anomalias nos dados',
      fullPrompt: 'Analise a tabela "Detalhamento da Base Analítica" para identificar anomalias: contratos com rating A mas inadimplentes, LTV > 100%, ou inconsistências entre campos. Liste os casos.',
    },
    {
      label: 'Contratos prontos para repasse',
      fullPrompt: 'Na tabela "Detalhamento da Base Analítica", filtre contratos que atendem todos os critérios de repasse: adimplentes, LTV < 80%, sem restrições, renda suficiente. Quantos são e qual o saldo?',
    },
    {
      label: 'Perfil da carteira pró-soluto',
      fullPrompt: 'Identifique na tabela "Detalhamento da Base Analítica" os contratos pró-soluto (sem garantia bancária). Qual o perfil de risco médio e o saldo devedor exposto sem cobertura?',
    },
  ],

  // Tabelas adicionais da elegibilidade
  'Inadimplência por Faixa de Atraso': [
    {
      label: 'Faixa com maior deterioração',
      fullPrompt: 'Na tabela "Inadimplência por Faixa de Atraso", qual faixa apresentou maior crescimento relativo no último período? Isso indica aceleração da deterioração creditícia?',
    },
    {
      label: 'Saldo vs contratos por faixa',
      fullPrompt: 'Compare na tabela "Inadimplência por Faixa de Atraso" a proporção de contratos vs saldo em cada faixa. Contratos de alto valor estão concentrados em faixas piores?',
    },
    {
      label: 'Provisão por faixa',
      fullPrompt: 'Para cada faixa na tabela "Inadimplência por Faixa de Atraso", qual a PDD Liquid associada? A provisão é proporcional ao risco em cada faixa de dias?',
    },
    {
      label: 'Estratégia por faixa de atraso',
      fullPrompt: 'Defina uma estratégia de cobrança diferenciada para cada faixa na tabela "Inadimplência por Faixa de Atraso": preventiva, ativa, negociação ou jurídica. Qual o ROI esperado?',
    },
  ],


  'Matriz de Cobrança': [
    {
      label: 'Segmentos prioritários',
      fullPrompt: 'Na tabela "Matriz de Cobrança", quais segmentos (cruzamento de categoria de risco x perfil de cobrança) devem ser priorizados pela equipe de recuperação? Considere volume e probabilidade de cura.',
    },
    {
      label: 'Custo-benefício por segmento',
      fullPrompt: 'Analise o custo-benefício de cobrança em cada célula da "Matriz de Cobrança". Quais segmentos têm melhor retorno esperado por real investido em cobrança?',
    },
    {
      label: 'Estratégia diferenciada',
      fullPrompt: 'Sugira uma estratégia de cobrança diferenciada para cada segmento da "Matriz de Cobrança": canal de contato, tom da mensagem, desconto máximo permitido e prazo de negociação.',
    },
    {
      label: 'Evolução da matriz',
      fullPrompt: 'A distribuição de contratos na "Matriz de Cobrança" mudou nos últimos meses? Segmentos de maior risco estão crescendo ou as ações de cobrança estão surtindo efeito?',
    },
  ],

  // Tabela de pagamentos
  'Detalhamento dos Pagamentos': [
    {
      label: 'Aderência ao esperado',
      fullPrompt: 'Compare na tabela "Detalhamento dos Pagamentos" os valores realizados vs. esperados por mês e tipo de recebimento. Qual a taxa de aderência e onde estão os maiores desvios?',
    },
    {
      label: 'Tendência de recebimentos',
      fullPrompt: 'Analise a tendência na tabela "Detalhamento dos Pagamentos". Os recebimentos estão crescendo, estáveis ou caindo? Correlacione com a evolução da inadimplência.',
    },
    {
      label: 'Tipo de pagamento dominante',
      fullPrompt: 'Na tabela "Detalhamento dos Pagamentos", qual tipo de recebimento representa maior proporção? A composição está mudando ao longo do tempo?',
    },
    {
      label: 'Projeção de recebíveis',
      fullPrompt: 'Com base na tabela "Detalhamento dos Pagamentos", projete os recebimentos para os próximos 3 meses considerando sazonalidade e tendência de inadimplência.',
    },
  ],

  // Tabelas de repasse adicionais
  'Descrição dos Grupos': [
    {
      label: 'Critérios por grupo',
      fullPrompt: 'Detalhe os critérios de classificação de cada grupo na tabela "Descrição dos Grupos". Como a combinação de restrição, LTV e renda define cada grupo de G1 a G8?',
    },
    {
      label: 'Ações por grupo',
      fullPrompt: 'Para cada grupo na "Descrição dos Grupos", qual ação prioritária torna os contratos elegíveis ao repasse? Estime o esforço e o prazo para saneamento.',
    },
    {
      label: 'Distribuição de contratos',
      fullPrompt: 'Quantos contratos caem em cada grupo descrito na "Descrição dos Grupos"? Os grupos de maior risco (com restrição + LTV alto) representam que percentual do saldo?',
    },
    {
      label: 'Migração entre grupos',
      fullPrompt: 'É possível que contratos migrem de grupos piores para melhores na "Descrição dos Grupos" com ações de saneamento? Quantifique o potencial de melhoria.',
    },
  ],

  // Tabelas de restrições
  'Restrições por Rating Liquid': [
    {
      label: 'Correlação restrição e rating',
      fullPrompt: 'Analise a tabela "Restrições por Rating Liquid". Há correlação clara entre a presença de restrições e ratings piores? Quantos contratos com restrição têm rating A ou B?',
    },
    {
      label: 'Impacto na provisão',
      fullPrompt: 'Na tabela "Restrições por Rating Liquid", qual o delta de PDD adicional atribuível à presença de restrições em cada faixa de rating?',
    },
    {
      label: 'Regularização por faixa',
      fullPrompt: 'Na "Restrições por Rating Liquid", quais faixas de rating teriam maior ganho com a regularização de restrições? Priorize pela relação custo-benefício.',
    },
    {
      label: 'Volume e valor por rating',
      fullPrompt: 'Quantifique na tabela "Restrições por Rating Liquid" o número de restrições e valor total em cada faixa. Qual rating concentra a maior exposição a restrições?',
    },
  ],

  'Restrições por Tipo': [
    {
      label: 'Tipo mais impactante',
      fullPrompt: 'Na tabela "Restrições por Tipo", qual tipo de restrição (PEFIN, REFIN, Protestos) tem maior impacto na elegibilidade de repasse? Quantifique por valor e quantidade.',
    },
    {
      label: 'Regularizáveis de baixo valor',
      fullPrompt: 'Identifique na "Restrições por Tipo" quais restrições são de baixo valor (< R$ 1.000) e potencialmente regularizáveis rapidamente. Quantos contratos seriam desbloqueados?',
    },
    {
      label: 'Evolução por tipo',
      fullPrompt: 'A quantidade de restrições na tabela "Restrições por Tipo" está crescendo ou diminuindo? Qual tipo apresenta maior tendência de aumento?',
    },
    {
      label: 'Custo de regularização',
      fullPrompt: 'Estime o custo total de regularização por tipo na tabela "Restrições por Tipo". Compare com o ganho potencial em repasse e melhoria de rating para calcular o ROI.',
    },
  ],

  'Restrições por Faixa de Valor': [
    {
      label: 'Quick wins de regularização',
      fullPrompt: 'Na tabela "Restrições por Faixa de Valor", quais faixas de baixo valor concentram mais contratos? Essas são oportunidades rápidas de regularização com alto impacto.',
    },
    {
      label: 'Exposição nas faixas altas',
      fullPrompt: 'Qual o saldo devedor dos contratos nas faixas de maior valor de restrição na tabela "Restrições por Faixa de Valor"? Esses contratos são recuperáveis?',
    },
    {
      label: 'Distribuição e concentração',
      fullPrompt: 'Analise a distribuição na tabela "Restrições por Faixa de Valor". A maioria das restrições é de baixo ou alto valor? Qual a mediana e como isso orienta a estratégia?',
    },
    {
      label: 'Impacto no repasse por faixa',
      fullPrompt: 'Para cada faixa na tabela "Restrições por Faixa de Valor", quantos contratos seriam elegíveis ao repasse se as restrições fossem quitadas? Qual o ganho financeiro?',
    },
  ],

  'Detalhamento de Restrições': [
    {
      label: 'Contratos com múltiplas restrições',
      fullPrompt: 'Na tabela "Detalhamento de Restrições", identifique contratos com múltiplas restrições simultâneas. Qual o perfil de risco desses contratos e são recuperáveis?',
    },
    {
      label: 'Maior valor de restrição',
      fullPrompt: 'Quais contratos na tabela "Detalhamento de Restrições" possuem o maior valor total de restrições? Esses valores são bloqueantes para o repasse?',
    },
    {
      label: 'Restrições vs inadimplência',
      fullPrompt: 'Na tabela "Detalhamento de Restrições", contratos com restrições são necessariamente inadimplentes? Quantos estão adimplentes apesar das restrições?',
    },
    {
      label: 'Priorização de regularização',
      fullPrompt: 'Crie um ranking de prioridade de regularização na tabela "Detalhamento de Restrições" baseado em: valor da restrição, saldo devedor, LTV e probabilidade de repasse.',
    },
  ],

  // Tabelas da simulação
  'Matriz LTV x LTV Stress (10%)': [
    {
      label: 'Migração no stress',
      fullPrompt: 'Na "Matriz LTV x LTV Stress (10%)", quantos contratos migram de faixas seguras (<80%) para faixas de risco (>80%) no cenário de stress? Qual o saldo afetado?',
    },
    {
      label: 'Concentração de risco',
      fullPrompt: 'Analise a "Matriz LTV x LTV Stress (10%)" e identifique em quais células (combinação LTV atual x LTV stress) se concentra a maior exposição da carteira.',
    },
    {
      label: 'Impacto na elegibilidade',
      fullPrompt: 'No cenário stress da "Matriz LTV x LTV Stress (10%)", quantos contratos perderiam elegibilidade (LTV > 90%)? Qual o saldo devedor que migraria para inelegível?',
    },
    {
      label: 'Buffer de segurança',
      fullPrompt: 'Qual o buffer médio entre o LTV atual e o limite de 90% na "Matriz LTV x LTV Stress (10%)"? Contratos com buffer estreito devem ser monitorados de perto.',
    },
  ],

  // Gráficos adicionais da elegibilidade
  'LTV por Faixa': [
    {
      label: 'Concentração por faixa',
      fullPrompt: 'No gráfico "LTV por Faixa", qual faixa concentra o maior saldo devedor? Existe concentração preocupante acima de 80% que limite o repasse bancário?',
    },
    {
      label: 'Tendência do LTV',
      fullPrompt: 'Analise a evolução do gráfico "LTV por Faixa" ao longo do tempo. As faixas de LTV alto estão crescendo ou diminuindo com a amortização dos contratos?',
    },
    {
      label: 'LTV e inadimplência',
      fullPrompt: 'Cruze o gráfico "LTV por Faixa" com inadimplência. Faixas de LTV mais altas têm correlação com maior inadimplência? Isso sugere que skin-in-the-game do mutuário importa?',
    },
    {
      label: 'Simulação de cenário adverso',
      fullPrompt: 'Simule no gráfico "LTV por Faixa" um cenário de desvalorização de 15% dos imóveis. Como a distribuição por faixa mudaria e qual o impacto na carteira elegível?',
    },
  ],

  'Distribuição Percentual por Faixa': [
    {
      label: 'Evolução da composição',
      fullPrompt: 'Analise no gráfico "Distribuição Percentual por Faixa" como a composição da carteira por faixa de atraso evoluiu nos últimos meses. A qualidade está melhorando ou piorando?',
    },
    {
      label: 'Faixa em crescimento',
      fullPrompt: 'Qual faixa de atraso no gráfico "Distribuição Percentual por Faixa" apresenta o maior crescimento proporcional? Isso é sinal de deterioração sistêmica?',
    },
    {
      label: 'Comparação com benchmark',
      fullPrompt: 'Compare a distribuição no gráfico "Distribuição Percentual por Faixa" com benchmarks saudáveis do mercado imobiliário. A composição atual é aceitável para securitização?',
    },
    {
      label: 'Meta de composição',
      fullPrompt: 'Qual seria a "Distribuição Percentual por Faixa" ideal para esta carteira? Quantos contratos precisam ser regularizados para atingir a distribuição alvo?',
    },
  ],

  'Valor em Atraso por Faixa': [
    {
      label: 'Concentração do valor',
      fullPrompt: 'No gráfico "Valor em Atraso por Faixa", qual faixa de atraso concentra o maior valor financeiro? A concentração em faixas severas (>90d) está crescendo?',
    },
    {
      label: 'Valor médio por contrato',
      fullPrompt: 'Calcule o valor médio de atraso por contrato em cada faixa do gráfico "Valor em Atraso por Faixa". Faixas mais severas têm ticket médio maior (indicando contratos maiores inadimplindo)?',
    },
    {
      label: 'Recuperabilidade por faixa',
      fullPrompt: 'No gráfico "Valor em Atraso por Faixa", qual o percentual de recuperação esperado em cada faixa? Faixas >90 dias têm que percentual de perda provável?',
    },
    {
      label: 'Evolução temporal',
      fullPrompt: 'O "Valor em Atraso por Faixa" está crescendo, estável ou diminuindo ao longo dos meses? Qual faixa apresenta a maior variação e o que isso indica?',
    },
  ],

  'Saldo Devedor por Faixa': [
    {
      label: 'Exposição em faixas severas',
      fullPrompt: 'No gráfico "Saldo Devedor por Faixa", qual percentual do saldo total está em faixas de atraso acima de 60 dias? Esse percentual é aceitável para uma carteira securitizável?',
    },
    {
      label: 'Saldo devedor sem atraso',
      fullPrompt: 'Quanto do saldo devedor no gráfico "Saldo Devedor por Faixa" está na categoria sem atraso? Esse é o pool saudável para securitização. Como ele evoluiu no tempo?',
    },
    {
      label: 'Migração de saldo',
      fullPrompt: 'Analise a migração de saldo devedor entre faixas no gráfico "Saldo Devedor por Faixa" ao longo dos meses. O saldo está fluindo de faixas leves para severas?',
    },
    {
      label: 'Impacto na PDD',
      fullPrompt: 'Correlacione o "Saldo Devedor por Faixa" com a PDD necessária. Se todo o saldo em faixas >90d for provisionado a 100%, qual o impacto no resultado da operação?',
    },
  ],

  'Contratos por Faixa de Valor de Restrição': [
    {
      label: 'Quick wins',
      fullPrompt: 'No gráfico "Contratos por Faixa de Valor de Restrição", quantos contratos estão em faixas de baixo valor (regularizáveis)? Qual o custo total de regularização desse grupo?',
    },
    {
      label: 'Distribuição e Pareto',
      fullPrompt: 'Aplique a análise de Pareto ao gráfico "Contratos por Faixa de Valor de Restrição". Qual faixa de valor responde por 80% dos contratos com restrição?',
    },
    {
      label: 'Impacto por faixa no repasse',
      fullPrompt: 'Para cada faixa no gráfico "Contratos por Faixa de Valor de Restrição", quantos contratos seriam desbloqueados para repasse se regularizados? Calcule o ROI.',
    },
    {
      label: 'Perfil dos contratos restritos',
      fullPrompt: 'Qual o perfil médio (rating, LTV, renda) dos contratos em cada faixa do gráfico "Contratos por Faixa de Valor de Restrição"? Faixas de maior valor têm risco mais alto?',
    },
  ],

  // Gráficos do fluxo de caixa
  'Fluxo Esperado Mensal': [
    {
      label: 'Concentração temporal',
      fullPrompt: 'No gráfico "Fluxo Esperado Mensal", há concentração de recebíveis em meses específicos? Qual o risco de descasamento entre entradas e obrigações da operação?',
    },
    {
      label: 'Tendência de recebíveis',
      fullPrompt: 'O "Fluxo Esperado Mensal" está crescendo ou declinando? Correlacione com amortizações, inadimplência e novas originações para entender os drivers.',
    },
    {
      label: 'Cobertura do serviço de dívida',
      fullPrompt: 'O "Fluxo Esperado Mensal" é suficiente para cobrir o serviço de dívida mensal de uma emissão de CRI? Calcule o DSCR (Debt Service Coverage Ratio) mensal.',
    },
    {
      label: 'Cenário pessimista',
      fullPrompt: 'Simule o "Fluxo Esperado Mensal" em cenário pessimista: inadimplência 50% acima da atual e pré-pagamento zero. O fluxo ainda é viável para securitização?',
    },
  ],

  // Gráfico e tabela do repasse
  'Saldo Devedor por Grupo': [
    {
      label: 'Grupos de maior exposição',
      fullPrompt: 'No gráfico "Saldo Devedor por Grupo", quais grupos de repasse concentram a maior exposição financeira? Essa concentração é coerente com a estratégia de saneamento?',
    },
    {
      label: 'Evolução por grupo',
      fullPrompt: 'O "Saldo Devedor por Grupo" está migrando de grupos de maior risco para grupos mais saudáveis? As ações de saneamento estão reduzindo a exposição nos piores grupos?',
    },
    {
      label: 'Priorização financeira',
      fullPrompt: 'Com base no "Saldo Devedor por Grupo", priorizando o valor financeiro, quais grupos devem receber atenção primeiro para maximizar o volume de repasse bancário?',
    },
    {
      label: 'Custo-benefício por grupo',
      fullPrompt: 'Para cada grupo no gráfico "Saldo Devedor por Grupo", estime o custo de saneamento vs. o benefício financeiro do repasse. Qual grupo tem melhor ROI?',
    },
  ],

  // Gráficos de contratos
  'Unidades Comercializadas': [
    {
      label: 'Velocidade de vendas',
      fullPrompt: 'Analise o gráfico "Unidades Comercializadas" e identifique a velocidade de vendas (VSO). A comercialização está acelerando ou desacelerando?',
    },
    {
      label: 'Ticket médio por período',
      fullPrompt: 'No gráfico "Unidades Comercializadas", como o ticket médio (valor dos imóveis) evoluiu? Há tendência de aumento ou redução no valor médio das unidades?',
    },
    {
      label: 'Sazonalidade de vendas',
      fullPrompt: 'Há padrão sazonal no gráfico "Unidades Comercializadas"? Quais meses concentram maior volume de vendas e como isso impacta o fluxo de originação?',
    },
    {
      label: 'Correlação com carteira',
      fullPrompt: 'As novas unidades no gráfico "Unidades Comercializadas" estão entrando com perfil de risco melhor ou pior que a carteira existente? Compare rating e LTV das safras recentes.',
    },
  ],

  'Saldo em Atraso ao Longo do Tempo': [
    {
      label: 'Tendência de deterioração',
      fullPrompt: 'O gráfico "Saldo em Atraso ao Longo do Tempo" mostra tendência de crescimento? A deterioração está acelerando ou estabilizando nos últimos meses?',
    },
    {
      label: 'Pico de inadimplência',
      fullPrompt: 'Identifique no gráfico "Saldo em Atraso ao Longo do Tempo" os picos de inadimplência. O que pode ter causado esses picos (safras ruins, choques macro, eventos específicos)?',
    },
    {
      label: 'Relação com taxa de inadimplência',
      fullPrompt: 'No gráfico "Saldo em Atraso ao Longo do Tempo", a evolução do saldo em atraso acompanha proporcionalmente a taxa de inadimplência? Ou contratos de maior valor inadimplindo distorcem o indicador?',
    },
    {
      label: 'Projeção de saldo em atraso',
      fullPrompt: 'Com base na tendência do gráfico "Saldo em Atraso ao Longo do Tempo", projete o saldo em atraso para os próximos 3 meses. Qual o impacto na provisão?',
    },
  ],

  'Evolução do Valor em Atraso': [
    {
      label: 'Contribuição por rating',
      fullPrompt: 'No gráfico "Evolução do Valor em Atraso", qual rating contribui mais para o crescimento do valor em atraso? A deterioração é concentrada ou distribuída?',
    },
    {
      label: 'Velocidade de crescimento',
      fullPrompt: 'Analise a velocidade de crescimento no gráfico "Evolução do Valor em Atraso". O valor em atraso cresce mais rápido que o saldo devedor total?',
    },
    {
      label: 'Impacto na provisão',
      fullPrompt: 'Correlacione a "Evolução do Valor em Atraso" com a evolução da PDD. A provisão está acompanhando o crescimento do valor em atraso ou há gap crescente?',
    },
    {
      label: 'Ratings em deterioração',
      fullPrompt: 'Identifique na "Evolução do Valor em Atraso" quais ratings apresentam crescimento mais acelerado do valor em atraso. Esses ratings merecem atenção especial?',
    },
  ],

  // Pricing por Elegibilidade
  'Pricing por Elegibilidade': [
    {
      label: 'Deságio por categoria',
      fullPrompt: 'Na tabela "Pricing por Elegibilidade", qual o deságio médio em cada categoria (Elegível A/B, Possível, Futura, Inelegível)? Qual o prêmio de elegibilidade?',
    },
    {
      label: 'Valor de mercado elegível',
      fullPrompt: 'Qual percentual do valor de mercado na tabela "Pricing por Elegibilidade" vem de contratos elegíveis vs inelegíveis? A carteira elegível é suficiente para uma operação estruturada?',
    },
    {
      label: 'Ganho de valor por saneamento',
      fullPrompt: 'Se contratos "Elegibilidade Possível" migrassem para "Elegível" na tabela "Pricing por Elegibilidade", qual seria o ganho de valor (redução de deságio)? Justifica o esforço?',
    },
    {
      label: 'Pricing para FIDC/CRI',
      fullPrompt: 'Com base na tabela "Pricing por Elegibilidade", qual o pricing total da carteira elegível que poderia compor um FIDC ou lastro de CRI? Qual o spread implícito?',
    },
  ],

  // Fluxo de caixa - tabela
  'Fluxo Mensal': [
    {
      label: 'Aderência ao contratado',
      fullPrompt: 'Na tabela "Fluxo Mensal", compare os valores esperados vs contratados por período. Qual a taxa de aderência e quais meses apresentam maior desvio?',
    },
    {
      label: 'Meses críticos',
      fullPrompt: 'Identifique na tabela "Fluxo Mensal" os meses com menor fluxo esperado. Há risco de insuficiência para cobertura de obrigações da operação nesses períodos?',
    },
    {
      label: 'Projeção ajustada',
      fullPrompt: 'Com base na tabela "Fluxo Mensal" e na tendência de inadimplência, projete o fluxo ajustado ao risco para os próximos 6 meses. Qual o cenário base e pessimista?',
    },
    {
      label: 'Duration da carteira',
      fullPrompt: 'Calcule a duration ponderada da carteira com base na tabela "Fluxo Mensal". Qual o prazo médio de recebimento e a sensibilidade a mudanças na taxa de desconto?',
    },
  ],
};

/**
 * Retorna as sugestões específicas do indicador, ou sugestões genéricas caso
 * não exista uma entrada no mapa para o nome extraído do prompt.
 */
export function getIndicatorSuggestions(prompt: string): { label: string; fullPrompt: string }[] {
  // Extrai o nome do indicador/gráfico/tabela de prompts no formato:
  // 'Analise o indicador "Saldo Nominal" ...'
  // 'Analise o gráfico "Evolução do Saldo Devedor" ...'
  // 'Analise a tabela "Resumo por Empreendimento" ...'
  const match = prompt.match(/"([^"]+)"/);
  const name = match?.[1] ?? '';

  // Busca exata
  if (name && INDICATOR_SUGGESTIONS[name]) {
    return INDICATOR_SUGGESTIONS[name];
  }

  // Busca parcial (caso o título contenha texto adicional)
  if (name) {
    const normalizedName = name.toLowerCase();
    for (const [key, suggestions] of Object.entries(INDICATOR_SUGGESTIONS)) {
      if (normalizedName.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedName)) {
        return suggestions;
      }
    }
  }

  // Fallback genérico
  const displayName = name || 'este indicador';
  return [
    {
      label: `Qual a tendência de ${displayName}?`,
      fullPrompt: `Analise a tendência de "${displayName}" nos últimos meses com base no histórico. Está melhorando ou piorando? O que esperar nos próximos meses?`,
    },
    {
      label: `${displayName} está saudável?`,
      fullPrompt: `Compare "${displayName}" com benchmarks típicos do mercado de securitização imobiliária brasileiro (SBPE/MCMV). O valor atual está dentro do esperado?`,
    },
    {
      label: `O que impacta ${displayName}?`,
      fullPrompt: `Cruze "${displayName}" com os demais indicadores do dashboard. Quais indicadores têm correlação direta? Há divergências que mereçam atenção?`,
    },
    {
      label: 'Riscos relacionados',
      fullPrompt: `Quais os principais riscos e pontos de atenção que "${displayName}" revela para a carteira securitizada? Há ações recomendadas?`,
    },
  ];
}
