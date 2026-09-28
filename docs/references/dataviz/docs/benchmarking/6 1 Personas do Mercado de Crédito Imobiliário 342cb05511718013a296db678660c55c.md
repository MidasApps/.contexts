# 6.1 Personas do Mercado de Crédito Imobiliário

O ecossistema de crédito imobiliário brasileiro movimentou **R$ 312,4 bilhões em 2024** (SBPE + FGTS) e envolve pelo menos 12 personas distintas cuja coordenação determina a eficiência de toda a cadeia — da simulação de financiamento pelo corretor até a gestão de covenants de um CRI por um fundo imobiliário. O principal achado desta pesquisa é que **a fragmentação de informação entre camadas operacional, tática e estratégica** é o fator mais destrutivo de valor no setor: dados que uma persona gera rotineiramente são exatamente os que outra persona precisa, mas não recebe. Num mercado onde a Selic a **15% a.a.** pressiona margens e o funding via poupança encolhe (saída líquida de R$ 66,9 bilhões em 10 meses de 2025), a capacidade de integrar dados entre personas deixa de ser diferencial e torna-se condição de sobrevivência.

---

## 1. O arcabouço regulatório que molda todas as personas

Toda persona neste ecossistema opera sob um arcabouço regulatório denso. A **Resolução CMN 4.676/2018** é a norma-mãe: exige que bancos direcionem **65% dos depósitos de poupança** para crédito imobiliário, dos quais 80% em operações SFH (taxa máxima de 12% a.a. + TR, imóvel até R$ 1,5 milhão, subindo para R$ 2,25 milhões sob a Res. CMN 5.255/2025). O LTV máximo é **80%** (ou 90% com SAC/SACRE). A **Res. CMN 4.909/2021** tornou obrigatório o patrimônio de afetação para financiamento de produção a partir de 1/1/2023.

Na securitização, a **Resolução CVM 60/2021** consolidou todas as regras de CRI/CRA, exigindo regime fiduciário, agente fiduciário, rating obrigatório para ofertas ao público geral (atualização a cada 12 meses), e limite de **20% de concentração por devedor**. O mercado de CRI atingiu emissão recorde de **~R$ 50-58 bilhões em 2024**, com estoque de R$ 83 bilhões.

A **Lei 13.786/2018 (Lei do Distrato)** disciplinou rescisões: retenção de até **25%** sem patrimônio de afetação e **50%** com patrimônio de afetação. O **RET** oferece tributação unificada de **4%** sobre receita bruta (1% para MCMV Faixa 1). O **MCMV** opera via FGTS com taxas de 4% a 10,5% a.a. em quatro faixas de renda (até R$ 13.000/mês na Faixa 4, criada em abril 2025), e orçamento FGTS de **R$ 160,5 bilhões para 2026**.

---

## 2. Camada estratégica: quem decide o destino do capital

### CEO de incorporadora — o guardião do ciclo lançamento-entrega-caixa

O CEO pilota um ciclo de **24 a 48 meses** — da aquisição de terreno à geração de caixa via repasse. Seus KPIs centrais são **VSO (Vendas sobre Oferta)**, que sinaliza velocidade comercial (70-80% = forte; abaixo de 50% = alerta), **VGV lançado e vendido**, **queima de caixa trimestral** e **margem bruta por safra** (Cyrela opera em 32-35%, MRV em 29-31%). A linguagem é fluente em "exposição de caixa por SPE", "pipeline de lançamentos", "banco de terrenos em anos de supply" e "colheita de projetos".

As dores dominantes são **escassez de funding SBPE** (poupança em declínio estrutural), **gargalos de repasse** (a MRV reportou delta de 5.000 unidades entre produção e repasse por questões com a Caixa), e **pressão de custos** (INCC acumulado de 7,22%). O CEO consome prévias operacionais trimestrais, dados ABRAINC/ABECIP e dashboards internos de ERP (Sienge, TOTVS, SAP). Seu gap crítico é a **ausência de visão integrada em tempo real** da exposição de caixa consolidada entre todas as SPEs — informação que existe fragmentada em planilhas, ERPs e portais bancários.

**Perguntas típicas para IA:** "Qual a queima de caixa projetada para os próximos dois trimestres, considerando o pipeline de repasses?" / "Quais empreendimentos estão com margem bruta abaixo do estudo de viabilidade?" / "Qual o impacto na geração de caixa se o VSO cair 5 pontos percentuais?"

### CFO de incorporadora/securitizadora — o arquiteto financeiro sob pressão de covenants

O CFO gerencia a estrutura de capital de cada SPE e da entidade consolidada. Monitora **custo médio de funding** (CDI+spread, TR+taxa, IPCA+taxa), **PDD/PECLD** sob CPC 48/IFRS 9, **LTV**, **DSCR**, **dívida líquida/PL** (principal covenant reportado trimestralmente) e **receita reconhecida via POC**. Opera sob dupla complexidade contábil: o CPC 47/IFRS 15 gerou debate sobre reconhecimento de receita ao longo do tempo versus no ponto de entrega — a CVM permitiu continuidade do método POC via Ofício Circular 02/2018, mas exige controles internos robustos.

Seu vocabulário inclui "cessão fiduciária", "CCI", "securitização de lastro pulverizado", "debênture incentivada", "duration da dívida" e "AVP (Ajuste a Valor Presente)". A frustração central é a **transição de funding**: a participação da poupança caiu de 46% (2021) para 29% (2025) do funding total, forçando migração para CRI e debêntures a custos mais elevados.

Na securitizadora, o CFO também monitora **volume emitido**, **spread médio de securitização**, **receita de estruturação e administração**, **pipeline de operações** e **número de patrimônios separados ativos**. A volatilidade regulatória é uma dor aguda — as Resoluções CMN 5.118/2024 e 5.212/2025 restringiram emissões de CRI/CRA por empresas não-setoriais, e há risco de tributação de IR sobre CRI/CRA.

**Perguntas típicas para IA:** "Estamos em compliance com todos os covenants? Qual a folga em cada um?" / "Qual o spread de CRI que conseguiríamos hoje versus o custo do plano empresário?" / "Qual a projeção de PDD para o próximo trimestre com base no envelhecimento da carteira?"

### Diretor de FII de CRI/recebíveis — yield, duration e a angústia do P/VP

Gestores de fundos como **KNCR11** (R$ 7,8 bilhões, 515 mil cotistas, CDI+2,1-2,4%), **KNIP11** (R$ 7,3 bilhões, IPCA+), **KNSC11** e **IRDM11** vivem sob pressão de **dividend yield mensal** (9-14% a.a. em 2025), **P/VP** (preço/valor patrimonial), **duration média** e **concentração por devedor** (máximo típico de 5-6,5% do PL). Monitoram inadimplência **100% adimplente como meta** — qualquer Over 90 é sinal de alerta.

A defasagem de inflação é uma dor estrutural: CRIs indexados ao IPCA refletem inflação com **2 meses de lag**, causando volatilidade nos dividendos. O risco de pré-pagamento é permanente: devedores com dívida cara pré-pagam CRIs, forçando reinvestimento a taxas menores. Eventos de crédito como os casos **Gramado Parks** (impactando IRDM11), **irregularidades Virgo** (impactando CPTS11) e **fraude Galoppo** (impactando KNSC11) ilustram riscos reputacionais e financeiros reais.

O gap informacional mais crítico é a **ausência de plataforma padronizada** para comparar métricas de inadimplência, LTV, DSCR e covenants entre CRIs de diferentes securitizadoras. Cada relatório mensal vem em formato diferente, forçando consolidação manual.

**Perguntas típicas para IA:** "Quais CRIs da carteira têm DSCR abaixo de 1,2x?" / "Calcule o impacto no resultado/cota se o IPCA for 0,3% nos próximos 2 meses" / "Qual o risco de prepagamento da carteira no cenário de queda da Selic?"

### Diretor de crédito imobiliário de banco — entre o compulsório e a rentabilidade

O diretor de crédito imobiliário gerencia carteiras massivas — a **Caixa detém 68-75% do mercado** (~R$ 324 bilhões em originações em 2025), o **Itaú** tem 47% do mercado privado (carteira de R$ 137 bilhões), seguido por Bradesco e Santander (R$ 71,8 bilhões). Seus KPIs centrais são **volume de originação**, **inadimplência Over 90** (mínima histórica de 1,0% em 2024), **spread sobre funding**, **market share** e **cumprimento do direcionamento obrigatório** (65% da poupança para crédito imobiliário).

A transição para o **"Novo Modelo de Crédito Imobiliário"** (Res. CMN 5.255/2025) é a decisão estratégica mais relevante do momento: o direcionamento obrigatório subirá de 65% para 80% ao longo de 10 anos, com redução gradual do compulsório a zero e criação de DII (Depósito Interfinanceiro Imobiliário). A pressão de funding é existencial — a poupança representava 51% do funding em 2019, caiu para 29% em 2025, e o Selic a 15% eleva o custo de alternativas como LCI e LIG.

Um dado estratégico que norteia decisões: "**cliente com crédito imobiliário tem quase 70% mais produtos**" (dado Bradesco), o que posiciona o mortgage como produto-âncora de fidelização.

**Perguntas típicas para IA:** "Qual o volume de originação necessário para cumprir o direcionamento obrigatório no próximo trimestre?" / "Qual o roll rate da carteira SBPE vs. MCMV por safra?" / "Qual o custo de funding efetivo considerando poupança + LCI + LIG?"

---

## 3. Camada tática: onde a execução encontra a burocracia

### Gestor de crédito-obra — o intermediário entre canteiro e banco

Este gestor coordena o **Plano Empresário** — linha de crédito PJ que financia até **80-85% do custo direto de construção**, com carência durante a obra + 6-9 meses, taxas de 8-12% a.a. (SFH) e prazo total de até 120 meses. A liberação de parcelas ocorre **mensalmente**, condicionada a medição de avanço físico por engenheiro credenciado do banco, e depende de gatilhos mínimos: tipicamente **15-20% de obra executada e 30% de unidades vendidas** antes da primeira liberação.

Suas métricas centrais são **percentual de obra executada**, **desvio orçamentário**, **tempo médio de liberação de parcela** e **glosas** (deduções ou rejeições na medição). A frustração dominante é a **subjetividade e burocracia do processo de medição**: o ciclo mensal de documentação (PLS, FRE, relatório fotográfico), vistoria do engenheiro e aprovação é lento e sujeito a reprovações por erros formais. A Caixa opera através de GERICs regionais com interpretações variáveis das regras.

O gap informacional mais severo é a **ausência de dashboard unificado** mostrando status de todos os planos empresário, próximas medições, documentos pendentes e desembolsos esperados. Em uma incorporadora gerenciando 5-15+ obras simultâneas com bancos diferentes, a fragmentação gera cegueira operacional.

**Perguntas típicas para IA:** "Quais empreendimentos têm medição pendente este mês e qual a documentação faltante?" / "Qual o desvio entre o cronograma físico previsto e o realizado em cada obra?" / "Há alguma glosa recorrente que precisa de ação corretiva?"

### Gestor de repasse bancário — o gargalo da geração de caixa

O repasse é o momento em que o saldo devedor do cliente com a incorporadora é transferido para o banco. **É o evento que fecha o ciclo financeiro do empreendimento** e gera caixa. O processo envolve 11 etapas e leva em média **68 dias** (caso Trisul): pré-qualificação → análise de crédito → análise jurídica → avaliação do imóvel → contrato → registro em cartório → liberação de recursos.

Os KPIs essenciais são **taxa de conversão de repasse**, **tempo médio de repasse**, **backlog por etapa da esteira**, **taxa de reprovação de crédito** e **pró-soluto** (parcela não financiada pelo banco — quanto maior, maior o risco para a incorporadora). A frustração central são os **gargalos da Caixa**: processamento regional (cheques regionais), limitações orçamentárias sazonais, e o delta entre produção e repasse que consome capital de giro a custo de **CDI de 15%**. Quando o banco avalia o imóvel abaixo do preço contratual (divergência de avaliação), cria-se um gap de pró-soluto que pode inviabilizar a operação.

Este é o profissional cujo desempenho mais impacta diretamente os resultados reportados pelo CEO em teleconferências trimestrais.

**Perguntas típicas para IA:** "Quantas unidades estão no backlog de repasse e em qual etapa da esteira cada uma se encontra?" / "Qual banco está mais rápido nos últimos 3 meses?" / "Quais clientes têm risco elevado de reprovação de crédito?"

### Controller — a ponte entre dois mundos contábeis

O controller opera na intersecção de dois frameworks de provisão: **CMN 2.682/99** (modelo de perda incorrida, com classificações AA a H e provisões mecânicas: AA=0%, A=0,5%, B=1%, C=3%, D=10%, E=30%, F=50%, G=70%, H=100%) para demonstrações COSIF/BACEN, e **CPC 48/IFRS 9** (perda esperada em 3 estágios, com modelos de PD, LGD e EAD incorporando cenários macroeconômicos forward-looking) para consolidado IFRS.

Suas métricas centrais são **PDD/carteira total**, **custo de crédito líquido**, **distribuição por rating CMN 2.682**, **distribuição por estágio IFRS 9**, **índice de cobertura** e **RWA consumido** (ativos ponderados pelo risco para Basileia III). A dor mais aguda é a **complexidade da dupla estrutura**: manter dois frameworks produzindo números diferentes para a mesma carteira, sob escrutínio de auditores Big 4, inspetores do BACEN e analistas de mercado.

A conciliação contábil entre sistemas de crédito e contabilidade geral é frequentemente problemática — diferenças de timing, migrações de sistema e bookings de renegociação criam discrepâncias que geram achados de auditoria.

**Perguntas típicas para IA:** "Qual a provisão incremental se 5% da carteira Stage 1 migrar para Stage 2?" / "Existem diferenças de conciliação acima do threshold entre sistema de crédito e contábil?" / "Qual o impacto no resultado da atualização dos cenários macroeconômicos no ECL?"

### Gestor de carteira de securitizadora — o sentinela dos covenants

Este profissional monitora a saúde de dezenas de patrimônios separados simultaneamente. Suas métricas nucleares são **razão de PMT** (PMT da carteira cedida / PMT do CRI + despesas, covenant típico >110-120%), **razão de saldo** (VP da carteira de recebíveis / saldo devedor do CRI), **inadimplência por faixa de atraso** (Over 30/60/90), **curvas vintage**, **taxa de distrato** e **evolução física e financeira de obra** (para CRI pulverizado com obra em andamento).

A produção de relatórios mensais para investidores, agente fiduciário e CVM é uma tarefa pesada e recorrente. O desafio central é a **qualidade dos dados dos originadores**: incorporadoras podem fornecer dados incompletos ou atrasados sobre boletos, pagamentos e distratos, em formatos heterogêneos. Muitas securitizadoras ainda rastreiam covenants e aging em **planilhas Excel** — processo propenso a erros e consumidor de tempo.

A ausência de ferramentas de early warning é crítica: o gestor precisa de analytics preditivo para identificar carteiras em deterioração **antes** do breach de covenant, não depois.

**Perguntas típicas para IA:** "Quais operações têm razão de PMT abaixo de 115%?" / "Qual a curva vintage da carteira pulverizada do originador Y?" / "Projete a razão de saldo para os próximos 3 meses dada a tendência de inadimplência"

---

## 4. Camada operacional: o chão de fábrica do crédito

### Analista de crédito — volume contra rigor

O analista avalia risco do comprador na esteira de crédito: consulta SCR/SCPC/Serasa, verifica renda (máximo **30% de comprometimento**), analisa documentação (holerite, IRPF, extrato FGTS, certidões negativas, matrícula do imóvel), enquadra a operação (SFH, SFI, MCMV) e calcula CET. Utiliza sistemas como SICAQ (Caixa) e motores de crédito com application scoring e behavioral scoring. Salário médio de **R$ 3.985/mês**, com certificação ABECIP CA-300 (48 horas).

O gargalo mais frequente é **documentação incompleta** — matrícula desatualizada, IRPF inconsistente, certidões vencidas. A divergência de renda é especialmente problemática para autônomos. A complexidade regulatória entre MCMV e SBPE (regras, limites, subsídios e documentação diferentes) gera retrabalho quando parâmetros mudam mid-process. O gap crítico é a **ausência de verificação automática de renda via Open Banking** — hoje o processo depende de documentos físicos e consultas manuais.

### Analista de cobrança — a régua que protege a carteira

Opera uma **régua de cobrança** estruturada: D-5 (lembrete pré-vencimento) → D+1 (aviso) → D+5 → D+15 → D+30 (cobrança formal) → D+60 → D+90 (execução de garantia). A execução da alienação fiduciária segue a Lei 9.514/97: constituição em mora → notificação via cartório → prazo de **15-20 dias para purgação da mora** → consolidação da propriedade → leilão extrajudicial (1º a valor de mercado, 2º a mínimo 50% da avaliação). O STF confirmou a constitucionalidade da execução extrajudicial em outubro 2023 (RE 860.631).

Com inadimplência em mínima histórica de **1,0%** (2024), o foco é preventivo. Métricas centrais: **roll rates**, **cure rates**, **taxa de recuperação por bucket** e **taxa de sucesso de renegociações** após 6/12 meses. A dor principal é a **localização do mutuário** (dados cadastrais desatualizados) e a **lentidão do processo de consolidação** (4-6 meses, com risco de nulidade por defeitos procedimentais na notificação).

### Corretor imobiliário — a porta de entrada com visão limitada

O corretor é o primeiro ponto de contato do comprador e opera com ferramentas de simulação (Caixa, Itaú, Santander, Credihome/Kzas), CRMs (Kenlo, Construtor de Vendas, Vista) e WhatsApp como canal dominante de comunicação. Sua dor central é que **simulação não é aprovação** — o presidente da ANCCA alerta que "alguns corretores perdem vendas por erros na simulação". Entre a simulação e a análise formal, taxas mudam, dívidas ocultas aparecem no SCR, e o gap entre preço simulado e aprovação real pode destruir a venda.

O corretor não tem **nenhuma visibilidade em tempo real** sobre a esteira de crédito do banco após a submissão de documentos. A comissão depende de um processo de 30-90 dias que ele não controla. No segmento MCMV, "se o corretor não souber orientar sobre financiamento, pode arruinar o sonho daquela pessoa na hora do crédito" — exigindo conhecimento profundo de regras de FGTS, faixas de renda e subsídios que mudam frequentemente.

### Backoffice cartorário — o último gargalo analógico

O backoffice gerencia o registro de imóveis: submissão de contratos para prenotação (cartório tem **30 dias** para examinar e registrar), resolução de exigências via nota devolutiva, pagamento de ITBI, averbação de alienação fiduciária na matrícula. O **SREI (Sistema de Registro Eletrônico de Imóveis)**, gerido pelo ONR, oferece e-Protocolo, Matrícula Online e Pesquisa de Bens por CPF/CNPJ — mas a adoção é **heterogênea**: cartórios urbanos grandes são digitalizados, enquanto os menores ainda operam com papel.

O gargalo mais comum são as **exigências cartoriais**: documentação incompleta ou incorreta gera nota devolutiva que reinicia o prazo de 30 dias. Cada estado tem código de normas diferente para procedimentos registrais. A emissão do "termo de quitação" pelo banco para cancelamento de alienação fiduciária é notoriamente lenta. Custos de registro (**2-5% do valor do imóvel**) surpreendem compradores e podem atrasar o fechamento.

---

## 5. Onde a informação não flui e decisões erradas acontecem

A análise dos fluxos de informação revela **cinco rupturas críticas** que destroem valor no ecossistema:

**Corretor → Banco (caixa-preta da esteira de crédito).** Uma vez que os documentos são submetidos, o corretor entra em um vácuo informacional. Não sabe se a análise está parada por pendência documental, restrição cadastral ou fila interna. O cliente liga perguntando prazo, e o corretor não tem resposta. Isso gera ansiedade, perda de vendas e experiência negativa.

**Incorporadora → Banco (repasse como gargalo de caixa).** O gestor de repasse não tem visibilidade sobre as filas internas do banco. Cada banco tem sistemas, requisitos e tempos de processamento diferentes. Não existe plataforma padronizada. O resultado são R$ bilhões em capital de giro consumido a CDI de 15% enquanto o repasse demora.

**Originador → Securitizadora (dados de lastro heterogêneos).** A securitizadora precisa de dados granulares de boletos, pagamentos, distratos e vendas de cada incorporadora-originador. Cada originador envia em formato diferente, com atrasos e lacunas. O gestor de carteira da securitizadora gasta tempo excessivo em reconciliação manual em vez de análise de risco.

**Securitizadora → FII (formatos de relatório não-padronizados).** O diretor de FII que investe em 30-50 CRIs de diferentes securitizadoras recebe relatórios mensais em formatos diferentes, com métricas calculadas de formas distintas. A consolidação manual é onerosa e propensa a erros.

**Camada operacional → Camada estratégica (dados macro não chegam à linha de frente).** Enquanto ABECIP, CBIC e ABRAINC produzem dados excelentes (VSO, distrato/vendas em 10,5%, duração de estoque de 11,6 meses para MCMV), essa inteligência raramente chega ao corretor ou analista de crédito em formato acionável. O corretor que soubesse que taxas de distrato do segmento MAP estão em 10,5% ajustaria sua abordagem de qualificação.

---

## 6. Síntese de engenharia de contexto por persona

A tabela abaixo condensa, para cada persona, os elementos essenciais para injeção de contexto em agentes de IA conversacional:

### Personas estratégicas

| Dimensão | CEO Incorporadora | CFO Incorporadora/Securitizadora | Diretor FII CRI | Diretor Crédito Banco |
| --- | --- | --- | --- | --- |
| **Horizonte decisório** | 12-36 meses | Trimestral-anual | Semanal-mensal | Trimestral-anual |
| **KPIs nucleares** | VSO, VGV, queima de caixa, margem bruta por safra | Custo de funding, PDD/PECLD, DSCR, dívida líquida/PL | Dividend yield, P/VP, duration, Over 90, rating distribution | Originação, Over 90, spread, market share, direcionamento |
| **Dor #1** | Repasse lento destruindo geração de caixa | Dupla contabilidade CPC 47/48 + covenant pressure | Defasagem IPCA + eventos de crédito | Funding de poupança em declínio estrutural |
| **Gap crítico** | Visão consolidada de caixa entre SPEs | Modelo preditivo de PDD integrando macro + aging | Plataforma padronizada de métricas cross-CRI | Modelagem de impacto CMN 5.255 |
| **Jargão-chave** | VSO, banco de terrenos, safra, colheita | Cessão fiduciária, CCI, duration, AVP, POC | Lastro, over-collateral, monitoração especial | Direcionamento, compulsório, DII, carteira performing |

### Personas táticas

| Dimensão | Gestor Crédito-Obra | Gestor Repasse | Controller | Gestor Carteira Securitizadora |
| --- | --- | --- | --- | --- |
| **Horizonte decisório** | Mensal (por obra) | Semanal (por unidade) | Mensal-trimestral | Mensal (por patrimônio) |
| **KPIs nucleares** | % obra, desvio orçamentário, glosas, tempo liberação | Taxa conversão, tempo médio, backlog, pró-soluto | PDD/carteira, conciliação, rating CMN 2.682, estágios IFRS 9 | Razão PMT, razão saldo, Over 30/60/90, curva vintage |
| **Dor #1** | Subjetividade da medição bancária | Caixa-preta das esteiras bancárias | Duplo framework CMN 2.682 vs. IFRS 9 | Dados heterogêneos de originadores |
| **Gap crítico** | Dashboard unificado multi-obra/multi-banco | Previsão probabilidade aprovação crédito no ato da venda | Engine integrado PDD dual-framework | Early warning preditivo de covenant breach |
| **Tarefas recorrentes** | Documentação medição, coordenação engenheiro banco | Pipeline tracking, resolução pendências, alternativas crédito | Cálculo PDD, conciliação, submissão SCR/CADOC | Relatórios mensais CRI, monitoramento lastro, assembleias |

### Personas operacionais

| Dimensão | Analista Crédito | Analista Cobrança | Corretor | Backoffice Cartório |
| --- | --- | --- | --- | --- |
| **Horizonte decisório** | Por proposta (5-30 dias) | Por contrato (D+1 a D+90+) | Por lead (dias-semanas) | Por registro (15-30 dias) |
| **KPIs nucleares** | SLA análise, taxa aprovação, devoluções | Roll rates, cure rates, recuperação por bucket | Leads convertidos, simulações, deals fechados | Registros concluídos, exigências resolvidas, tempo cartório |
| **Dor #1** | Documentação incompleta | Localização mutuário + re-default renegociações | Simulação ≠ aprovação | Exigências cartoriais / nota devolutiva |
| **Gap crítico** | Verificação automática via Open Banking | Modelo preditivo pré-inadimplência | Visibilidade esteira de crédito em tempo real | Tracking automatizado status cartório |
| **Volume típico** | 10-30 propostas/semana | Centenas de contratos sob gestão | 5-20 leads ativos | 10-50 processos simultâneos |

---

## 7. Perguntas-tipo para calibração de agentes de IA

Para cada persona, as perguntas abaixo representam o tipo de interação que um sistema de analytics/IA deve estar preparado para responder com profundidade e precisão:

**CEO:** "Se a taxa de repasse cair 10%, qual o impacto na geração de caixa consolidada este trimestre?" — exige integração de dados de repasse, saldo devedor por SPE e projeção de fluxo.

**CFO:** "Qual o spread de CRI que conseguiríamos hoje versus o custo do plano empresário para o empreendimento X?" — exige acesso a curvas de mercado, custo vigente do plano empresário e estrutura de garantias.

**Diretor FII:** "Projete o dividend yield para 3 meses sob cenários de IPCA de 0,2%, 0,4% e 0,6%" — exige modelagem de fluxo de caixa da carteira de CRIs com diferentes indexadores e defasagens.

**Diretor Banco:** "Quanto preciso originar no próximo trimestre para cumprir o direcionamento obrigatório, dado o saldo de poupança projetado?" — exige simulação regulatória com dados de captação e carteira.

**Gestor Crédito-Obra:** "Quais obras não atingiram o gatilho de vendas mínimo e qual a exposição de capital próprio até a primeira liberação?" — exige dados cruzados de vendas + construção + contratos bancários.

**Gestor Carteira Securitizadora:** "Gere o relatório mensal do CRI série ABC com aging, razão de PMT, razão de saldo e evolução de obra" — exige consolidação automática de múltiplas fontes de dados em template padronizado.

**Analista Cobrança:** "Quais contratos têm maior probabilidade de migrar de Over 30 para Over 90 nos próximos 60 dias?" — exige modelo preditivo alimentado por behavioral scoring, dados cadastrais e variáveis macroeconômicas.

---

## Conclusão: da fragmentação à inteligência integrada

O ecossistema de crédito imobiliário brasileiro opera como uma cadeia de valor na qual **cada elo gera dados que o elo seguinte precisa mas não recebe em tempo hábil**. O corretor qualifica o cliente sem saber se o banco aprovará; o gestor de repasse gerencia pipelines sem visibilidade das esteiras bancárias; a securitizadora monitora covenants com dados defasados de originadores; o FII consolida relatórios heterogêneos manualmente.

Três insights emergem como prioridades para engenharia de contexto em agentes de IA:

Primeiro, **a linguagem varia radicalmente entre camadas**. O CEO fala em VSO e queima de caixa; o gestor de carteira fala em razão de PMT e curva vintage; o analista de cobrança fala em roll rates e purgação da mora. Um agente eficaz precisa transitar entre esses léxicos sem tradução empobrecida.

Segundo, **o valor máximo de um agente está nos cruzamentos entre personas**, não dentro de uma persona isolada. Conectar o dado de taxa de conversão de repasse (tático) com a projeção de geração de caixa (estratégico) e o status da esteira bancária (operacional) em uma única resposta contextualizada é o diferencial que nenhuma planilha entrega hoje.

Terceiro, **compliance regulatório é a trama que une todas as personas**. Da CMN 4.676 que define o funding, à CMN 2.682 que define a provisão, à CVM 60 que governa a securitização, à Lei 9.514 que estrutura a garantia — um agente que compreenda esse arcabouço pode antecipar impactos regulatórios que atravessam toda a cadeia, da originação ao investidor final de um FII.