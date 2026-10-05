# Unidades

Unidades dividem um projeto em partes menores, como locais, filiais, salas ou equipes. Esta página mostra como montar a árvore de unidades de cada projeto, como focar o trabalho em uma unidade e como o acesso funciona dentro dessa árvore.

## O que é

Uma **unidade** é um nó dentro de um projeto. Ela pode ficar direto no projeto ou dentro de outra unidade, formando uma árvore:

```text
Projeto "Lojas"
├── Loja Centro
│   ├── Estoque
│   └── Caixa
└── Loja Bairro Alto
```

Características principais:

- **Toda unidade tem um nome e um tipo.** O app traz o tipo **Unidade**, que pode ficar direto no projeto ou dentro de outra unidade. Módulos instalados podem acrescentar tipos próprios, cada um com regras de onde pode ficar. Alguns tipos não aceitam subunidades.
- **Profundidade limitada.** Uma unidade pode ter no máximo 6 unidades acima dela.
- **Acesso herdado.** Quem tem acesso ao projeto tem acesso a todas as unidades dele. Quem tem acesso a uma unidade tem acesso também às subunidades dela.
- **Fuso horário de exibição.** Datas e horas aparecem no fuso escolhido no seu perfil. Se você não escolheu um, o app usa o fuso da unidade, do projeto ou da organização, nessa ordem. A tela de unidades não tem campo de fuso horário.

## Quem pode usar

| Ação | Permissão | Papéis que têm por padrão |
|---|---|---|
| Ver unidades e a seção **Unidades** | `core.unit.read` | Proprietário, Administrador, Membro, Leitor |
| Criar unidades | `core.unit.create` | Proprietário, Administrador |
| Renomear e mover unidades | `core.unit.update` | Proprietário, Administrador |
| Excluir unidades | `core.unit.delete` | Proprietário, Administrador |

Quem só pode ver unidades enxerga a árvore, mas sem os botões de ação. O seletor de unidade da barra lateral aparece dentro de um projeto quando você pode ver as unidades dele.

## Onde encontrar

- **Configurações → Unidades**, no grupo **Organização** do menu de configurações: `/o/{organização}/settings/units`. O projeto escolhido fica no endereço: `/o/{organização}/settings/units?project={projeto}`.
- **Visão geral do projeto**, seção **Unidades**: `/o/{organização}/p/{projeto}`. Quem pode criar unidades vê o botão **Gerenciar unidades**, que leva às configurações.
- **Seletor de unidade** na barra lateral, logo abaixo do seletor de projeto. Ao escolher uma unidade, o endereço ganha `?unit={unidade}`, por exemplo `/o/{organização}/p/{projeto}?unit={unidade}`. Isso vale também nas páginas de módulos do projeto.

![Árvore de unidades do projeto](/guide/units-tree.jpg)

*Na tela: **Configurações → Unidades**: escolha o projeto e veja a árvore de unidades.*

## Passo a passo

![Diálogo Nova unidade com Nome e Tipo](/guide/units-dialog.jpg)

*O diálogo **Nova unidade**: **Nome** e **Tipo**.*

### Escolher o projeto

1. Vá em **Configurações → Unidades**.
2. Se a organização tem mais de um projeto, escolha-o no campo **Projeto**. Com um projeto só, ele já vem aberto.
3. O cartão **Unidades de {projeto}** mostra a árvore.

Se ainda não há projetos, a página mostra **Nenhum projeto ainda** e o botão **Ver projetos**. Crie um projeto primeiro (veja [Organizações e projetos](/docs/organizations)).

### Criar uma unidade direto no projeto

1. Com nenhuma unidade selecionada (a barra de ações mostra **Nenhuma unidade selecionada**), clique em **Nova unidade**.
2. Em **Nome**, digite o nome da unidade.
3. Em **Tipo**, escolha o tipo (por exemplo, **Unidade**).
4. Clique em **Criar unidade**. Aparece **Unidade {nome} criada.**

### Criar uma subunidade

1. Na árvore, clique na unidade que vai receber a subunidade.
2. Clique em **Nova subunidade**. A janela informa **A unidade fica dentro de {unidade}.**
3. Preencha **Nome** e **Tipo**.
4. Clique em **Criar unidade**.

Se o botão estiver desativado com o aviso **Este tipo de unidade não aceita subunidades.**, o tipo da unidade selecionada não permite filhas.

### Renomear uma unidade

1. Selecione a unidade na árvore.
2. Clique em **Renomear**.
3. Digite o novo nome e clique em **Salvar nome**. O novo nome aparece em todo lugar onde a unidade é usada.

### Mover uma unidade

1. Selecione a unidade na árvore.
2. Clique em **Mover para…**.
3. Em **Destino**, escolha para onde ela vai. Use **Buscar unidade** para filtrar. A opção com o nome do projeto coloca a unidade direto no projeto.
4. Clique em **Mover**. As subunidades vão junto.

O destino não pode ser a própria unidade, uma subunidade dela ou o lugar onde ela já está, e precisa aceitar o tipo da unidade. Se nada servir, a janela mostra **Não há outro lugar para onde esta unidade possa ir.**

### Excluir uma unidade

1. Selecione a unidade na árvore.
2. Clique em **Excluir**.
3. Leia o aviso: ele informa quantas subunidades serão excluídas junto. Os acessos concedidos nelas deixam de valer.
4. Clique em **Excluir unidade**.

Para tirar a seleção de uma unidade, clique nela de novo.

### Focar o trabalho em uma unidade

1. Abra o projeto.
2. Na barra lateral, clique no seletor de unidade (ele mostra **Projeto inteiro** quando nenhuma está escolhida).
3. Em **Escolha uma unidade**, clique na unidade.
4. Para voltar ao projeto todo, escolha **Projeto inteiro**.

Na **Visão geral**, você também pode clicar em uma unidade da seção **Unidades**. Dentro dela, a seção passa a se chamar **Subunidades** e o topo mostra **Unidade atual:** com o caminho.

## Exemplo

Exemplo: uma rede de escolas de idiomas organiza o projeto "Ensino" por cidade e por sede.

| Unidade | Dentro de | Tipo |
|---|---|---|
| Campinas | Ensino (projeto) | Unidade |
| Sede Cambuí | Campinas | Unidade |
| Sede Taquaral | Campinas | Unidade |
| Sorocaba | Ensino (projeto) | Unidade |
| Sede Centro | Sorocaba | Unidade |

Como uma unidade aparece na API (formato do contrato `tenancy.Unit`, valores ilustrativos). A "Sede Cambuí" tem uma unidade acima dela (Campinas), por isso `depth` é 1:

```json
{
  "id": "Un8Bc3Xr6Lm1Qz9Wp4Ks",
  "tenantId": "Xk2pQ7vR9mWb3TnL8sYc",
  "projectId": "Pj4Wd9Ks2Lq6Mn8Bv3Yr",
  "parentUnitId": "Un2Ty7Hg5Jd8Ws3Ec6Va",
  "ancestorIds": ["Un2Ty7Hg5Jd8Ws3Ec6Va"],
  "depth": 1,
  "type": "core.unit",
  "name": "Sede Cambuí",
  "settings": {},
  "createdAt": "2026-09-20T13:00:00.000Z",
  "updatedAt": "2026-09-20T13:00:00.000Z"
}
```

Como o acesso desce na árvore:

| Pessoa | Acesso | O que enxerga |
|---|---|---|
| Coordenação geral | Projeto "Ensino" | Todas as cidades e sedes |
| Professora Lúcia | Unidade "Campinas" | Campinas, Sede Cambuí e Sede Taquaral |

> **Lúcia:** Escolhi Sede Taquaral no seletor e o endereço mudou para terminar em `?unit=...`. Posso mandar esse link para a minha colega?
>
> **Coordenação:** Pode. Ela abre a mesma unidade, desde que tenha acesso a ela.

## Dicas e boas práticas

- Planeje a árvore antes de criar: comece pelos níveis mais estáveis (cidade, filial) e deixe divisões que mudam muito para baixo.
- Use nomes curtos e únicos no mesmo nível; o caminho completo aparece em vários lugares, como "Campinas › Sede Cambuí".
- Prefira **Mover para…** a excluir e recriar: excluir apaga as subunidades e os acessos concedidos nelas.
- A árvore mostra as primeiras 500 unidades de um projeto. Se o projeto crescer além disso, considere dividi-lo em mais projetos.
- Mover uma unidade com muitas subunidades pode ser recusado. Nesse caso, mova partes menores.
- Unidades a que você não tem acesso aparecem como **Unidade restrita** no caminho.
- Para dar a alguém acesso só a uma unidade, escolha a unidade no campo **Unidade** do convite ou use **Dar acesso** em **Configurações → Membros**. Veja [Membros e convites](/docs/members).

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| Esta unidade não pode ficar dentro da unidade escolhida. | O tipo do destino não aceita o tipo da unidade, ou o limite de profundidade foi atingido. | Escolha outro destino ou um nível mais alto. |
| Esta unidade tem subunidades demais para ser movida de uma vez. | A unidade tem subunidades demais para uma única mudança. | Mova as subunidades em partes. |
| Dê um nome à unidade. | O campo **Nome** ficou vazio. | Preencha o nome. |
| Escolha o tipo da unidade. | O campo **Tipo** ficou vazio. | Escolha um tipo. |
| Nenhum tipo de unidade pode ficar direto no projeto. | Os tipos disponíveis só ficam dentro de outras unidades. | Selecione uma unidade e use **Nova subunidade**. |
| Mostrando as primeiras 500 unidades. | O projeto tem mais unidades do que a árvore mostra. | Divida o trabalho em mais projetos ou reorganize a árvore. |
| Nenhuma unidade neste projeto | O projeto ainda não tem unidades. | Peça a quem administra para criar unidades nas configurações. |
| Você não tem permissão para fazer isso. | Falta a permissão para a ação. | Peça o papel adequado a um administrador. |
| Este item foi alterado por outra pessoa. Recarregue e tente novamente. | A árvore mudou enquanto você editava. | Recarregue e refaça a ação. |

## Veja também

- [Organizações e projetos](/docs/organizations)
- [Papéis e permissões](/docs/roles)
- [Membros e convites](/docs/members)
- [Módulos](/docs/modules)
- [Glossário](/docs/glossary)
