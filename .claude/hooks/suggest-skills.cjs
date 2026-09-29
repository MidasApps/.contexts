#!/usr/bin/env node
/**
 * Dual-mode, não-bloqueante:
 *  - PostToolUse(Edit|Write): path → skills + @.contexts sugeridos
 *  - UserPromptSubmit: keywords → skills + @.contexts
 *
 * Saída: só `hookSpecificOutput.additionalContext`, o campo que chega ao Claude
 * (`systemMessage` iria só ao usuário e repetiria a dica a cada edição).
 * Paths são relativos ao projeto: o diretório do projeto pode se chamar `.contexts`.
 * Toda skill citada aqui tem que existir como
 * `name:` em `.claude/skills/**\/SKILL.md`; todo `@.contexts/...` tem que existir em disco.
 */
const fs = require('fs');

const E = '@.contexts/engineering';
const ADR_0004 = `${E}/decisions/0004-latest-stable-baseline-and-documented-exceptions.md`;

// [regex sobre o path normalizado com "/", skills, contexts]
const PATH_RULES = [
  [/\.(tsx|jsx)$/, ['react-19', 'next-16'], [`${E}/stacks/frontend/react@19.md`, `${E}/stacks/frontend/next@16.md`]],
  [/\.tsx?$/, ['typescript-7'], [`${E}/stacks/language/typescript@7.md`]],
  [/(^|\/)(package\.json|\.nvmrc|\.node-version|Dockerfile[^/]*)$/, ['node-26'], [`${E}/stacks/runtime/node@26.md`, `${E}/MEMORY.md`]],
  [/(^|\/)functions\/|(^|\/)firebase\.json$/, ['firebase-functions', 'node-26'], [`${E}/stacks/backend/firebase-functions.md`, `${ADR_0004} (E1: Functions em nodejs24)`]],
  [/firestore/i, ['database-firebase-firestore', 'contracts-firebase-firestore'], [`${E}/contracts/firebase-firestore.md`, `${E}/stacks/database/firebase-firestore.md`]],
  [/\/migrations?\/|\.sql$/, ['database-postgres', 'contracts-postgres'], [`${E}/contracts/postgres.md`, `${E}/rules/migration.md`, `${E}/stacks/database/postgres.md`]],
  [/bigquery|\.bq\./i, ['database-bigquery', 'contracts-bigquery'], [`${E}/contracts/bigquery.md`, `${E}/stacks/database/bigquery.md`]],
  [/pgvector|embedding/i, ['database-pgvector', 'contracts-pgvector'], [`${E}/contracts/pgvector.md`, `${E}/stacks/database/pgvector.md`]],
  [/tailwind|\.css$/, ['tailwind-4'], [`${E}/stacks/frontend/tailwind@4.md`]],
  [/(^|\/)(components\/ui|shared\/ui)\//, ['shadcn-ui', 'radix-ui', 'atomic-design'], [`${E}/stacks/frontend/shadcn-ui.md`, `${E}/stacks/frontend/radix-ui.md`, `${E}/architecture/atomic-design.md`]],
  [/(^|\/)src\/(views|widgets|features|entities|shared)\//, ['fsd'], [`${E}/architecture/fsd.md`]],
  [/(^|\/)src\/services\//, ['feature-based', 'hexagonal'], [`${E}/architecture/feature-based.md`, `${E}/architecture/hexagonal.md`]],
  [/(^|\/)use-[a-z0-9-]+-store\.tsx?$/, ['zustand-5'], [`${E}/stacks/state/zustand@5.md`, `${E}/rules/state-management.md`]],
  [/\.test\.tsx?$/, ['vitest', 'tdd'], [`${E}/rules/testing.md`, `${E}/stacks/testing/vitest.md`]],
  [/(^|\/)e2e\/|\.spec\.ts$|playwright/i, ['playwright'], [`${E}/stacks/testing/playwright.md`]],
  [/\.schema\.ts$|(^|\/)contracts\/|zod/i, ['zod-4'], [`${E}/stacks/validation/zod@4.md`, `${E}/contracts/schemas.md`, `${E}/rules/validation.md`]],
  [/\/api\/|(^|\/)route\.ts$|(^|\/)actions?\.ts$/, ['api', 'zod-4'], [`${E}/rules/api-design.md`, `${E}/contracts/api.md`]],
  [/(^|\/)events?\/|outbox/i, ['events'], [`${E}/contracts/events.md`]],
  [/(^|\/)\.env(\.[a-z]+)?$|secret/i, ['secrets'], [`${E}/contracts/secrets.md`, `${E}/processes/environments.md`]],
  [/mastra/i, ['mastra-sdk'], [`${E}/stacks/ai/mastra-sdk.md`]],
  [/(^|\/)(ai|llm|prompts?)\//, ['vercel-ai-sdk', 'harness-engineering'], [`${E}/stacks/ai/vercel-ai-sdk.md`, `${E}/stacks/ai/harness-engineering.md`]],
  [/(^|\/)\.github\/workflows\//, ['deploy', 'node-26'], [`${E}/processes/deploy.md`, `${E}/stacks/runtime/node@26.md`]],
];

// [regex sobre o prompt em minúsculas, skills, contexts]
const PROMPT_RULES = [
  [/\bpostgres|\bpsql\b/, ['database-postgres', 'contracts-postgres'], [`${E}/stacks/database/postgres.md`, `${E}/contracts/postgres.md`]],
  [/\bfirestore\b/, ['database-firebase-firestore', 'contracts-firebase-firestore'], [`${E}/contracts/firebase-firestore.md`, `${E}/stacks/database/firebase-firestore.md`]],
  [/\bfirebase\b|\bcloud functions?\b/, ['firebase-functions'], [`${E}/stacks/backend/firebase-functions.md`, `${ADR_0004} (E1: Functions em nodejs24)`]],
  [/\bnode(\.?js)?\b|\bnodejs\b|\bdockerfile\b|\bnvmrc\b/, ['node-26'], [`${E}/stacks/runtime/node@26.md`, ADR_0004]],
  [/\bbigquery\b/, ['database-bigquery', 'contracts-bigquery'], [`${E}/contracts/bigquery.md`, `${E}/stacks/database/bigquery.md`]],
  [/\bpgvector\b|\bembeddings?\b/, ['database-pgvector', 'contracts-pgvector'], [`${E}/contracts/pgvector.md`, `${E}/stacks/database/pgvector.md`]],
  [/\b(endpoint|api|pagina(c|ç)(a|ã)o|rest|route handler)\b/, ['api', 'zod-4', 'using-ddc'], [`${E}/rules/api-design.md`, `${E}/contracts/api.md`, `${E}/MEMORY.md`]],
  [/\b(schema|migra(c|ç)(a|ã)o|migration)\b/, ['contracts-postgres', 'zod-4', 'using-ddc'], [`${E}/rules/migration.md`, `${E}/rules/data-modeling.md`, `${E}/contracts/schemas.md`]],
  [/\bzod\b|\bvalida(c|ç)(a|ã)o\b/, ['zod-4'], [`${E}/stacks/validation/zod@4.md`, `${E}/rules/validation.md`]],
  [/\bzustand\b|\bstore\b/, ['zustand-5'], [`${E}/stacks/state/zustand@5.md`, `${E}/rules/state-management.md`]],
  [/\btailwind\b/, ['tailwind-4'], [`${E}/stacks/frontend/tailwind@4.md`]],
  [/\bshadcn\b/, ['shadcn-ui'], [`${E}/stacks/frontend/shadcn-ui.md`]],
  [/\bradix\b/, ['radix-ui'], [`${E}/stacks/frontend/radix-ui.md`]],
  [/\b(ai sdk|vercel ai|streamtext|generatetext|usechat)\b/, ['vercel-ai-sdk'], [`${E}/stacks/ai/vercel-ai-sdk.md`]],
  [/\bmastra\b/, ['mastra-sdk'], [`${E}/stacks/ai/mastra-sdk.md`]],
  // `.claude/`, `CLAUDE.md` e "Claude Code" falam do harness, não do provider.
  [/\banthropic\b|(?<![.\/\w-])claude\b(?![\s-]*(code|\.md|\.ai))/, ['anthropic', 'anthropic-sdk'], [`${E}/stacks/ai/anthropic.md`, `${E}/stacks/ai/anthropic-sdk.md`]],
  [/\b(openai|gpt)\b/, ['openai', 'openai-sdk'], [`${E}/stacks/ai/openai.md`, `${E}/stacks/ai/openai-sdk.md`]],
  [/\b(gemini|genai|vertex)\b/, ['gemini', 'google-genai-sdk'], [`${E}/stacks/ai/gemini.md`, `${E}/stacks/ai/google-genai-sdk.md`]],
  [/\b(llm|rag|evals?|harness[- ]engineering|ai harness)\b/, ['harness-engineering'], [`${E}/stacks/ai/harness-engineering.md`]],
  [/\bvitest\b|\bunit test/, ['vitest'], [`${E}/stacks/testing/vitest.md`, `${E}/rules/testing.md`]],
  [/\bplaywright\b|\be2e\b/, ['playwright'], [`${E}/stacks/testing/playwright.md`]],
  [/\b(eventos?|events?|outbox|pub\/?sub)\b/, ['events'], [`${E}/contracts/events.md`]],
  [/\b(secrets?|segredos?|api key)\b/, ['secrets'], [`${E}/contracts/secrets.md`]],
  [/\brollback\b/, ['rollback'], [`${E}/processes/rollback.md`]],
  [/\bdeploy\b/, ['deploy'], [`${E}/processes/deploy.md`]],
  [/\bprodu(ç|c)(ã|a)o caiu|\bincidente\b|\boutage\b/, ['monitoring', 'rollback'], [`${E}/processes/monitoring.md`, `${E}/processes/rollback.md`]],
  [/\brelease\b/, ['release'], [`${E}/processes/release.md`]],
  [/\bpull request|\babrir pr\b/, ['pull-requests'], [`${E}/processes/pull-requests.md`]],
  [/\bcommits?\b/, [], [`${E}/processes/commits.md`]],
  [/\bbranch\b/, [], [`${E}/processes/git.md`]],
  [/\b(next\.?js|next 16|app router)\b/, ['next-16', 'using-ddc'], [`${E}/stacks/frontend/next@16.md`]],
  [/\breact\b/, ['react-19'], [`${E}/stacks/frontend/react@19.md`]],
  [/\b(typescript|ts 7)\b/, ['typescript-7'], [`${E}/stacks/language/typescript@7.md`]],
  [/\btdd\b/, ['tdd', 'vitest'], [`${E}/practices/tdd.md`, `${E}/rules/testing.md`]],
  [/\bbdd\b/, ['bdd'], [`${E}/practices/bdd.md`]],
  [/\bsdd\b|\bspec[- ]driven\b/, ['sdd', 'using-ddc'], [`${E}/practices/sdd.md`]],
  [/\badr\b|\bdecis(ã|a)o arquitetural\b/, ['decisions'], [`${E}/decisions/README.md`]],
  [/\bddd\b|\bdomain[- ]driven\b/, ['ddd'], [`${E}/architecture/ddd.md`]],
  [/\bhexagonal\b|\bports?[- ]and[- ]adapters?\b/, ['hexagonal'], [`${E}/architecture/hexagonal.md`]],
  [/\bfsd\b|\bfeature[- ]sliced\b/, ['fsd'], [`${E}/architecture/fsd.md`]],
  [/\bclean architecture\b/, ['clean-architecture'], [`${E}/architecture/clean-architecture.md`]],
  [/\batomic design\b/, ['atomic-design'], [`${E}/architecture/atomic-design.md`]],
  [/\b(feature|tela|p(á|a)gina|componente|endpoint|implement|crie|cria)\b/, ['using-ddc'], [`${E}/MEMORY.md`, 'using-ddc: classifique e leia SSOT antes de codar']],
  [/\b(plano|plan|implementation plan|escreva o plano|multi[- ]step)\b/, ['writing-plans-ddc', 'using-ddc', 'sdd'], [`${E}/MEMORY.md`, 'docs/plans/ — planos efêmeros com Global Constraints']],
  [/\b(pronto|done|completo|testes passam|verif(ique|icar)|ship)\b/, ['verification-before-completion', 'using-ddc'], ['Evidência fresca obrigatória antes de claim']],
];

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const emit = (eventName, message) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: message } }));
  process.exit(0);
};

// Remove o prefixo do projeto (case-insensitive, por causa do Windows).
const relativize = (filePath, root) => {
  const fp = String(filePath).replace(/\\/g, '/');
  const base = String(root || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (base && fp.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return fp.slice(base.length + 1);
  return fp;
};

const collect = (rules, subject) => {
  const skills = [];
  const contexts = [];
  for (const [re, s, c] of rules) {
    if (re.test(subject)) {
      skills.push(...s);
      contexts.push(...c);
    }
  }
  return { skills: uniq(skills), contexts: uniq(contexts) };
};

// Dica curta: acima disso vira ruído e o Claude ignora.
const MAX_SKILLS = 6;
const MAX_CONTEXTS = 6;

const format = ({ skills, contexts }) => {
  const parts = [];
  if (skills.length) parts.push(`Skills: ${skills.slice(0, MAX_SKILLS).join(', ')}`);
  if (contexts.length) parts.push(`Contexts: ${contexts.slice(0, MAX_CONTEXTS).join(', ')}`);
  return parts.join(' · ');
};

// Edição no próprio SSOT/harness: só lembra a doutrina de não duplicar.
const suggestForHarness = (fp) => {
  if (/(^|\/)\.contexts\//.test(fp)) {
    return { skills: ['using-ddc', 'decisions'], contexts: [`${E}/MEMORY.md`, `${E}/rules/governance.md`] };
  }
  if (/(^|\/)\.claude\/(rules|skills|agents|hooks)\//.test(fp) || /(^|\/)(CLAUDE\.md|\.claude\/settings\.json)$/.test(fp)) {
    return {
      skills: ['using-ddc'],
      contexts: ['Agent claude-engineering / ddc-engineering — não duplicar doutrina de .contexts'],
    };
  }
  return null;
};

const handlePath = (filePath, root) => {
  const fp = relativize(filePath, root);
  const found = suggestForHarness(fp) || collect(PATH_RULES, fp);
  if (!found.skills.length && !found.contexts.length) process.exit(0);
  if (!found.skills.includes('using-ddc')) found.skills.push('using-ddc');
  emit('PostToolUse', `${format(found)} (path: ${fp}). Respeite using-ddc: leia SSOT antes de mais edits.`);
};

const handlePrompt = (rawPrompt) => {
  const prompt = String(rawPrompt || '').toLowerCase();
  if (!prompt) process.exit(0);
  // Notificações de subagent/tarefa chegam como prompt mas não são pedido do usuário.
  if (/^\s*<(task-notification|system-reminder|local-command|command-name)/.test(prompt)) process.exit(0);
  const found = collect(PROMPT_RULES, prompt);
  if (!found.skills.length && !found.contexts.length) process.exit(0);
  emit('UserPromptSubmit', `${format(found)}. Aplique using-ddc: Read nos paths @.contexts antes de Write em app.`);
};

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const event = input.hook_event_name || '';
  const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';

  if (event === 'UserPromptSubmit' || (!event && input.prompt)) handlePrompt(input.prompt);
  if (filePath) handlePath(filePath, process.env.CLAUDE_PROJECT_DIR || input.cwd);
  process.exit(0);
} catch {
  process.exit(0);
}
