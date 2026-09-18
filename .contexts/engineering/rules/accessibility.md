---
title: Regras de Acessibilidade
type: rules
scope: a11y / WCAG 2.2 AA
status: active
---

# Regras de Acessibilidade

Regras imperativas de acessibilidade (a11y) que se aplicam a todo código de UI do projeto. Baseline obrigatório: **WCAG 2.2 nível AA**. Estas regras governam comportamento e estrutura; convenções de idioma e RTL vivem em `@.contexts/engineering/rules/internationalization.md`.

## Baseline e conformidade

- **Sempre** atinja WCAG 2.2 nível AA em todo fluxo público. AAA é desejável, não obrigatório.
- **Nunca** ship uma feature nova sem ter passado teclado-only + leitor de tela ao menos uma vez.
- **Sempre** trate a11y como requisito funcional, não como polimento. Bug de acessibilidade tem severidade igual a bug funcional.
- **Nunca** use "vamos arrumar depois" como justificativa. Se não está acessível, não está pronto.

## HTML semântico primeiro

- **Sempre** use o elemento HTML nativo correto antes de considerar ARIA: `<button>` para ações, `<a href>` para navegação, `<input>` para entrada, `<nav>`, `<main>`, `<header>`, `<footer>`, `<aside>`, `<section>`, `<article>`.
- **Nunca** recrie controles nativos com `<div>` + ARIA quando o elemento nativo serve. Um `<button>` traz foco, teclado, role e estados grátis.
- **Nunca** use `<div onClick>` ou `<span onClick>` como botão. Se precisa ser clicável e não é link nem botão nativo, ainda assim é um bug — refatore para `<button>`.
- **Sempre** prefira `<a>` quando o destino é uma URL e `<button>` quando o destino é uma ação. Não troque.

## ARIA como último recurso (5 rules of ARIA)

- **Sempre** aplique a regra zero: se há um elemento HTML nativo com o comportamento desejado, use-o em vez de re-purposing outro elemento com ARIA.
- **Nunca** altere a semântica nativa via `role` quando não for necessário (`<button role="link">` é proibido).
- **Sempre** garanta que componentes ARIA sejam operáveis via teclado.
- **Nunca** use `role="presentation"` ou `aria-hidden="true"` em elemento focável ou interativo.
- **Sempre** forneça nome acessível a todo elemento interativo (texto visível, `aria-label`, `aria-labelledby` ou `<label>`).

## Landmarks e estrutura de página

- **Sempre** envolva o conteúdo principal em `<main>` (exatamente um por página/rota).
- **Sempre** marque navegação primária com `<nav>` e dê `aria-label` quando houver múltiplos `<nav>` na mesma página.
- **Sempre** use `<header>` e `<footer>` em nível de página quando aplicável; aninhados dentro de `<article>` ou `<section>` são permitidos e têm escopo local.
- **Nunca** use `<div className="header">` como substituto de `<header>`.

## Hierarquia de headings

- **Sempre** tenha exatamente um `<h1>` por página/rota, representando o tópico principal.
- **Nunca** pule níveis descendentes (não vá de `<h2>` para `<h4>`). Subir níveis é permitido.
- **Nunca** escolha nível de heading por estilo visual. Use a tag semanticamente correta e estilize via Tailwind.
- **Sempre** mantenha a hierarquia mesmo quando o design oculta o título — use `sr-only` em vez de remover o heading.

## Labels e nomes acessíveis

- **Sempre** associe todo `<input>`, `<select>`, `<textarea>` a um `<label for>` ou envolva-o em `<label>`.
- **Nunca** use `placeholder` como substituto de label.
- **Sempre** use `aria-label` ou `aria-labelledby` apenas quando não há texto visível disponível (ex: ícone-botão).
- **Nunca** aplique `aria-label` em elemento que já tem texto visível equivalente — é redundante e pode conflitar com o accessible name calculation.

## Foco visível e gerenciamento de foco

- **Sempre** mantenha indicador de foco visível em todo elemento interativo. Contraste do anel de foco ≥ 3:1 contra o fundo adjacente.
- **Nunca** use `outline: none` sem substituir por outro indicador visual de foco igualmente ou mais visível (`:focus-visible` com `ring`).
- **Sempre** garanta ordem de foco lógica (segue o fluxo visual de leitura).
- **Nunca** use `tabindex` positivo (`tabindex="1"`, `"2"` etc). Use apenas `tabindex="0"` (focável na ordem natural) ou `tabindex="-1"` (focável programaticamente, fora do tab order).
- **Sempre** restaure foco para o elemento que abriu um overlay/diálogo quando ele fecha.
- **Sempre** aplique focus trap em modais bloqueantes (dialog), e **nunca** em popovers não-bloqueantes ou em conteúdo de página normal.

## Skip links

- **Sempre** forneça um "Skip to main content" como primeiro elemento focável da página.
- **Sempre** mantenha o skip link visualmente oculto até receber foco (`sr-only focus:not-sr-only`), nunca apenas com `display: none`.

## Contraste e cor

- **Sempre** atinja contraste mínimo 4.5:1 para texto normal e 3:1 para texto grande (≥18pt regular ou ≥14pt bold) e para componentes de UI / gráficos informativos.
- **Nunca** transmita informação apenas por cor (estado de erro precisa de texto/ícone além da cor vermelha; gráfico precisa de padrões além de cores).
- **Sempre** verifique contraste contra o token de design system real, não contra um valor hardcoded em PR.
- **Nunca** assuma que o tema padrão é suficiente — valide modos claro e escuro independentemente.

## Imagens, ícones e mídia

- **Sempre** forneça `alt` em toda `<img>`. Se a imagem é puramente decorativa, use `alt=""` (vazio, sem omitir o atributo).
- **Nunca** repita o texto adjacente no alt (alt redundante polui leitor de tela).
- **Sempre** dê nome acessível a ícone interativo (`aria-label` no botão, ou texto `sr-only`, ou `<title>` em SVG inline com `role="img"`).
- **Sempre** marque ícones decorativos com `aria-hidden="true"` para esconder do leitor de tela.
- **Nunca** use autoplay com áudio. Vídeos sem áudio podem auto-iniciar mas com controle de pausa visível.

## Formulários

- **Sempre** descreva mensagens de erro via `aria-describedby` apontando para o nó da mensagem, e marque o campo com `aria-invalid="true"` quando há erro.
- **Sempre** apresente instruções e formato esperado **antes** do campo, não apenas após erro.
- **Sempre** marque campos obrigatórios com `required` (e visualmente com indicação textual além do asterisco).
- **Nunca** confie apenas em validação client-side para acessibilidade — o foco precisa ir para o primeiro erro ou para um resumo de erros no submit falho.
- **Sempre** agrupe campos relacionados com `<fieldset>` + `<legend>` (grupos de radio, checkboxes correlatos).

## Live regions e mudanças dinâmicas

- **Sempre** anuncie mudanças importantes via `aria-live="polite"` para informações não urgentes e `aria-live="assertive"` (ou `role="alert"`) para erros e alertas urgentes.
- **Nunca** use `assertive` para conteúdo trivial — interrompe a leitura em curso e degrada UX.
- **Sempre** use `role="status"` para feedback de operações concluídas e `role="alert"` para erros que exigem atenção imediata.
- **Sempre** anuncie mudanças de rota em SPA (Next.js client-side navigation) — o leitor de tela não detecta automaticamente.
- **Sempre** comunique estados de loading e streaming (geração de LLM, fetch em progresso) via texto acessível, não apenas spinner visual.

## Navegação por teclado

- **Sempre** garanta que toda funcionalidade alcançável por mouse também seja alcançável por teclado.
- **Sempre** suporte as teclas convencionais: `Tab`/`Shift+Tab` (navegação), `Enter`/`Space` (ativação de botão), `Esc` (fechar overlay), setas (navegação em listbox, menu, tabs, slider).
- **Nunca** capture `Tab` para navegar dentro de componente customizado — `Tab` sempre move foco entre componentes; navegação interna usa setas.
- **Nunca** crie atalho de teclado de uma única letra sem permitir desabilitar ou remapear (WCAG 2.1.4).

## Preferências do sistema

- **Sempre** respeite `prefers-reduced-motion: reduce`: desabilite animações não essenciais, transitions longas e parallax.
- **Sempre** respeite `prefers-color-scheme` como sinal inicial de tema, sem forçar override sem ação do usuário.
- **Nunca** force animação infinita ou auto-rolagem sem mecanismo de pausa.

## Target size (WCAG 2.2)

- **Sempre** garanta área de toque mínima de 24×24 CSS px para alvos interativos (WCAG 2.2 AA — critério 2.5.8).
- **Sempre** prefira 44×44 CSS px em interfaces touch primárias.
- **Nunca** posicione alvos pequenos colados uns aos outros sem espaçamento suficiente.

## Gestos e arrastar

- **Sempre** forneça alternativa de clique simples para toda funcionalidade baseada em arrastar (drag-and-drop precisa de fallback teclado/clique).
- **Sempre** forneça alternativa para gesto multi-toque ou path-based (pinch, swipe) via controle de ponto único.

## Idioma do documento

- **Sempre** declare `lang` no `<html>` raiz com o idioma primário do conteúdo.
- **Sempre** marque trechos em outro idioma com `<span lang="...">` inline.
- Para política completa de i18n e RTL, ver `@.contexts/engineering/rules/internationalization.md`.

## Tabelas de dados

- **Sempre** use `<table>` apenas para dados tabulares, nunca para layout.
- **Sempre** use `<th>` com `scope="col"` ou `scope="row"` para cabeçalhos.
- **Sempre** forneça `<caption>` descritiva ou `aria-labelledby` em toda tabela de dados.

## Conteúdo gerado por LLM

- **Sempre** anuncie início e fim de geração de LLM via live region (`aria-live="polite"` em container de status).
- **Sempre** torne o conteúdo streamado lido de forma incremental sem reverter foco a cada token — atualize o nó textual, não recrie o DOM.
- **Sempre** forneça botão de "parar geração" focável e operável por teclado.
- **Nunca** entregue resposta de IA sem mecanismo de cópia/leitura acessível.

## Captcha, timeouts e bloqueios

- **Sempre** forneça alternativa não-visual a captcha visual (áudio, lógica, fluxo alternativo).
- **Sempre** permita ao usuário estender, ajustar ou desabilitar timeouts de sessão quando aplicável.
- **Nunca** invalide entrada do usuário silenciosamente por timeout sem aviso prévio com opção de extensão.

## Componentes de biblioteca

- **Sempre** parta de primitivas Radix UI / shadcn como base — elas já trazem a11y correta na maior parte dos casos. Ver `@.contexts/engineering/stacks/frontend/radix-ui.md` e `@.contexts/engineering/stacks/frontend/shadcn-ui.md`.
- **Nunca** assuma a11y correta sem verificar — composição customizada pode quebrar comportamento padrão (ex: `asChild` mal aplicado, slot perdendo `aria-*`).
- **Nunca** reimplemente Dialog, Popover, Combobox, Listbox, Tabs, Tooltip do zero quando Radix oferece a primitiva.

## Testes

- **Sempre** rode `axe-core` (via `@axe-core/react` em dev, `vitest-axe` em testes) em toda página/componente novo.
- **Sempre** execute pelo menos uma rodada manual teclado-only por feature.
- **Sempre** valide com leitor de tela (NVDA no Windows, VoiceOver no macOS/iOS, TalkBack no Android) em fluxos críticos.
- **Nunca** trate axe pass como suficiente — ferramentas automatizadas detectam ~30-40% dos problemas reais.

## Anti-patterns proibidos

- `<div onClick>` sem `role="button"` + `tabindex="0"` + handler de `Enter`/`Space` — e ainda assim, refatore para `<button>`.
- `outline: none` ou `outline: 0` sem substituição visível via `:focus-visible`.
- `placeholder` usado como única indicação de label.
- `autoplay` com áudio em vídeo ou áudio.
- Contraste hardcoded em PR sem referência a token de design system.
- `aria-label` redundante em elemento com texto visível idêntico ou equivalente.
- `aria-hidden="true"` em elemento focável (cria foco fantasma).
- `tabindex` com valor positivo.
- Modal sem focus trap; popover não-bloqueante com focus trap.
- Ícone interativo sem nome acessível.
- Mensagem de erro de formulário sem `aria-describedby` no campo afetado.
- Rota mudada em SPA sem anúncio para leitor de tela.
- Animação infinita sem respeito a `prefers-reduced-motion`.
- Alvo de toque menor que 24×24 CSS px.
- Drag-and-drop sem alternativa via clique/teclado.
- Skip link implementado mas escondido com `display: none` (some também do foco).
- Heading escolhido por tamanho visual em vez de nível semântico.
- Múltiplos `<h1>` na mesma página.
- `<table>` usada para layout.

## Referências cruzadas

- `@.contexts/engineering/rules/internationalization.md` — `lang`, RTL, formatação locale-aware.
- `@.contexts/engineering/stacks/frontend/radix-ui.md` — primitivas com a11y built-in.
- `@.contexts/engineering/stacks/frontend/shadcn-ui.md` — composição correta de primitivas.
- `@.contexts/engineering/stacks/frontend/react@19.md` — padrões de componente acessível.
- `@.contexts/engineering/stacks/frontend/tailwind@4.md` — `sr-only`, `focus-visible`, `motion-safe`/`motion-reduce`.
