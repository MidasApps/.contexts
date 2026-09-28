# Learnings

> Aprendizados específicos do projeto que não estão cobertos pelo patterns.md genérico.

---

## Propósito

Esta pasta armazena **soluções para problemas encontrados** durante o desenvolvimento. Cada arquivo documenta um caso específico para que a IA não repita o mesmo erro.

## Quando Criar um Learning

- Componente com comportamento inesperado
- Alinhamento/layout que precisou de ajuste manual
- Combinação de componentes não documentada
- Edge case não coberto pelo patterns.md
- Solução que levou mais de uma tentativa

## Estrutura

```
learnings/
├── README.md (este arquivo)
├── template.md (template para novos learnings)
└── [nome-do-learning].md (learnings específicos)
```

## Nomenclatura

Use kebab-case descritivo:
- `input-button-group-alignment.md`
- `modal-inside-drawer.md`
- `sidebar-collapse-animation.md`
- `table-responsive-scroll.md`
