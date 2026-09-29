# DataViz: o que migra, o que se descarta e o impedimento real

> Resposta consolidada sobre o reaproveitamento do DataViz na plataforma nova
> (Python + Strands + Bedrock + MongoDB, ambiente AWS), partindo do que de fato
> existe hoje (TypeScript + Mastra + Vertex/Gemini + Firestore + BigQuery, GCP).

## Resumo em uma frase

O que migra é o **conhecimento**: a lógica de produto, os prompts, a engenharia
de contexto e o desenho da arquitetura agêntica. O que **se descarta** é tudo
que existe em volta dele: o BFF, os layouts, componentes, páginas, autenticação,
permissões, grupos de usuários, rotas e os contratos como estão implementados
hoje. São coisas diferentes, e tratar as duas como "o backend" é o erro que
precisa ser desfeito antes de qualquer estimativa.

## 1. O que NÃO migra (vai ser recriado ou adaptado)

Tudo isto faz parte da arquitetura do BFF e morre na migração, porque terá que
nascer de novo dentro dos padrões da plataforma nova:

- Layouts, componentes e páginas.
- Autenticação, permissões, grupos de usuários e rotas.
- Os contratos como implementação concreta: contrato de dados, contrato de KPIs
  apontado pro BigQuery, permissões de KPIs, permissões de páginas, permissões
  de datasets, modelo de usuários.

A **lógica do produto** sobrevive. Tudo em volta dela, não. A intenção
semântica de um contrato (o que um KPI significa, qual a regra de elegibilidade,
qual permissão governa qual dataset) é reaproveitável como conhecimento, mas a
forma como ela está modelada e codada no BFF não viaja: ela vai ter que entrar
nos padrões novos, sejam eles quais forem.

## 2. O que migra (o ativo de verdade)

O que se aproveita é todo o conhecimento construído aqui:

- **Prompts e engenharia de contexto.** Funcionam bem e estão maduros. Teriam
  que ser recriados dentro dos padrões da plataforma nova, mas o trabalho caro
  (descobrir o que o agente precisa saber e como ele deve responder) já está
  feito.
- **Lógica das funcionalidades do DataViz.** Parte vai pro Python, porque será
  o core da aplicação (preditividade, vintage, stress, PD/LGD, e demais cálculos
  de carteira). Outra parte vai pro BFF/frontend deles. É reaproveitável como
  raciocínio, não como código.
- **A arquitetura agêntica.** RAG, memória, vetorização, agentes, skills (os
  conhecimentos e tools que cada agente usa) e orquestração. Esse desenho vai
  pro Strands e pras stacks envolvidas lá. O conceito viaja, a implementação
  não.
- **O corpo de conhecimento `.contexts` (DDC).** Decisions, contracts,
  architecture, practices, rules. É o blueprint que reduz alucinação e mantém
  consistência. Ele está hoje focado num padrão (o do BFF) e funciona muito bem
  nesse padrão.

## 3. Mastra e Strands: são duas engenharias

Tudo que está sendo criado aqui é em cima do **Mastra**, não do Strands. Isso
tem uma consequência direta: pode haver funcionalidade que no Strands funcione
de outro jeito, ou nem exista da mesma forma. Não é traduzir linha por linha, é
reimplementar dentro de outro framework.

São dois ambientes pra codar, duas linguagens e dois conjuntos de padrões. Na
prática são **duas engenharias** pra manter. O `.contexts` que existe hoje cobre
uma delas (o BFF, em TypeScript) e funciona super bem nela. O lado Python
precisaria do seu próprio corpo de conhecimento e convenção, que ainda não
existe.

Por isso a frase honesta não é "construí uma vez e reaproveito". É: **tudo que
eu criar no BFF será descartado, porque terá que ser reaproveitado (reescrito)
no backend Python.** O que atravessa é o conhecimento, não o artefato.

## 4. O impedimento real: falta de convenção na plataforma nova

Aqui está o ponto central, e ele não é técnico de código, é de método.

Quanto mais funcionalidade eu criar aqui, **mais trabalhosa fica a migração**,
porque eu não sei quais são os padrões adotados nas aplicações que estão sendo
desenvolvidas, nem se há padrões. Dei uma olhada no agent core e não havia nada
sobre convenções nele.

O risco é concreto: se eu continuar criando sem saber o padrão de destino, vou
entregar um produto **totalmente desacoplado da infraestrutura e dos padrões
novos** (se eles existirem). Por melhores que sejam os desenvolvedores, sem
convenção definida e seguida como regra, a IA vai alucinar ou deixar de
respeitar o padrão em algum momento, e o resultado vira um "monstrinho":
software que cresce sem forma, caro de manter e impossível de evoluir com
velocidade.

Ou seja: a sensação é de que se está criando sem saber qual padrão se está
criando. Esse é o impedimento. Não é "dá ou não dá pra migrar a inteligência".
Dá. O impedimento é migrar pra dentro do quê.

### O que destrava

Se a gente quer velocidade, a regra precisa ser: **convenções primeiro, código
depois.** O DDC que já funciona aqui prova o valor disso. O mesmo método
(contracts, rules, architecture, decisions) precisa existir do lado Python/
Strands antes de portar volume. Sem isso, cada funcionalidade nova é dívida de
migração, não progresso.

## 5. Respostas diretas às perguntas

**Os agentes são facilmente replicáveis?**
Sim, como configuração e desenho reimplementados no Strands, não como código
portado. O prompt e a lógica viajam; o runtime Mastra não.

**As skills e a documentação feita com o Odair dão pra replicar?**
Sim. Skills (os conhecimentos e as tools de cada agente, como preditividade) e
documentação são conhecimento e contrato, copiáveis e adaptáveis aos padrões de
lá. Mas "replicar" aqui significa recriar dentro da convenção da plataforma
nova, não copiar e colar.

**Dá pra pegar o backend pronto e usar na plataforma?**
Não como artefato. As stacks são diferentes (TS/Mastra/Gemini/GCP contra
Python/Strands/Bedrock/AWS) e os dados de IA hoje estão no Firestore, que precisa
migrar pro MongoDB (migração document para document, com embeddings indo pro
Atlas Vector Search). O que se pega pronto é o conhecimento, não o código.

## 6. Conclusão

Não é verdade que levamos o DataViz inteiro pra plataforma nova, e está certo
não ser. O layout converge pro padrão de lá. A inteligência se aproveita, mas em
camadas: a lógica de produto e o conhecimento atravessam; o BFF e tudo em volta
são descartados e recriados dentro dos padrões novos.

O que define o tamanho e o risco da migração não é a inteligência em si, é a
existência (ou não) de convenções na plataforma de destino. Enquanto não houver
padrão definido lá, criar mais aqui aumenta o custo de migração em vez de
adiantar trabalho. A recomendação é estabelecer as convenções do lado Python/
Strands primeiro, no mesmo espírito do `.contexts` que já funciona aqui, e só
então portar volume contra esse padrão.
