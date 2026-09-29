#!/usr/bin/env node
/**
 * Dual-mode (não-bloqueante via systemMessage):
 *  - PostToolUse(Edit|Write): path → skills + @.contexts sugeridos
 *  - UserPromptSubmit: keywords → skills + @.contexts
 */
const fs = require('fs');

function emit(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const event = input.hook_event_name || input.event || '';

  // --- PostToolUse: path -> skill + contexts ---
  const filePath =
    (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) ||
    '';
  const isPostPath =
    event === 'PostToolUse' ||
    (filePath && event !== 'UserPromptSubmit');

  if (isPostPath && filePath) {
    const fp = String(filePath).replace(/\\/g, '/');
    const skills = [];
    const contexts = [];

    if (/\.(tsx|jsx)$/.test(fp)) {
      skills.push('react-19', 'next-16', 'using-ddc');
      contexts.push(
        '@.contexts/engineering/stacks/frontend/react@19.md',
        '@.contexts/engineering/stacks/frontend/next@16.md'
      );
    }
    if (/\.ts$/.test(fp) && !/\.(test|spec)\.ts$/.test(fp)) {
      skills.push('typescript-7', 'using-ddc');
      contexts.push('@.contexts/engineering/stacks/language/typescript@7.md');
    }
    if (/\/migrations?\//.test(fp) || /\.sql$/.test(fp)) {
      skills.push('database-postgres', 'contracts-postgres');
      contexts.push(
        '@.contexts/engineering/contracts/postgres.md',
        '@.contexts/engineering/rules/migration.md',
        '@.contexts/engineering/stacks/database/postgres.md'
      );
    }
    if (/firestore|firebase/i.test(fp)) {
      skills.push('database-firebase-firestore', 'firebase-functions');
      contexts.push(
        '@.contexts/engineering/contracts/firebase-firestore.md',
        '@.contexts/engineering/stacks/database/firebase-firestore.md'
      );
    }
    if (/bigquery|\.bq\./i.test(fp)) {
      skills.push('database-bigquery', 'contracts-bigquery');
      contexts.push('@.contexts/engineering/contracts/bigquery.md');
    }
    if (/pgvector|embedding/i.test(fp)) {
      skills.push('database-pgvector', 'contracts-pgvector');
      contexts.push('@.contexts/engineering/contracts/pgvector.md');
    }
    if (/tailwind|\.css$/.test(fp)) {
      skills.push('tailwind-4');
      contexts.push('@.contexts/engineering/stacks/frontend/tailwind@4.md');
    }
    if (/\.test\.|\.spec\./.test(fp)) {
      skills.push('vitest', 'tdd');
      contexts.push(
        '@.contexts/engineering/rules/testing.md',
        '@.contexts/engineering/stacks/testing/vitest.md'
      );
    }
    if (/e2e|playwright/i.test(fp)) {
      skills.push('playwright');
      contexts.push('@.contexts/engineering/stacks/testing/playwright.md');
    }
    if (/zod|schema/i.test(fp)) {
      skills.push('zod-4');
      contexts.push(
        '@.contexts/engineering/stacks/validation/zod@4.md',
        '@.contexts/engineering/contracts/schemas.md',
        '@.contexts/engineering/rules/validation.md'
      );
    }
    if (/\/api\/|route\.ts$|actions?\.ts$/.test(fp)) {
      skills.push('api', 'zod-4');
      contexts.push(
        '@.contexts/engineering/rules/api-design.md',
        '@.contexts/engineering/contracts/api.md'
      );
    }

    // Edições no SSOT / harness
    if (/\.contexts\//.test(fp) || /\/contexts\//.test(fp)) {
      skills.push('using-ddc', 'decisions');
      contexts.push('@.contexts/engineering/MEMORY.md', '@.contexts/engineering/rules/governance.md');
    }
    if (/\.claude\/(rules|skills|agents|hooks)\//.test(fp)) {
      skills.push('using-ddc');
      contexts.push(
        'Agent claude-engineering / ddc-engineering — não duplicar doutrina de .contexts'
      );
    }

    if (skills.length || contexts.length) {
      const parts = [];
      if (skills.length) parts.push(`Skills: ${uniq(skills).join(', ')}`);
      if (contexts.length) parts.push(`Contexts: ${uniq(contexts).join(', ')}`);
      emit(`${parts.join(' · ')} (path: ${fp}). Respeite using-ddc: leia SSOT antes de mais edits.`);
    }
    process.exit(0);
  }

  // --- UserPromptSubmit: keyword scan ---
  const prompt = String(input.prompt || input.user_prompt || '').toLowerCase();
  if (!prompt) process.exit(0);

  const map = [
    [
      /\bpostgres|psql\b/,
      {
        skills: ['database-postgres', 'contracts-postgres', 'using-ddc'],
        contexts: [
          '@.contexts/engineering/stacks/database/postgres.md',
          '@.contexts/engineering/contracts/postgres.md',
        ],
      },
    ],
    [
      /\bfirestore|firebase\b/,
      {
        skills: ['database-firebase-firestore', 'firebase-functions', 'using-ddc'],
        contexts: [
          '@.contexts/engineering/contracts/firebase-firestore.md',
          '@.contexts/engineering/stacks/backend/firebase-functions.md',
        ],
      },
    ],
    [
      /\bbigquery\b/,
      {
        skills: ['database-bigquery', 'contracts-bigquery'],
        contexts: ['@.contexts/engineering/contracts/bigquery.md'],
      },
    ],
    [
      /\bpgvector|embeddings?\b/,
      {
        skills: ['database-pgvector', 'contracts-pgvector'],
        contexts: ['@.contexts/engineering/contracts/pgvector.md'],
      },
    ],
    [
      /\b(endpoint|api|pagina(c|ç)(a|ã)o|rest|route handler)\b/,
      {
        skills: ['api', 'zod-4', 'using-ddc'],
        contexts: [
          '@.contexts/engineering/rules/api-design.md',
          '@.contexts/engineering/contracts/api.md',
          '@.contexts/engineering/MEMORY.md',
        ],
      },
    ],
    [
      /\b(schema|migra(c|ç)(a|ã)o|migration)\b/,
      {
        skills: ['contracts-postgres', 'zod-4', 'using-ddc'],
        contexts: [
          '@.contexts/engineering/rules/migration.md',
          '@.contexts/engineering/rules/data-modeling.md',
          '@.contexts/engineering/contracts/schemas.md',
        ],
      },
    ],
    [
      /\brollback\b/,
      { skills: ['rollback'], contexts: ['@.contexts/engineering/processes/rollback.md'] },
    ],
    [
      /\bdeploy\b/,
      { skills: ['deploy'], contexts: ['@.contexts/engineering/processes/deploy.md'] },
    ],
    [
      /\bprodu(ç|c)(ã|a)o caiu|incidente|outage\b/,
      {
        skills: ['monitoring', 'rollback'],
        contexts: [
          '@.contexts/engineering/processes/monitoring.md',
          '@.contexts/engineering/processes/rollback.md',
        ],
      },
    ],
    [
      /\brelease\b/,
      { skills: ['release'], contexts: ['@.contexts/engineering/processes/release.md'] },
    ],
    [
      /\bpull request|abrir pr\b/,
      {
        skills: ['pull-requests'],
        contexts: ['@.contexts/engineering/processes/pull-requests.md'],
      },
    ],
    [
      /\b(next\.?js|next 16|app router)\b/,
      {
        skills: ['next-16', 'using-ddc'],
        contexts: ['@.contexts/engineering/stacks/frontend/next@16.md'],
      },
    ],
    [
      /\breact\b/,
      {
        skills: ['react-19'],
        contexts: ['@.contexts/engineering/stacks/frontend/react@19.md'],
      },
    ],
    [
      /\b(typescript|ts 7)\b/,
      {
        skills: ['typescript-7'],
        contexts: ['@.contexts/engineering/stacks/language/typescript@7.md'],
      },
    ],
    [
      /\btdd\b/,
      {
        skills: ['tdd', 'vitest'],
        contexts: ['@.contexts/engineering/practices/tdd.md', '@.contexts/engineering/rules/testing.md'],
      },
    ],
    [
      /\bbdd\b/,
      { skills: ['bdd'], contexts: ['@.contexts/engineering/practices/bdd.md'] },
    ],
    [
      /\bsdd|spec[- ]driven\b/,
      { skills: ['sdd', 'using-ddc'], contexts: ['@.contexts/engineering/practices/sdd.md'] },
    ],
    [
      /\badr|decis(ã|a)o arquitetural\b/,
      {
        skills: ['decisions'],
        contexts: ['@.contexts/engineering/decisions/README.md'],
      },
    ],
    [
      /\bddd|domain[- ]driven\b/,
      { skills: ['ddd'], contexts: ['@.contexts/engineering/architecture/ddd.md'] },
    ],
    [
      /\bhexagonal|ports?[- ]and[- ]adapters?\b/,
      {
        skills: ['hexagonal'],
        contexts: ['@.contexts/engineering/architecture/hexagonal.md'],
      },
    ],
    [
      /\b(feature|tela|p(á|a)gina|componente|endpoint|implement|crie|cria)\b/,
      {
        skills: ['using-ddc'],
        contexts: [
          '@.contexts/engineering/MEMORY.md',
          'using-ddc: classifique e leia SSOT antes de codar',
        ],
      },
    ],
    [
      /\b(plano|plan|implementation plan|escreva o plano|multi[- ]step)\b/,
      {
        skills: ['writing-plans-ddc', 'using-ddc', 'sdd'],
        contexts: [
          '@.contexts/engineering/MEMORY.md',
          'docs/plans/ — planos efêmeros com Global Constraints',
        ],
      },
    ],
    [
      /\b(pronto|done|completo|testes passam|verif(ique|icar)|ship)\b/,
      {
        skills: ['verification-before-completion', 'using-ddc'],
        contexts: ['Evidência fresca obrigatória antes de claim'],
      },
    ],
  ];

  const skills = new Set();
  const contexts = new Set();
  for (const [re, pack] of map) {
    if (re.test(prompt)) {
      pack.skills.forEach((s) => skills.add(s));
      pack.contexts.forEach((c) => contexts.add(c));
    }
  }

  if (skills.size || contexts.size) {
    const parts = [];
    if (skills.size) parts.push(`Skills: ${[...skills].join(', ')}`);
    if (contexts.size) parts.push(`Contexts: ${[...contexts].join(', ')}`);
    const message = `${parts.join(' · ')}. Aplique using-ddc: Read nos paths @.contexts antes de Write em app.`;
    // UserPromptSubmit é síncrono: systemMessage só aparece para o usuário.
    // additionalContext é o campo documentado para chegar ao Claude.
    process.stdout.write(
      JSON.stringify({
        systemMessage: message,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: message,
        },
      })
    );
  }
  process.exit(0);
} catch {
  process.exit(0);
}
