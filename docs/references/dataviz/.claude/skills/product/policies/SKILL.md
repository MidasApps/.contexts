---
name: policies
description: Use em features que tocam dados de usuário, formulários, onboarding, consentimento. Keywords: policies, privacy, onboarding.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Product Policies

Regras de produto que afetam UX, dados de usuário, consentimento, retenção, comunicação. Não são leis (jurídico), mas como produto operacionaliza obrigações e princípios.

## Essência
Conteúdo típico de um documento de policies (ver `@`):
- **Privacy:** quais dados coleta, finalidade, base legal (LGPD/GDPR), retenção, direito de acesso/correção/exclusão. Privacy by design.
- **Consent:** quando pedir consent explícito (cookies não-essenciais, marketing, sharing com terceiros), versionamento, banner UX, revogação.
- **Onboarding flow:** dados obrigatórios vs opcionais, validações, anti-friction, gates de progresso.
- **Communication policy:** o que enviar por email/push, frequência, opt-in/opt-out, transactional vs marketing.
- **Account lifecycle:** signup → verificação → ativação → inativação → exclusão. Soft-delete vs hard-delete, prazo.
- **Data retention:** quanto tempo guardar cada categoria (logs, eventos, conteúdo do usuário); auto-purge.
- **Data export / portability:** formato, escopo, prazo de entrega.
- **Content moderation** (se UGC): linhas de aceitação, processo de report, sanção.
- **Acceptable use:** o que usuário não pode fazer; abuso → ação.
- **Acessibilidade:** níveis-alvo (WCAG AA), processo de checagem (ver rule `accessibility`).
- **Localization:** idiomas/regions suportados; texto canônico em qual idioma.

## Procedimento mínimo
1. Ler `@` para policy atual antes de feature que toca usuário/dado.
2. Form/onboarding novo: verificar campos obrigatórios, validação, consent quando aplicável.
3. Comunicação nova (email/push): classificar (transactional vs marketing), respeitar opt-out.
4. Coletar dado novo: justificar finalidade, definir retenção, atualizar política se exposto ao usuário.
5. Exclusão de conta: garantir que dado vai mesmo (incluindo backups conforme política).

## Anti-patterns
- Coletar "porque pode ser útil depois" → violando minimização; só colete com finalidade.
- Dark pattern em consent (pre-marcado, "decline" escondido) → reputational + legal.
- Sem registro de versão do consent → não dá pra provar quem aceitou o quê quando.
- "Soft-delete" sem timeline de hard-delete → dado vive para sempre.

## Mini-exemplo
Documento típico estruturado em: Privacy & Data; Consent; Onboarding; Communications; Account Lifecycle; Retention; Export; Moderation; Acceptable Use; Accessibility; Localization. Cada seção com regras explícitas + processo de revisão. Versionado em `@.contexts/product/policies.md`.

---
**Detalhes/convenções específicas do projeto:** `@.contexts/product/policies.md`
