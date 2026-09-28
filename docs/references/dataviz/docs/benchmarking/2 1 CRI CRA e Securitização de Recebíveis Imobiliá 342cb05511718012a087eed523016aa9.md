# 2.1 CRI/CRA e Securitização de Recebíveis Imobiliários

**O mercado brasileiro de Certificados de Recebíveis Imobiliários atingiu R$ 58,9 bilhões em emissões em 2024 — recorde absoluto — e acumula um estoque superior a R$ 240 bilhões, consolidando-se como a principal via de desintermediação do crédito imobiliário no país.** A combinação de isenção fiscal para pessoa física, declínio estrutural da poupança como fonte de funding (de 39% para 32% entre 2022 e 2024) e a sofisticação regulatória trazida pela Lei 14.430/2022 criou um ciclo virtuoso que multiplicou por seis o volume anual de emissões em menos de uma década. Em 2025, mesmo com Selic a 14,75%, o mercado sustentou cerca de R$ 50,8 bilhões em emissões — o segundo maior volume da história — enquanto a base de investidores pessoa física alcançou 584 mil brasileiros com R$ 85,5 bilhões aplicados diretamente em CRI, crescimento de **250% em três anos**. Este relatório cobre o fluxo completo de securitização, tipos de estrutura, dados de mercado, análise de ciclo, regulação, monitoramento pós-emissão e um glossário técnico para sistemas de IA conversacional.

---

## 1. O fluxo completo de securitização: da originação ao monitoramento

O processo de securitização imobiliária no Brasil segue sete etapas encadeadas, envolvendo pelo menos dez agentes especializados. Cada etapa adiciona camadas de governança, segregação patrimonial e transparência que diferenciam o CRI de um simples instrumento de dívida.

### Originação e cessão dos recebíveis

A cadeia começa com o **originador** — incorporadora, banco, loteadora, fintech ou proprietário de imóvel comercial — que gera créditos imobiliários a partir de contratos de compra e venda, financiamentos habitacionais, locações atípicas ou built-to-suit. Os créditos elegíveis devem estar performados (com parcelas vincendas), formalizados em contratos sem vícios e, idealmente, com histórico mínimo de seis meses de pagamento (*seasoning*). A incorporadora que vende 200 unidades residenciais em parcelas de 36 meses, por exemplo, acumula uma carteira de recebíveis que pode ser cedida à securitizadora.

A cessão ocorre tipicamente por meio de **Cédulas de Crédito Imobiliário (CCI)**, títulos representativos criados pela Lei 10.931/2004, que dispensam a averbação individual no Registro de Imóveis ao serem custodiadas em forma escritural junto a instituição autorizada. A transferência pode ser **cessão plena** (*true sale*), retirando os ativos do balanço do originador, ou **cessão fiduciária**, em que os créditos servem como garantia. O preço de cessão embute um deságio que reflete a qualidade da carteira, o prazo dos recebíveis e as condições de mercado — tipicamente entre 2,5% e 4% do valor da operação em custos diretos, além do spread implícito.

### Estruturação, emissão e distribuição

A **securitizadora** (companhia securitizadora, obrigatoriamente uma S.A. não financeira registrada na CVM) adquire os recebíveis e constitui um **patrimônio separado** sob regime fiduciário, isolando os ativos de seu próprio balanço e de qualquer credor — inclusive trabalhista, fiscal e previdenciário, conforme art. 27, §5º da Lei 14.430/2022. O documento-chave é o **Termo de Securitização**, que especifica os créditos cedidos, a remuneração dos investidores, as garantias, os *triggers*, o *waterfall* de pagamentos e as condições de liquidação.

A emissão propriamente dita ocorre com o registro dos CRI na **B3** para custódia, liquidação e negociação. A distribuição pode seguir três modalidades: oferta pública ampla (Resolução CVM 160, para qualquer investidor), oferta restrita a investidores profissionais, ou colocação privada sem registro. O **coordenador líder** — tipicamente Itaú BBA, BTG Pactual, XP ou Santander — conduz o *bookbuilding*, organiza *roadshows* e assegura o tratamento equitativo dos investidores.

### Papéis de cada agente no ecossistema

O **agente fiduciário** (*trustee*) — predominantemente Oliveira Trust, com **56% a 80%** do mercado, seguido por Pentágono e Vórtx — representa os investidores, monitora o cumprimento do Termo de Securitização e possui *step-in right* para assumir a administração do patrimônio separado em caso de falência da securitizadora (art. 39, CVM 60). A **agência de rating** (Fitch, S&P, Moody's, Austin) avalia e classifica as séries com base na qualidade do lastro e nas estruturas de reforço de crédito. O **custodiante** guarda a documentação das CCI e verifica seus requisitos formais. O **auditor independente** certifica as demonstrações financeiras do patrimônio separado. O **servicer** administra a cobrança junto aos devedores finais e pode substituir o originador caso este se torne inadimplente em suas obrigações de servicing. Finalmente, o **investidor** — pessoa física (com isenção de IR), fundo imobiliário (FII), fundo de pensão, seguradora ou *family office* — adquire os CRI e recebe os fluxos periódicos de juros e amortização.

---

## 2. Arquitetura das estruturas: do pulverizado ao corporativo

### Subordinação, *overcollateralization* e fundo de reserva

A estrutura **sênior/subordinada** é o mecanismo de *credit enhancement* mais utilizado no mercado brasileiro. A emissão se divide em tranches: a **sênior** tem prioridade no *waterfall* de pagamentos e é protegida pela absorção de perdas pelas tranches inferiores; a **mezanino** ocupa posição intermediária; a **subordinada** (ou júnior) absorve as primeiras perdas e é frequentemente retida pelo originador como *skin in the game*. Níveis típicos de subordinação variam de **10% a 30%+** dependendo da qualidade do lastro — quanto maior a subordinação, mais elevado o rating da tranche sênior e menor o custo de captação.

O *waterfall* mensal segue a sequência: (1) despesas do patrimônio separado → (2) juros e amortização sênior → (3) juros e amortização mezanino → (4) juros e amortização subordinada → (5) excedente ao originador ou reinvestido. O **excess spread** — diferença entre o rendimento da carteira de lastro e o custo total do CRI — funciona como primeira linha de defesa contra perdas, podendo ser usado para recompor a **sobrecolateralização** (*overcollateralization*), alimentar o **fundo de reserva** ou, após todos os alvos atingidos, ser distribuído à tranche júnior.

O fundo de reserva constitui uma conta segregada em investimentos líquidos de baixo risco, dimensionada para cobrir de **3 a 12 meses** de serviço da dívida. A sobrecolateralização exige que o valor de face dos recebíveis exceda o valor do CRI emitido — por exemplo, R$ 110 milhões em lastro para R$ 100 milhões em CRI.

### Pulverizado versus corporativo

O **CRI pulverizado** é lastreado em centenas ou milhares de recebíveis de devedores individuais (compradores de imóveis residenciais, lotes etc.), com risco de concentração baixo mas complexidade operacional elevada — exige modelagem estatística de perdas, monitoramento diário de inadimplência e reconciliação constante. Em contrapartida, o **CRI corporativo** concentra o risco em um ou poucos devedores de grande porte, com análise focada no balanço da empresa devedora. Subcategorias corporativas incluem *built-to-suit* (locação de longo prazo), *sale and leaseback* (desimobilização patrimonial) e dívida corporativa imobiliária. Em dados históricos, apenas **17,4% das emissões** eram pulverizadas, mas estas ofereciam spreads significativamente mais altos (IPCA+12% vs. IPCA+7,3% para concentrados), sugerindo um prêmio por assimetria informacional.

### *Revolving*, *bullet* e amortização programada

A **revolvência** — permitida para CRI desde a Resolução CVM 194/2023, que revogou a proibição anterior — possibilita a substituição de recebíveis vencidos por novos créditos elegíveis, permitindo que a maturidade do CRI exceda a vida média dos recebíveis individuais. A estrutura **bullet** paga apenas juros periódicos com devolução integral do principal no vencimento, enquanto a **amortização programada** (tipicamente SAC) distribui o principal em parcelas periódicas, reduzindo a *duration* e o risco de crédito ao longo do tempo. Estruturas **soft bullet com *triggers*** combinam ambas: programadas como bullet, mas com gatilhos que forçam amortização antecipada se indicadores como DSCR ou LTV ultrapassarem limites contratuais.

---

## 3. Dados de mercado: a trajetória de crescimento e concentração

### Volume de emissão e estoque em série histórica

| Ano | Emissão (R$ bi) | Variação a/a | Destaque |
| --- | --- | --- | --- |
| 2016 | 17,8 | — | Recorde à época |
| 2019 | 21,7 | +138% vs. 2018 | Recuperação pós-crise |
| 2022 | 48,1–51,4 | ~+100% | Primeiro boom |
| 2023 | 47,6 | -7% | Base elevada |
| **2024** | **58,9** | **+23,4%** | **Recorde absoluto** |
| 2025 | ~50,8 | -11,5% | Segundo maior da história |

O estoque de CRI em circulação cresceu de aproximadamente R$ 199 bilhões (meados de 2023) para **R$ 240 bilhões** (meados de 2025), representando **9% da estrutura total de funding imobiliário** (R$ 2,41 trilhões em 2024, conforme Abecip). A participação da poupança caiu estruturalmente de 39% para 32% no mesmo período, consolidando o CRI como segunda maior fonte de recursos para o setor.

### Concentração: Opea domina após aquisição da True

O mercado de securitizadoras é altamente concentrado. Em 2023, as três maiores — **Opea (41%), True (28%) e Virgo (8,5%)** — respondiam por **77% do volume** de emissão de CRI. Em 2024, a Opea adquiriu a True Securitizadora e a servicer Maximus, criando um conglomerado com **R$ 330 bilhões em ativos sob gestão**, responsável por aproximadamente 60% dos CRI e 40% dos CRA emitidos pro forma. A Opea, controlada pela gestora americana Jaguar Growth Partners, liderou o ranking em **8 dos 10 semestres** entre 2020 e 2024. Os agentes fiduciários são ainda mais concentrados: Oliveira Trust, Pentágono e Vórtx somam **94% a 99%** do mercado.

### Indexadores: IPCA domina, CDI ganha relevância em Selic alta

Cerca de **75% dos CRI** utilizam remuneração atrelada ao **IPCA+**, dominando especialmente os prazos longos. O CDI responde pela parcela de prazos mais curtos e ganha atratividade em ambientes de Selic elevada. O IGP-M perdeu participação significativa nos últimos anos. A TR ficou praticamente restrita a operações internas/cedente-investidor. Em portfólios típicos de FII de recebíveis, a composição observada é aproximadamente 89% IPCA, 7% CDI e 3% IGP-M.

### Spreads: compressão seguida de normalização

Os spreads praticados variam amplamente conforme o perfil de risco:

- **High grade (AAA/AA):** IPCA + 5% a 7% a.a. ou CDI + 1% a 2%
- **Mid grade:** IPCA + 8% a 11% ou CDI + 2% a 3%
- **High yield (desenvolvimento):** IPCA + 12% a 15%+ a.a.

Ao longo de 2024, a elevada demanda por títulos isentos de IR comprimiu significativamente os prêmios, com casos extremos de spreads negativos em debêntures incentivadas. Em 2025-2026, analistas da Sparta e outras gestoras descrevem um ambiente de **normalização**, com spreads voltando a refletir fundamentos de crédito em vez de apenas fluxo.

### Inadimplência: dobrou em 2024 mas permanece controlada

Entre abril e dezembro de 2024, foram registrados **58 defaults** de CRI — o dobro do mesmo período de 2023. Em janeiro de 2025, houve mais 10 novos defaults (+20% a/a). CRI em default representam cerca de **2% a 4,75%** do estoque total, concentrados em **CRI de desenvolvimento** emitidos entre 2021 e 2023. Metade dos CRI inadimplentes em 2024 estava alocada em fundos imobiliários. A inadimplência do crédito imobiliário geral (Abecip) atingiu o menor nível histórico de **1%** em 2024, mas o segmento de CRI estruturados apresenta risco mais elevado dada a natureza das operações de desenvolvimento.

---

## 4. Quando a securitização faz mais sentido: ciclo, Selic e estratégia

### O paradoxo da Selic alta

A securitização imobiliária prospera paradoxalmente em ambientes de juros elevados. Do lado da **demanda**, investidores pessoa física buscam CRI por sua isenção fiscal — com Selic a 15%, um CRI pós-fixado pagando 100% do CDI equivale a aproximadamente 125-130% do CDI em termos brutos para um investidor tributado. Do lado da **oferta**, a Selic alta encarece e restringe o crédito bancário (a Abecip projetou queda de 10% no crédito hipotecário em 2025), forçando incorporadoras a buscar o mercado de capitais. O equilíbrio entre estas pressões determina os spreads praticados.

### Qualidade da carteira como determinante de preço

A precificação na cessão de recebíveis é função direta de cinco variáveis críticas. **LTV abaixo de 55%** (média observada em fundos como CVBI11) reduz o risco de perda dado o default. **Seasoning de 6+ meses** demonstra performance e comprime spreads em 100 a 200 bps comparado a carteiras recém-originadas. **Inadimplência D90 inferior a 1%** sinaliza qualidade de crédito; carteiras com D90 acima de 9% (como observado no BARI11) exigem prêmios significativamente maiores. **Subordinação de 15% a 20%** protege a tranche sênior e viabiliza rating *investment grade*. Perfil de devedor diversificado (pessoa física residencial) também favorece a precificação versus concentração corporativa.

### Originação direta: a vantagem competitiva emergente

A tendência mais relevante no mercado é a migração de um modelo de cessão de carteira (originador → securitizadora) para **originação direta** por securitizadoras e gestoras de FII. Gestoras como VBI, Kinea, Vectis e Cy Capital participam ativamente da estruturação desde a concessão do crédito, obtendo melhor controle sobre critérios de elegibilidade, garantias e preço. A Opea executou 179 operações em 2024, levantando R$ 28,1 bilhões. Esta verticalização elimina margens de intermediação e permite acesso antecipado a ativos de alta qualidade.

### FIIs como motor de demanda estrutural

Os fundos imobiliários de recebíveis (FII de papel) constituem o **maior bloco institucional comprador** de CRI. São aproximadamente 210 FIIs de papel listados na B3, com patrimônio de cerca de R$ 210 bilhões. Em 2024, **2,677 milhões** de investidores individuais estavam posicionados em FII, com 76,2% no varejo. Fundos *high-grade* como KNIP11 e KNCR11 buscam CRI AAA com IPCA+8-10%, enquanto fundos *high yield* como HCTR11 aceitam spreads de IPCA+12-15%+ com risco elevado. Em 2025, vários FII de papel acumularam retornos totais superiores a 25%, beneficiados pelo carrego elevado e pela marcação a mercado favorável quando as curvas de juros fecharam.

---

## 5. Arcabouço regulatório: do marco legal à tributação

### Lei 14.430/2022: o marco que unificou o mercado

A Lei 14.430/2022, oriunda da conversão da MP 1.103/2022, representa a maior modernização regulatória do setor. Ela introduziu a **primeira definição legal de securitização** no Brasil (art. 18), unificou o tratamento dos Certificados de Recebíveis (antes disperso entre CRI e CRA), expandiu o regime fiduciário para qualquer operação de securitização, autorizou a **dação em pagamento** (transferência de créditos como quitação) e abriu caminho para estruturas de revolvência. O art. 27, §5º estabeleceu que o patrimônio separado não responde por **nenhuma dívida** da securitizadora — nem fiscal, trabalhista ou previdenciária — consolidando a *bankruptcy remoteness* como princípio legal robusto.

### Resolução CVM 60: governança e categorias de registro

A Resolução CVM 60/2021 (efetiva em maio de 2022, alterada pela CVM 194/2023) criou duas categorias de registro para securitizadoras. **S1** permite emissão exclusivamente com regime fiduciário; **S2** permite emissões com ou sem regime fiduciário, com exigências de governança mais elevadas. Ambas requerem no mínimo três diretores estatutários (securitização, compliance, distribuição). A norma impõe limites de concentração de **20% por devedor/coobrigado** (exceto para companhias abertas, instituições financeiras ou empresas auditadas), segregação de contas bancárias por emissão e atualização de rating a cada 12 meses.

A Resolução CVM 194/2023 trouxe mudanças transformadoras: **permitiu a revolvência para CRI** (antes expressamente vedada), regulamentou limites de concentração para todas as operações e simplificou convocações de assembleias. A Resolução CVM 160/2022 unificou o regime de ofertas públicas com rito automático (sem análise prévia da CVM) e rito ordinário, eliminando o antigo modelo de oferta restrita (ICVM 476) com seus limites de investidores e *lock-up*.

### CMN 5.118/2024: restrição de lastro e nexo setorial

A Resolução CMN 5.118 (fevereiro de 2024) representou a mudança regulatória mais impactante para o mercado em operação. **Proibiu** CRI lastreado em dívida cujo emissor/devedor/garantidor seja instituição financeira ou companhia aberta com receita preponderante (>2/3) fora do setor imobiliário. Vetou ainda CRI de "reembolso de despesas" e operações entre partes relacionadas. A Resolução CMN 5.121 (março de 2024) suavizou parcialmente a restrição ao excluir contratos comerciais (duplicatas, locação, compra e venda, usufruto) do conceito de "instrumento de dívida". Em maio de 2025, a CMN 5.212 estendeu as restrições a **todas as pessoas jurídicas** (não apenas companhias abertas).

### Tributação: isenção preservada para pessoa física

A isenção de IR sobre rendimentos de CRI para pessoa física, estabelecida pelo art. 3º, II da Lei 11.033/2004, **permanece integralmente vigente** em abril de 2026. A MP 1.303/2025, que propunha alíquota de 5% sobre CRI, CRA e debêntures incentivadas, **caducou** em outubro de 2025 sem aprovação. Para **pessoa jurídica**, os rendimentos seguem a tabela regressiva: 22,5% (até 180 dias), 20% (181-360 dias), 17,5% (361-720 dias) e 15% (acima de 720 dias). CRI também é isento de IOF. Não possui cobertura do FGC.

---

## 6. Monitoramento pós-emissão: indicadores, *triggers* e mercado secundário

### O relatório do agente fiduciário e os indicadores-chave

O agente fiduciário produz relatório anual obrigatório (CVM 17/21) e relatórios mensais de acompanhamento, divulgados via sistema FNET da B3. O conteúdo típico inclui status de pagamentos, situação das garantias, saldos do fundo de reserva, eventos materiais e análise de indicadores financeiros e de crédito.

Os indicadores monitorados formam um painel multidimensional de risco:

- **Inadimplência por faixa de atraso** (Over 30, Over 60, Over 90): a classificação D90 é o limiar de default em grande parte dos Termos de Securitização e alinha-se com padrões regulatórios de provisionamento
- **Razão de Garantia**: medida em duas dimensões — **Razão de PMT** (fluxo dos recebíveis ÷ serviço da dívida do CRI) e **Razão de Saldo** (valor presente dos recebíveis ÷ saldo devedor do CRI), com alvos contratuais tipicamente acima de **140%**
- **LTV Dinâmico**: atualizado periodicamente com base em avaliações de imóveis versus saldos devedores, crucial para estimar recuperação em caso de execução da alienação fiduciária
- **DSCR** (*Debt Service Coverage Ratio*): fluxo de caixa disponível ÷ serviço total da dívida, tipicamente ≥ 1,2x a 1,5x conforme o perfil da operação
- **PDD** (*Provisão para Devedores Duvidosos*): calculada por modelos de *aging*, com provisionamento progressivo de 0% (adimplente) até 100% (acima de 180 dias), seguindo CPC 48
- **CPR** (*Conditional Prepayment Rate*): taxa de pré-pagamento que afeta a *weighted average life* e o perfil de rendimento do CRI
- **Curvas Vintage**: acompanham a performance de inadimplência por safra de originação, permitindo detectar deterioração em coortes específicas e calibrar modelos de perda esperada

Para CRI pulverizados, monitoram-se adicionalmente a evolução de obras (progresso físico e financeiro), velocidade de vendas, taxa de distratos e condições mercadológicas regionais.

### Eventos de aceleração e liquidação antecipada

Os Termos de Securitização distinguem dois tipos de eventos de vencimento antecipado. Os **automáticos** — falência/recuperação judicial, não pagamento pela securitizadora em 2 dias úteis, declaração falsa material, perda do regime fiduciário — disparam aceleração imediata sem assembleia. Os **não automáticos** — quebra de covenants financeiros, deterioração de garantias, mudança de controle, rebaixamento de rating — exigem convocação de assembleia de investidores, que delibera entre acelerar, conceder *waiver* ou negociar reestruturação.

Quando a Razão de Garantia cai abaixo do limiar contratual, dispara-se uma **Recompra Compulsória Parcial** pelo cedente e subsequente **Amortização Extraordinária Compulsória**. Em caso de insuficiência irreversível do patrimônio separado, o agente fiduciário assume a administração, executa garantias (alienação fiduciária, fiança, cessão fiduciária) e distribui pro rata os recursos recuperados aos investidores, podendo transferir os próprios recebíveis remanescentes via dação em pagamento.

### Precificação no mercado secundário

O mercado secundário de CRI tem **liquidez historicamente limitada**, embora em melhoria acelerada. A plataforma **Trademate** da B3, que incorporou CRI em outubro de 2024, registrou salto no volume de títulos privados de R$ 184 bilhões (2024) para **R$ 1,3 trilhão** (2025). A ANBIMA é a principal fonte de **marcação a mercado**, utilizando metodologia que combina indicações de compra/venda de instituições contribuidoras com negociações reais registradas no sistema REUNE. A fórmula ponderada é:

**Taxa Indicativa = 0,50 × MC + 0,35 × MR(d0) + 0,10 × MR(d-1) + 0,05 × MR(d-2)**

onde MC = média da coleta e MR = média ponderada de negócios registrados. Para CRI IPCA+, o spread é calculado sobre a NTN-B de *duration* mais próxima; para CDI, sobre o DI em base 252 dias úteis. A **duration** típica de portfólios de FII de CRI é de aproximadamente 4 anos. Desde janeiro de 2023, o Código de Distribuição da ANBIMA exige marcação a mercado nos extratos de clientes para CRI, CRA e debêntures, aumentando a transparência. CRI sem negociação no secundário são precificados na curva de emissão com ajustes periódicos de spread de crédito pelo administrador.

---

## 7. Glossário técnico para sistemas de IA conversacional

Este glossário foi elaborado para alimentar agentes de IA que operam em plataformas de analytics voltadas a securitizadoras, incorporadoras, bancos e fundos imobiliários. Cada verbete inclui definição, contexto de uso e, quando aplicável, fórmula ou referência regulatória.

**Alienação Fiduciária de Imóvel** — Garantia real em que a propriedade resolúvel do imóvel é transferida ao credor até a quitação integral da dívida. Em caso de inadimplência, permite execução extrajudicial célere (Lei 9.514/1997, arts. 22+). Principal mecanismo de recuperação de crédito em CRI residencial.

**Amortização Extraordinária Compulsória** — Resgate antecipado parcial do CRI acionado quando a Razão de Garantia cai abaixo do limiar contratual, financiado pela Recompra Compulsória Parcial de recebíveis pelo cedente.

**ANBIMA** — Associação Brasileira das Entidades dos Mercados Financeiro e de Capitais. Responsável pela autorregulação, precificação de CRI/CRA no mercado secundário e publicação de boletins de securitização.

**CCI (Cédula de Crédito Imobiliário)** — Título representativo de crédito imobiliário (Lei 10.931/2004) utilizado como veículo para cessão dos recebíveis à securitizadora. Pode ser integral ou fracionária, escritural ou cartular.

**CDI (Certificado de Depósito Interbancário)** — Taxa de referência do mercado interbancário brasileiro (base 252 dias úteis). CRI pós-fixados remuneram como CDI + spread ou % do CDI.

**Cedente** — O originador que transfere (cede) os créditos imobiliários à securitizadora. Pode ser incorporadora, banco, loteadora, fintech ou proprietário de imóvel.

**Cessão Fiduciária de Recebíveis** — Garantia em que os fluxos de recebíveis são direcionados a conta vinculada (*escrow*) controlada pela securitizadora ou agente fiduciário.

**Companhia Securitizadora** — Sociedade anônima não financeira, registrada na CVM (categoria S1 ou S2), com objeto social de adquirir créditos e emitir Certificados de Recebíveis.

**Coobrigação** — Mecanismo em que o originador retém obrigação solidária de cobrir perdas, alinhando seus interesses aos dos investidores. Uma das formas mais comuns de retenção de risco no Brasil.

**CPR (Conditional Prepayment Rate)** — Taxa condicional de pré-pagamento. Mede o percentual da carteira de lastro que é quitado antecipadamente. Fórmula simplificada: CPR = 1 − (1 − SMM)^12, onde SMM = *Single Monthly Mortality*.

**Credit Enhancement** — Conjunto de mecanismos que melhoram a qualidade de crédito do CRI: subordinação, sobrecolateralização, fundo de reserva, excess spread, coobrigação, fiança, seguro de crédito.

**CRI (Certificado de Recebíveis Imobiliários)** — Título de crédito nominativo, escritural, de emissão exclusiva de companhias securitizadoras, lastreado em créditos imobiliários. Constitui título executivo extrajudicial. Definido na Lei 14.430/2022, art. 20.

**CRI Corporativo** — CRI cujo risco está concentrado em um ou poucos devedores corporativos. Subtipos: built-to-suit, sale & leaseback, dívida corporativa, locação atípica.

**CRI Pulverizado** — CRI lastreado em grande número de recebíveis individuais (centenas/milhares de devedores). Menor risco de concentração, maior complexidade operacional.

**Curva Vintage** — Gráfico que acompanha a inadimplência acumulada por safra (coorte) de originação ao longo do tempo. Permite identificar quais períodos de originação geraram carteiras de melhor ou pior qualidade.

**Dação em Pagamento** — Quitação de obrigação mediante transferência dos próprios créditos/ativos subjacentes ao investidor (Lei 14.430/2022, art. 20). Mecanismo de liquidação simplificada.

**DSCR (Debt Service Coverage Ratio)** — Índice de Cobertura do Serviço da Dívida. Fórmula: DSCR = Fluxo de Caixa Disponível ÷ Serviço Total da Dívida. Valores típicos de covenant: ≥ 1,2x a 1,5x.

**Duration** — Prazo médio ponderado dos fluxos de caixa do CRI. Mede a sensibilidade do preço a variações na taxa de juros. Duration de Macaulay e Duration Modificada são as métricas padrão.

**Evento de Vencimento Antecipado** — Gatilho contratual que pode acelerar o vencimento integral do CRI. Divide-se em automático (disparo imediato) e não automático (requer assembleia).

**Excess Spread** — Diferença entre o rendimento dos recebíveis de lastro e o custo total do CRI (remuneração + despesas). Primeira barreira contra perdas; excedente pode reforçar sobrecolateralização ou fundo de reserva.

**FII de Papel (FII de Recebíveis)** — Fundo imobiliário listado na B3 que investe predominantemente em CRI e outros títulos de crédito imobiliário. Principal veículo institucional de demanda por CRI.

**Fundo de Reserva** — Conta segregada em investimentos líquidos para cobrir insuficiências temporárias no serviço da dívida. Dimensionado em meses de cobertura (tipicamente 3-12).

**IGP-M** — Índice Geral de Preços – Mercado (FGV). Indexador em declínio nos CRI; substituído progressivamente pelo IPCA.

**IPCA** — Índice Nacional de Preços ao Consumidor Amplo (IBGE). Indexador dominante em CRI (~75% das emissões).

**Lei 14.430/2022** — Marco Legal da Securitização. Unificou o tratamento de CRI e CRA, definiu securitização, expandiu regime fiduciário e permitiu revolvência.

**LTV (Loan-to-Value)** — Razão entre o saldo devedor do crédito e o valor de mercado/avaliação do imóvel dado em garantia. Fórmula: LTV = Saldo Devedor ÷ Valor do Imóvel. LTV dinâmico é recalculado periodicamente.

**Marcação a Mercado (MtM)** — Precificação de CRI pelo valor justo de mercado (em vez do custo de aquisição). Obrigatória em extratos de clientes desde janeiro de 2023 (ANBIMA) e diariamente em carteiras de fundos.

**Overcollateralization (Sobrecolateralização)** — Excesso de valor do lastro em relação ao CRI emitido. Exemplo: R$ 110M em recebíveis para R$ 100M em CRI = 10% de sobrecolateralização.

**Over 30 / Over 60 / Over 90** — Métricas de inadimplência que medem o percentual (ou valor) dos recebíveis com atraso superior a 30, 60 ou 90 dias respectivamente. Over 90 é o limiar de default padrão.

**Patrimônio Separado** — Conjunto de créditos e garantias afetados a uma emissão específica de CRI sob regime fiduciário, segregado do patrimônio geral da securitizadora. Não responde por dívidas da securitizadora (art. 27, Lei 14.430).

**PDD (Provisão para Devedores Duvidosos)** — Provisão contábil para perdas esperadas de crédito, calculada por modelos de *aging* conforme CPC 48. Provisionamento de 0% (adimplente) a 100% (>180 dias).

**PMT Ratio (Razão de PMT)** — PMT dos recebíveis cedidos ÷ (PMT do CRI + despesas operacionais). Deve exceder limiares contratuais (tipicamente > 1,0x).

**Razão de Garantia** — Indicador que compara o valor dos recebíveis/garantias com o saldo do CRI. Inclui Razão de PMT (fluxo) e Razão de Saldo (estoque). Queda abaixo do mínimo dispara Amortização Extraordinária Compulsória.

**Regime Fiduciário** — Regime jurídico que cria o patrimônio separado, instituído por declaração unilateral no Termo de Securitização (art. 25-30, Lei 14.430). Obrigatório para securitizadoras S1 em ofertas públicas.

**Resolução CMN 5.118/2024** — Restringiu lastros elegíveis para CRI: exige nexo setorial (>2/3 da receita em atividade imobiliária), proíbe reembolso de despesas e operações entre partes relacionadas.

**Resolução CVM 60** — Norma principal de registro e funcionamento das securitizadoras (S1/S2), governança, limites de concentração e obrigações contínuas.

**Resolução CVM 160** — Regime unificado de ofertas públicas: rito automático (sem análise prévia da CVM) e rito ordinário.

**Resolução CVM 194** — Alterou CVM 60: permitiu revolvência para CRI, criou limites de concentração de 20%, exigiu registro do Termo de Securitização no RGI.

**Revolvência** — Substituição de recebíveis amortizados por novos créditos elegíveis dentro da mesma emissão. Permite maturidade do CRI superior à vida dos recebíveis individuais (CVM 194, art. 43-B).

**Seasoning** — Tempo decorrido desde a originação do crédito. Carteiras com 6+ meses de seasoning demonstram performance e reduzem spreads na cessão.

**Servicer** — Agente responsável pela cobrança e administração dos recebíveis junto aos devedores finais. Pode ser o próprio originador ou terceiro especializado.

**Skin in the Game** — Retenção de risco pelo originador, tipicamente via aquisição/retenção da tranche subordinada.

**Spread** — Prêmio de risco sobre o benchmark (CDI, IPCA ou NTN-B). Para CRI IPCA+, calculado sobre a NTN-B de duration equivalente. Exemplo: IPCA + 8% a.a. implica spread de ~1-2% sobre NTN-B.

**Step-in Right** — Direito do agente fiduciário de assumir a administração do patrimônio separado em caso de insolvência da securitizadora (CVM 60, art. 39).

**Subordinação** — Estrutura de tranches onde a tranche júnior absorve primeiras perdas, protegendo a sênior. Níveis típicos: 10-30%.

**Termo de Securitização** — Documento-base que formaliza a emissão de CRI: descreve créditos cedidos, remuneração, garantias, triggers, waterfall, regime fiduciário e condições de liquidação.

**TR (Taxa Referencial)** — Indexador historicamente utilizado em financiamentos habitacionais do SFH. Participação residual e decrescente em CRI de mercado.

**True Sale** — Cessão definitiva (*plena*) dos recebíveis, retirando-os do balanço do originador e transferindo o risco de crédito ao patrimônio separado.

**Waterfall (Cascata de Pagamentos)** — Ordem de prioridade na distribuição dos fluxos: despesas → sênior → mezanino → subordinada → excedente.

**Yield to Maturity (YTM)** — Taxa interna de retorno que equaliza o preço de mercado do CRI ao valor presente de todos os fluxos futuros. Expressa como TIR em % a.a. (base 252 dias úteis).

**Z-spread** — Spread constante sobre toda a curva de juros zero-cupom que equaliza o preço de mercado ao valor presente dos fluxos. Publicado pela ANBIMA para debêntures e CRI precificados.

---

## Conclusão: um mercado em maturação acelerada sob pressões cruzadas

O mercado de CRI brasileiro atravessa uma fase de **institucionalização definitiva**. A consolidação regulatória (Lei 14.430, CVM 60, CMN 5.118), a concentração industrial (Opea detém ~60% do mercado pós-aquisição da True) e a expansão explosiva da base de investidores pessoa física criaram condições para que o CRI substitua progressivamente a poupança como coluna vertebral do financiamento imobiliário. A participação de CRI no funding total já saltou de 8% para 9% em um único ano.

Três tensões definem o momento atual. Primeira, a **inadimplência crescente** em CRI de desenvolvimento — com defaults dobrando em 2024 — colide com a compressão de spreads observada no mesmo período, sugerindo que parte do mercado subestimou riscos ao perseguir rendimento. Segunda, a **incerteza tributária** permanente — embora a MP 1.303/2025 tenha caducado, novas propostas são esperadas em 2026, e qualquer alteração na isenção de IR para PF alteraria fundamentalmente a dinâmica de demanda. Terceira, a **restrição de lastro** imposta pela CMN 5.118/5.212 depurou operações sem nexo imobiliário genuíno, mas reduziu o universo de emissores elegíveis e desafia securitizadoras a encontrar lastro de qualidade em volume suficiente.

Para os próximos anos, a trajetória mais provável é de **crescimento estrutural moderado** do estoque (projetado para superar R$ 300 bilhões até 2027), com spreads gradualmente mais diferenciados por qualidade de crédito, maior participação de estruturas revolving e pulverizadas, e aprofundamento do mercado secundário via Trademate e precificação ANBIMA. O CRI deixou de ser instrumento de nicho para se tornar peça central da arquitetura financeira imobiliária brasileira.