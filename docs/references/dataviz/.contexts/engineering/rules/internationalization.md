# Regras de Internacionalização

Regras imperativas para internacionalização (i18n) e localização (l10n) de aplicações. Governam strings user-facing, formatação locale-aware, direção de leitura, negociação de idioma e conteúdo gerado por LLM. Aplicam-se a todo código que produz output visível ao usuário final em web, e-mail, SMS, push ou voz.

Referências cruzadas: validação de input em @rules/validation, acessibilidade e leitura por screen readers em @rules/accessibility, roteamento i18n e RSC em @stacks/frontend/next@16, hooks e Server Components em @stacks/frontend/react@19.

## Strings user-facing

- Nunca hard-code string user-facing em código. Toda string visível ao usuário passa por função de tradução (`t('key')` ou equivalente).
- Nunca use a string em inglês como chave. Use chaves semânticas, descritivas e namespaced por feature ou contexto (`checkout.payment.error.cardDeclined`, não `"Your card was declined"`).
- Nunca reuse a mesma chave em contextos diferentes para "economizar tradução". Mesma palavra em inglês pode ter traduções diferentes em outros idiomas dependendo do contexto, gênero ou função sintática.
- Nunca concatene fragmentos traduzidos para formar uma frase. Use uma única chave com placeholders interpolados.
- Sempre passe variáveis via interpolação tipada com placeholders nomeados (`{userName}`, `{count}`), nunca via concatenação de string ou template literal misturando partes traduzidas.
- Nunca embuta HTML cru em strings traduzidas. Use formatação rica (rich text components) que recebe a estrutura como argumento e deixa o tradutor controlar apenas o texto.
- Nunca dependa da ordem das palavras da língua source. A tradução pode reordenar placeholders livremente.
- Sempre forneça contexto para o tradutor: descrição da chave, screenshot quando relevante, max-length quando há restrição de UI, exemplo de uso. Comentários ao lado da chave no arquivo de mensagens são obrigatórios quando a chave é ambígua isoladamente.

## ICU MessageFormat

- Sempre use ICU MessageFormat para plurais, seleção e formatação inline. Não invente DSL própria.
- Nunca implemente lógica de plural com `if (count === 1)`. Use `plural` do ICU com todas as categorias CLDR (`zero`, `one`, `two`, `few`, `many`, `other`) e deixe a regra de plural ser resolvida pelo runtime por idioma.
- Sempre inclua `other` como fallback em qualquer bloco `plural` ou `select`.
- Use `select` para variação por gênero ou outras categorias discretas, nunca encadeamento de strings condicionais.
- Use `selectordinal` para ordinais ("1st", "2nd", "3rd"), não derive manualmente.

## Formatação locale-aware

- Sempre use a API `Intl` nativa do runtime para formatar datas, números, moedas, percentuais, listas, unidades e tempo relativo. Não introduza bibliotecas paralelas para o que `Intl` já cobre.
- Use `Intl.DateTimeFormat` para datas, `Intl.NumberFormat` para números e moedas, `Intl.ListFormat` para listas em prosa ("A, B e C"), `Intl.RelativeTimeFormat` para tempo relativo ("há 3 dias"), `Intl.Collator` para ordenação, `Intl.PluralRules` quando precisar resolver plural fora de uma mensagem.
- Nunca formate moeda com concatenação manual de símbolo e número. Use `Intl.NumberFormat` com `style: 'currency'` e `currency` explícito.
- Nunca assuma separador decimal ou de milhar. `1,000.50` em en-US é `1.000,50` em pt-BR e `1 000,50` em fr-FR.
- Nunca assuma formato de data. Use `Intl.DateTimeFormat` com `dateStyle` ou opções explícitas; nunca produza `MM/DD/YYYY` cru.
- Sempre passe o locale corrente explicitamente para qualquer construtor `Intl`. Não confie no locale default do runtime.

## Timezone

- Armazene sempre em UTC no banco de dados, logs, eventos e APIs internas. Nunca persista timestamps em fuso local.
- Converta para o fuso do usuário apenas na borda de apresentação (UI, e-mail, SMS).
- Sempre exiba datas com o fuso do usuário, não o fuso do servidor. Resolva o fuso a partir da preferência explícita do usuário; caia para `Intl.DateTimeFormat().resolvedOptions().timeZone` no cliente apenas se não houver preferência.
- Nunca envie strings de data sem timezone ("2026-05-20 10:00") entre cliente e servidor. Use ISO 8601 com offset (`2026-05-20T10:00:00Z`).

## Locale negotiation

- Resolva o locale efetivo nesta ordem de precedência: override explícito na URL > preferência salva no perfil do usuário > cookie de sessão > `Accept-Language` do request > locale default da aplicação.
- Sempre persista a escolha do usuário após negociação inicial, em cookie ou perfil. Não force re-negociação a cada request.
- Sempre exponha um seletor de idioma visível ao usuário. Nunca trave o locale apenas pelo header.
- Sempre tenha um locale source (idioma de origem das mensagens) e um fallback chain explícito (`pt-BR → pt → en`). Nunca exiba a chave crua ao usuário quando uma tradução falta; caia para o próximo locale da cadeia.

## URL strategy

- Codifique o locale na URL por subpath (`/pt-BR/produto`) por padrão. Use subdomínio (`pt.exemplo.com`) apenas quando há requisito de SEO regional forte ou separação de infraestrutura.
- Nunca codifique locale apenas em query string para páginas indexáveis. Crawlers e compartilhamento perdem o contexto.
- Sempre emita `<link rel="alternate" hreflang="...">` para cada variante de idioma da página, incluindo `x-default`.
- Sempre defina `<link rel="canonical">` apontando para a variante canônica do locale corrente, não para a versão source.
- Sempre defina o atributo `lang` no elemento `<html>` com o locale BCP 47 ativo (`<html lang="pt-BR">`).

## Direção de leitura e RTL

- Use exclusivamente CSS logical properties para margens, paddings, bordas e posicionamento (`margin-inline-start`, `padding-block-end`, `inset-inline-start`). Nunca use `left`/`right` ou `margin-left`/`margin-right` em layout que precisa suportar RTL.
- Sempre defina `dir="rtl"` ou `dir="ltr"` no `<html>` baseado no locale ativo. Não confie em heurística do navegador.
- Nunca espelhe ícones direcionais (setas, breadcrumbs, progress) por CSS quando o significado depende de direção. Forneça ícones específicos por direção ou use propriedades logical equivalentes.
- Nunca assuma que texto em RTL e LTR não se mistura. Use marcadores Unicode bidi (`‪`, `‬`) ou `<bdi>` para isolar fragmentos quando necessário.

## Unicode e texto

- Normalize todo input de usuário para forma NFC antes de comparar, armazenar ou hashear. Nunca compare strings Unicode com `===` sem normalização prévia quando o input vem de teclado externo.
- Nunca conte caracteres com `string.length` quando o limite é visual. Use segmentação por grapheme (`Intl.Segmenter` com `granularity: 'grapheme'`) para max-length de UI.
- Nunca use `toUpperCase()` ou `toLowerCase()` sem locale para texto user-facing. Use `toLocaleUpperCase(locale)` e `toLocaleLowerCase(locale)`. Caso clássico: `'i'.toLocaleUpperCase('tr-TR') === 'İ'`.
- Sempre use `Intl.Collator` para ordenação alfabética de strings localizadas. Nunca use `.sort()` cru para listas que o usuário vê.

## Formulários e input

- Aceite formatos numéricos do locale do usuário na entrada (vírgula ou ponto como decimal, separador de milhar opcional). Valide convertendo para forma canônica antes de armazenar.
- Aceite formatos de data do locale na entrada. Não force ISO no usuário; use date pickers locale-aware.
- Trate telefones com `libphonenumber` ou equivalente, armazenando em E.164. Não valide telefone com regex específica de um país.
- Trate endereços como estrutura variável por país. Não force os campos `street, city, state, zip` do modelo norte-americano em todos os países; use schemas de endereço por região quando o produto opera internacionalmente.
- Sempre permita nomes Unicode completos em campos de nome. Nunca limite a `[A-Za-z]` ou ASCII puro.

## Conteúdo gerado por LLM

- Sempre forneça o locale alvo explicitamente no prompt quando o modelo deve responder ao usuário. Nunca confie apenas no idioma do input para o modelo inferir o idioma de saída.
- Sempre valide o idioma da saída do modelo antes de exibir, quando o contrato é "responder em X". Rejeite ou re-gere se o idioma divergir.
- Nunca traduza chaves de mensagem da aplicação via LLM em runtime para o usuário. Traduções de UI passam pelo pipeline de l10n controlado.
- Para conteúdo gerado dinâmico (resumos, descrições), sempre marque o `lang` no HTML do bloco quando o idioma do conteúdo pode divergir do locale da página.

## Comunicação fora do app

- E-mails, SMS, push e notificações são localizados no locale persistido do destinatário no momento do envio, não no locale do remetente nem no locale do request que disparou a notificação.
- Sempre inclua o subject de e-mail no pipeline de tradução. Nunca hard-code subject em código.
- Templates transacionais com placeholders seguem as mesmas regras de ICU MessageFormat do app.

## Pipeline de tradução

- Extraia mensagens automaticamente do código para o catálogo. Não mantenha catálogo escrito à mão paralelo ao código.
- Sempre sincronize com o TMS (translation management system) antes de release. Não envie ao TMS chaves que ainda podem mudar de nome.
- Use pseudo-localização (`[!!! Ëxãmplé tëxt !!!]`) em ambiente de teste para validar overflow de UI, escape de placeholders e cobertura de extração antes de pedir tradução real.
- Sempre teste a UI com locale de maior expansão típica (alemão, finlandês) e com RTL (árabe ou hebraico) antes de release.

## Fallback e ausência

- Sempre defina fallback chain por locale. Chave faltante cai para o próximo locale da cadeia, nunca exibe a chave crua nem string vazia.
- Log warning estruturado quando uma chave cai em fallback em produção. Não falhe silenciosamente.
- Nunca commite arquivo de tradução com chaves faltantes em locales que estão em produção. CI bloqueia o merge.

## Anti-patterns

- Não concatene: `t('greeting') + ' ' + userName`. Use: `t('greeting', { name: userName })`.
- Não use a string em inglês como chave: `t('Welcome back!')`. Use: `t('home.welcomeBack')`.
- Não invente plural: `count === 1 ? t('item') : t('items')`. Use ICU `plural`.
- Não use `left`/`right` em layout que vai pra RTL. Use `inline-start`/`inline-end`.
- Não confie em `Date.toLocaleString()` sem passar locale. Sempre explícito.
- Não armazene timestamp em fuso local. Sempre UTC.
- Não traduza enums de domínio (status de pedido, tipo de evento). Traduza apenas o label exibido derivado do enum.
- Não use bandeiras de país para representar idioma. Idioma não é país (português é falado em vários países, suíça tem quatro idiomas oficiais). Use o nome do idioma no próprio idioma (`Português`, `Deutsch`).
