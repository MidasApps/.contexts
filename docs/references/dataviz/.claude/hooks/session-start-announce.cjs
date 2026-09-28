#!/usr/bin/env node
/**
 * SessionStart + PreCompact bootstrap DDC (inspirado em obra/superpowers).
 * Injeta o skill using-ddc completo + catálogo curto de rules/agents.
 *
 * Formato de saída: Claude Code prefere hookSpecificOutput.additionalContext;
 * fallback additionalContext top-level para harnesses genéricos.
 */
const fs = require('fs');
const path = require('path');

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8')) || {};
} catch {
  /* stdin opcional */
}

const projectDir =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.CLAUDE_PLUGIN_ROOT ||
  path.resolve(__dirname, '../..');

const skillPath = path.join(
  projectDir,
  '.claude',
  'skills',
  'processes',
  'using-ddc',
  'SKILL.md'
);

let skillBody = '';
try {
  skillBody = fs.readFileSync(skillPath, 'utf8');
} catch {
  skillBody =
    '# using-ddc\n\nSkill using-ddc não encontrado em disco. ' +
    'Leia `.contexts/engineering/MEMORY.md` e a rule grounding antes de codar.';
}

const rules =
  'security, validation, error-handling, observability, migration, data-modeling, ' +
  'testing, api-design, grounding, schemas, ai-friendly-code, git, commits, environments';
const agents =
  'tech-lead, full-stack, backend, frontend, data-architect, qa, code-reviewer, devops, ' +
  'ddc-engineering, claude-engineering, claude-agents, claude-rules, claude-skills, claude-hooks';

const catalog =
  `DDC v1.1.1 — Rules sempre-ativas: ${rules}.\n` +
  `Agents: ${agents}.\n` +
  `SSOT: .contexts/ (business | product | engineering). Skills em .claude/skills/ — invoque por demanda; ` +
  `process skills: using-ddc (obrigatória), writing-plans-ddc, verification-before-completion.`;

// Progress ledger tail (resume pós-compact / multi-task)
let ledgerTail = '';
const ledgerPath = path.join(projectDir, '.claude', 'agent-memory', 'progress.md');
try {
  if (fs.existsSync(ledgerPath)) {
    const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/);
    const entries = lines.filter((l) => /^\s*-\s+\d{4}-\d{2}-\d{2}\s*\|/.test(l));
    if (entries.length) {
      const tail = entries.slice(-8);
      ledgerTail =
        '\n\n## Progress ledger (tail — do not re-dispatch completed tasks)\n' +
        'File: `.claude/agent-memory/progress.md`\n' +
        tail.join('\n');
    }
  }
} catch {
  /* ignore */
}

const additionalContext =
  '<EXTREMELY_IMPORTANT>\n' +
  'You are operating under DDC. The following is the full content of the ' +
  '**using-ddc** skill — your bootstrap for respecting .contexts as single source of truth. ' +
  'For other skills, load them on demand (Skill tool or Read SKILL.md).\n\n' +
  skillBody +
  '\n</EXTREMELY_IMPORTANT>\n\n' +
  catalog +
  ledgerTail;

// Claude Code: nested hookSpecificOutput (evita formato errado silenciosamente).
// Se CLAUDE_PROJECT_DIR está setado, usamos o formato Claude Code.
const useClaudeNested =
  Boolean(process.env.CLAUDE_PROJECT_DIR) || Boolean(process.env.CLAUDECODE);

let payload;
if (useClaudeNested) {
  payload = {
    hookSpecificOutput: {
      // Ecoa o evento real (SessionStart ou PreCompact) — hookEventName deve
      // bater com o evento que disparou o hook.
      hookEventName: input.hook_event_name || 'SessionStart',
      additionalContext,
    },
  };
} else {
  payload = { additionalContext };
}

process.stdout.write(JSON.stringify(payload));
process.exit(0);
