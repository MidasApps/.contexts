# Layers FSD

> Regras de classes por camada. O que usar e o que evitar.

---

## Resumo

| Camada | Responsabilidade |
|--------|------------------|
| `shared/` | Primitivos visuais |
| `entities/` | Dados de negócio |
| `features/` | Interações |
| `widgets/` | Composições |
| `pages/` | Layout macro |

---

## shared/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Variáveis semânticas | `bg-white`, `text-gray-*`, hex |
| Spacing | `p-*` (padding interno) | `m-*` (margin externa) |
| Position | `relative` | `fixed`, `absolute`, `sticky` |
| Z-index | Nenhum | Qualquer z-index |
| Width | `w-auto`, `w-full` | `w-[px]` fixo |
| Layout | `flex`, `inline-flex` | `grid` de página |
| Transition | `transition-colors` | Animações complexas |

---

## entities/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Variáveis semânticas | Hardcoded |
| Spacing | `p-*`, `gap-*` interno | `m-*` externa |
| Position | `relative` | `fixed`, `sticky` |
| Z-index | Até `z-10` | Acima |
| Dimensão | `aspect-*`, `min-h-*` | `w-[px]`, `h-[px]` fixos |
| Texto | `truncate`, `line-clamp-*` | Overflow livre |
| Imagem | `object-cover`, `object-contain` | Distorção |

---

## features/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Semânticas + `destructive`, `success` | Hardcoded |
| Spacing | `p-*`, `gap-*`, `space-y-*` | `m-*` externa |
| Position | `relative` | `fixed`, `sticky` |
| Z-index | Até `z-10` | Acima |
| Width | `w-full` | `w-[px]` fixo |
| Estados | `disabled:`, `loading:` | Sem feedback visual |
| Focus | `focus-visible:ring-*` | Sem focus ring |

---

## widgets/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Variáveis semânticas | Hardcoded |
| Spacing | `gap-*`, `p-*` de seção | `m-*` externa |
| Position | `relative`, `sticky` | `fixed` |
| Z-index | Até `z-40` | Acima |
| Layout | `grid`, `flex`, `columns` | — |
| Overflow | `overflow-x-auto`, `overflow-y-auto` | — |
| Responsivo | `grid-cols-1 md:grid-cols-2` | Layout fixo |

---

## pages/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Semânticas, gradientes | Hardcoded |
| Spacing | `container`, `px-*`, `py-*` | — |
| Position | `fixed`, `sticky`, `absolute` | — |
| Z-index | Todos os níveis | — |
| Layout | Macro: sidebar + content | — |
| Height | `min-h-screen`, `h-dvh` | — |
| Safe area | `pb-safe`, `pt-safe` | Ignorar |

---

## Z-index Scale

| Token | Valor | Uso | Camada |
|-------|-------|-----|--------|
| `z-0` | 0 | Base | shared |
| `z-10` | 10 | Overlays internos | entities, features |
| `z-20` | 20 | Dropdowns | widgets |
| `z-30` | 30 | Sticky headers | widgets |
| `z-40` | 40 | Sidebars | widgets |
| `z-50` | 50 | Modals | pages |
| `z-[100]` | 100 | Toasts | pages |

---

## Classes Proibidas Globais

| Classe | Motivo |
|--------|--------|
| `bg-white`, `bg-black` | Usar variáveis |
| `text-gray-*` | Usar `text-muted-foreground` |
| `border-gray-*` | Usar `border-border` |
| Cores hex/rgb | Usar variáveis |
| `!important` | Override problemático |
| `p-[13px]` arbitrários | Usar escala |
| `font-thin`, `font-black` | Legibilidade |
