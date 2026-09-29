# Design System Framework

> Framework para gerar Design Systems customizados via entrevista com IA.

---

## Quick Start

### 1. Rodar o Setup

```bash
claude chat --agent setup-design-system
```

### 2. Responder as perguntas

O agente vai conversar sobre o visual do seu app de forma natural, sem tecnês.

### 3. Verificar output

Arquivos gerados em `design-system/generated/`:
- `tokens.md` - Cores, tipografia, espaçamento, motion
- `patterns.md` - Patterns de UI escolhidos
- `layers.md` - Regras FSD por camada
- `learnings/` - Aprendizados específicos do projeto

### 4. Usar o Frontend Engineer

```bash
claude chat --agent frontend-engineer
```

O agente Frontend Engineer vai construir interfaces seguindo o Design System gerado.

---

## Fluxo

```
briefing.md ──► Setup ──► generated/ ──► Frontend Engineer ──► Componentes
```

1. **Setup Design System** usa `briefing.md` + `templates/` para coletar decisões
2. **Setup Design System** gera arquivos preenchidos em `generated/`
3. **Frontend Engineer** consome `generated/` para construir layouts

---

## Estrutura

| Pasta | Propósito |
|-------|-----------|
| `briefing.md` | Perguntas em linguagem natural |
| `templates/` | Templates vazios (tokens, layers, patterns, learnings) |
| `generated/` | Output preenchido pelo entrevistador |
| `generated/learnings/` | Soluções para problemas encontrados durante desenvolvimento |

---

## Learnings

Quando o Frontend Engineer resolve um problema não coberto pelo `patterns.md`, ele documenta a solução em `generated/learnings/` usando o template de `templates/learnings/template.md`.

Isso evita que o mesmo erro se repita e mantém o `patterns.md` limpo e genérico.

---

## Links Úteis

- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Feature-Sliced Design](https://feature-sliced.design)
