# Canvas Block Editing — Design Spec

**Data:** 2026-03-20
**Escopo:** Edição interativa de blocos no modo Explore (rota `/explore`)

## Contexto

Atualmente os blocos no canvas (KPIs, gráficos, tabelas, texto) são renderizados em um stack vertical estático sem nenhuma interatividade de edição. O usuário só pode adicionar blocos via comandos ao agente IA. Este spec define as capacidades de edição direta no canvas.

## Funcionalidades

### 1. Toolbar Flutuante

Cada bloco exibe uma toolbar flutuante ao receber hover do mouse.

- **Posição:** Acima do bloco, 100% da largura, visualmente conectada (borda arredondada só no topo, sem gap entre toolbar e bloco)
- **Visibilidade:** Só aparece no hover. Desaparece ao sair do bloco.
- **Layout interno:**
  - Esquerda: checkbox de seleção para IA
  - Centro: indicador de drag (⠿)
  - Direita: botão X (deletar)
- **Toda a área da toolbar é arrastável** (cursor: grab)

### 2. Deletar Blocos

- **Ação:** Clicar no botão X na toolbar do bloco
- **Confirmação:** Modal de confirmação com nome do bloco, botões "Cancelar" e "Excluir"
- **Efeito:** Remove o bloco via `removeBlock` no canvas-store (atualiza `blockMap` e `layout` atomicamente)
- **Layout:** Se o bloco estava em uma linha com outros, a linha se reajusta (ex: 3 colunas → 2 colunas). Linha vazia é removida.

### 3. Drag & Drop — Reordenação e Composição por Linhas

O layout dos blocos é baseado em **linhas dinâmicas**. Cada linha contém 1 a 3 blocos com larguras iguais.

#### Modelo de dados

O modelo usa `layout` como **fonte única de ordenação** e `blockMap` como lookup de conteúdo. Não existe mais um array `blocks[]` ordenado.

```typescript
interface CanvasRow {
  id: string;
  blockIds: string[]; // 1 a 3 block IDs
}

interface CanvasPage {
  id: string;
  title: string;
  description?: string;
  blockMap: Record<string, CanvasBlock>; // conteúdo por ID
  layout: CanvasRow[];                   // ordenação e posicionamento
  filters?: CanvasPageFilters;
}
```

**Invariante:** Todo bloco em `blockMap` DEVE aparecer em exatamente uma posição em `layout`. Toda mutação (`addBlock`, `removeBlock`, `moveBlock`) atualiza ambos atomicamente.

**Serialização:** Para Firestore e para o array `blocks` legado, a serialização reconstrói o array ordenado a partir de `layout` + `blockMap`:

```typescript
function serializeBlocks(page: CanvasPage): CanvasBlock[] {
  return page.layout.flatMap(row =>
    row.blockIds.map(id => page.blockMap[id]).filter(Boolean)
  );
}
```

#### Migração de dados existentes

Páginas existentes (com `blocks[]` e sem `layout`) são migradas na leitura:

```typescript
function migratePage(page: LegacyCanvasPage): CanvasPage {
  const blockMap: Record<string, CanvasBlock> = {};
  const layout: CanvasRow[] = [];
  for (const block of page.blocks) {
    blockMap[block.id] = block;
    layout.push({ id: generateId(), blockIds: [block.id] });
  }
  return { ...page, blockMap, layout };
}
```

#### Comportamento de drop

- **Soltar ao lado de um bloco** (zona lateral): o bloco é adicionado à mesma linha → linha passa de N para N+1 colunas (max 3)
- **Soltar abaixo/acima de uma linha** (zona vertical): cria nova linha com o bloco ocupando largura total
- **Remover bloco de uma linha**: a linha se reajusta (3→2, 2→1). Linha vazia é removida automaticamente.

#### Indicador de drop

- **Linha azul** (`#3b82f6`) aparece na posição de destino durante o drag
- Linha vertical: indica que o bloco será inserido ao lado
- Linha horizontal: indica que o bloco será inserido como nova linha

#### Restrições por tipo de bloco

| Tipo | Largura mínima | Max por linha | Comportamento em coluna estreita |
|------|---------------|---------------|----------------------------------|
| Tabela | 2/3 (dois slots) | 1 tabela + 1 bloco menor | Sempre min 2/3 |
| Gráfico | 1/3 | 3 | ResponsiveContainer adapta |
| KPIs | 1/2 (dois slots) | 2 KPIs ou 1 KPI + 1 bloco | Cards reflowam para stack vertical |
| Texto | 1/3 | 3 | Texto adapta naturalmente |

Se um drop violaria a restrição (ex: tabela em 1/3), o drop é rejeitado — a linha azul não aparece nessa posição.

### 4. Seleção de Blocos para Ajuste via IA

O usuário pode selecionar blocos antes de enviar um comando no chat para direcionar a IA.

#### Interação

- **Selecionar:** Clicar no checkbox na toolbar do bloco
- **Estado selecionado:** Borda laranja (`#F3A169`) no bloco + toolbar com fundo laranja sutil. Badge numerado (ordem de seleção) no canto superior direito.
- **Blocos não selecionados:** Opacidade reduzida quando há seleção ativa
- **Barra de status:** Aparece abaixo dos blocos quando há seleção: "N blocos selecionados — a IA ajustará apenas o conteúdo destes blocos" + botão "Limpar seleção"
- **Limpar:** Botão na barra de status ou enviar mensagem (limpa após processamento)
- **Troca de página:** Seleção é limpa ao trocar de página ativa (`setActivePage` chama `clearSelection`)

#### Comportamento da IA

- **Sem blocos selecionados:** IA pode alterar layout (reordenar, mover entre linhas) e conteúdo (dados, tipo de gráfico, colunas)
- **Com blocos selecionados:** IA só altera conteúdo dos blocos marcados. Layout permanece intacto. O contexto enviado ao agente inclui os IDs dos blocos selecionados.

#### Integração com o chat

O `buildBody()` no ChatPanel passa os IDs dos blocos selecionados:

```typescript
{
  dataset: string;
  filters: ChatRequestFilters;
  canvasPages: CanvasPageContext[];
  bqmlEnabled: boolean;
  selectedBlockIds: string[]; // novo
}
```

O system prompt do orchestrator recebe instrução condicional:
- Se `selectedBlockIds` não vazio: "O usuário selecionou os blocos [IDs]. Altere APENAS o conteúdo destes blocos. Não modifique o layout."
- Se vazio: comportamento padrão

### 5. Ferramentas do Agente para Layout

Novas tools para o orchestrator manipular layout via chat:

```typescript
// Move bloco para posição relativa a outro bloco
move_block: {
  blockId: string;
  targetBlockId: string;     // bloco de referência
  position: 'before' | 'after' | 'left' | 'right'; // relativo ao target
}

// Remove bloco
remove_block: {
  blockId: string;
}

// Atualiza conteúdo — tools por tipo (mesmo padrão do add_*_block)
update_text_block: { blockId: string; content: string; }
update_kpis_block: { blockId: string; items: KpiBlockItem[]; }
update_chart_block: { blockId: string; chartType: string; data: ...; dataKeys: ...; xAxisKey: ...; }
update_table_block: { blockId: string; columns: ...; rows: ...; }
```

**Nota:** `move_block` usa posicionamento relativo a outro bloco (por ID) em vez de índices absolutos de linha, evitando problemas quando múltiplas operações sequenciais alteram a estrutura.

## Arquitetura

### Biblioteca de Layout

Usar **`flexlayout-react@^0.8`** (FlexLayout):
- Layout manager completo com drag-and-drop nativo entre painéis
- Splitters para resize livre entre blocos
- Modelo JSON serializável (`model.toJson()` / `Model.fromJson()`)
- Tema dark built-in
- Suporte a mouse e touch
- 8 anos de maturidade, apenas React como dependência

**Decisão:** Substituiu `@dnd-kit/core` que exigia lógica custom de rows/drop-zones e apresentava bugs (toolbar não aparecia, drag não funcionava). FlexLayout resolve drag, drop, resize e layout composition nativamente.

### Componentes

```
CanvasPanel
├── <Layout> (flexlayout-react — gerencia drag, drop, resize, splitters)
│   └── factory → BlockPanel (renderiza cada bloco pelo ID)
│       └── CanvasBlockRenderer (existente)
├── SelectionBar (barra "N blocos selecionados")
└── DeleteConfirmModal (modal de confirmação)
```

Componentes removidos (FlexLayout substitui):
- ~~CanvasRow~~ — FlexLayout gerencia linhas/colunas
- ~~DropIndicator~~ — FlexLayout tem indicadores nativos
- ~~BlockWrapper~~ — Substituído por BlockPanel (sem dnd-kit)
- ~~SideDropZone~~ — FlexLayout gerencia drop zones

### Estado no Canvas Store

Novas propriedades e ações:

```typescript
interface CanvasStoreState {
  // existentes...
  pages: CanvasPage[];
  activePage: number;

  // novas
  selectedBlockIds: string[];

  // ações modificadas
  addBlock: (pageIndex: number, block: CanvasBlock, position?: number) => void;
  // → agora também cria nova CanvasRow no final do layout (ou na position)

  // novas ações
  selectBlock: (blockId: string) => void;
  deselectBlock: (blockId: string) => void;
  clearSelection: () => void;
  removeBlock: (pageIndex: number, blockId: string) => void;
  moveBlock: (pageIndex: number, blockId: string, targetBlockId: string, position: 'before' | 'after' | 'left' | 'right') => void;
  updateBlockContent: (pageIndex: number, blockId: string, updates: Partial<CanvasBlock>) => void;
}
```

**`addBlock` modificado:** Ao adicionar um bloco, além de inserir em `blockMap`, cria automaticamente uma nova `CanvasRow` com esse bloco (largura total). Isso garante que blocos adicionados pela IA (via tools existentes `add_*_block`) aparecem corretamente no layout sem necessidade de alterar as tools.

### Contexto para a IA

`CanvasPageContext` é estendido com layout:

```typescript
interface CanvasPageContext {
  id: string;
  title: string;
  blocks: Array<{ id: string; type: string; title?: string }>;
  layout: Array<{ rowIndex: number; blockIds: string[] }>; // novo
}
```

`getPagesContext()` é atualizado para incluir o layout, permitindo que a IA saiba a estrutura atual ao usar `move_block`.

## Fluxo de Persistência

O layout faz parte da página e é salvo no Firestore junto com blocos e mensagens via `debouncedSave` existente. A serialização converte `blockMap` + `layout` para o formato Firestore. Na leitura, `migratePage` reconstrói o modelo se necessário.

## Casos Limite

1. **Bloco único na página:** Toolbar aparece normalmente, mas drag não tem efeito (sem destino)
2. **Página vazia após deletar tudo:** Mostra empty state existente (ícone Sparkles)
3. **Drag durante streaming:** Desabilitado enquanto `isStreaming === true` para evitar conflitos
4. **Drag inicia e streaming começa:** Drag em andamento é cancelado via `onDragCancel`
5. **Seleção durante streaming:** Permitida — o usuário pode marcar blocos enquanto a IA responde
6. **IA cria bloco enquanto há seleção:** Novo bloco não afeta seleção existente
7. **Resize de tela:** Layout de linhas se adapta — em telas pequenas (<768px), colunas empilham verticalmente
8. **Troca de página:** Seleção de blocos é limpa
9. **Bloco órfão em blockMap:** Se um bloco existe no `blockMap` mas não no `layout` (corrupção), `serializeBlocks` o ignora. Cleanup periódico pode remover órfãos.

## Melhorias Futuras (não neste escopo)

- **Undo/redo** para operações de layout e delete
- **Keyboard shortcuts** para delete (Del/Backspace) e seleção (Shift+Click)
- **Resize manual** de colunas dentro de uma linha (drag na borda entre blocos)
