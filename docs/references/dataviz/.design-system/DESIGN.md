# Midas — Design System

Catálogo visual do produto — app interno com sidebar, chat, terminais e rotinas. Visual **shadcn/ui-derived**, dual theme (dark default + light), neutral-first com paleta de status colorida.

## Postura visual

- **Dark-first**, com light theme paralelo (mesmas semânticas de token).
- Neutros quase puros (preto/branco frios, sem desvio de matiz) + bordas translúcidas (`#ffffff1a` no dark).
- Acentos saturados e específicos por domínio (blue / emerald / amber / cyan / violet / destructive). Usados em badges, status pills, ícones — **não** como cor de página.
- Cantos generosos (raio base 14px, xl ≈ 19.6px) — sensação de software premium.
- Sem sombras dramáticas — separação por superfície (card sobre sidebar sobre background) + bordas hairline.
- Tipografia sans system stack + numerais mono para IDs/valores.

## Tokens — Dark (padrão)

```css
:root {
  /* surfaces */
  --background: #0a0a0a;
  --foreground: #fafafa;
  --card:       #171717;
  --card-foreground: #fafafa;
  --popover:    #171717;
  --sidebar:    #171717;
  --sidebar-foreground: #fafafa;

  /* neutrals */
  --muted:      #262626;
  --muted-foreground: #a1a1a1;
  --secondary:  #262626;
  --accent:     #262626;
  --primary:    #e5e5e5;          /* light pill on dark */
  --primary-foreground: #171717;

  /* lines */
  --border:     #ffffff1a;        /* white @ 10% */
  --input:      #ffffff26;        /* white @ 15% */
  --ring:       #a1a1a1;

  /* status */
  --destructive: #ff6568;
  --color-blue:    #478eff;
  --color-emerald: #2bbb71;
  --color-amber:   #f2823b;
  --color-cyan:    #00b2d1;
  --color-violet:  #a37aff;

  /* sidebar brand pin */
  --sidebar-primary: #1447e6;     /* deep electric blue */
}
```

## Tokens — Light

```css
:root[data-theme="light"] {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --card:       #ffffff;
  --muted:      #f5f5f5;
  --muted-foreground: #737373;
  --primary:    #171717;
  --primary-foreground: #fafafa;
  --border:     #e5e5e5;
  --input:      #e5e5e5;
  --ring:       #737373;
  --destructive: #e40014;
  --color-blue:    #0766ee;
  --color-emerald: #009956;
  --color-amber:   #dc6400;
  --color-cyan:    #008ba6;
  --color-violet:  #824ae4;
}
```

## Tipografia

- **Display + body:** `var(--font-sans)` — system sans stack (`ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji"...`). No produto real é Geist / Inter via `next/font`.
- **Mono:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` — para IDs, valores, atalhos (`⌘K`), tabular nums.
- **Pesos:** 400 normal · 500 medium · 600 semibold · 700 bold.
- **Line heights:** tight 1.25 · snug 1.375 · normal 1.5 · relaxed 1.625.
- Escala via tailwind `text-*` (xs/sm/base/lg/xl/2xl/3xl/4xl), line-height calculado por tamanho.

## Raios, espaçamento, motion

| Token | Valor |
|---|---|
| `--radius` | `0.875rem` (14px) |
| `--radius-xl` | `calc(var(--radius)*1.4)` ≈ 19.6px |
| `--spacing` | `0.25rem` (base do grid 4px tailwind) |
| `--component-xs/sm/md/lg` | 4 / 8 / 12 / 16 px |
| `--layout-sm/md/lg` | 16 / 24 / 32 px |
| `--duration-instant/fast/moderate/deliberate` | 0s / 0.15s / 0.3s / 0.7s |
| `--ease-in-out` | `cubic-bezier(.4,0,.2,1)` |
| `--ease-out` | `cubic-bezier(0,0,.2,1)` |

## Componentes-chave observados

1. **Sidebar colapsável** com seções agrupadas (Terminais / Equipe / Configurações), badge numérico no item ativo, avatar + role no footer.
2. **Command palette** com atalho `⌘K` (kbd mono em pill).
3. **Cards de ação** ("Iniciar análise SBPE") — card `--card` com border hairline, título semibold, descrição muted, CTA primário.
4. **Chat input** com ações inline (anexar, enviar) no rodapé do canvas central.
5. **Status pills** em accents (blue/emerald/amber) para tags de tarefa, etapa, prioridade.
6. **Tabular nums** em todo dado numérico (taxas, parcelas, CET, valores).

## Princípios

- **Neutros são o canvas, cor é informação.** Use accent para sinalizar estado, nunca para decorar.
- **Hairline borders > sombras.** Empilhamento de superfícies (`background` → `sidebar`/`card` → `popover`) cria profundidade.
- **Mono para precisão.** Valores monetários, IDs, atalhos e badges numéricos em `var(--font-mono)` + `font-variant-numeric: tabular-nums`.
- **Raio generoso, peso visual leve.** 14px+ em cards e inputs; pills full-rounded.
- **Sem gradientes decorativos.** Único uso aceitável: shimmer/skeleton via `--bg` gradient durante loading.
