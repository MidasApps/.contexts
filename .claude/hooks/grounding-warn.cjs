#!/usr/bin/env node
/**
 * Stop hook (não-bloqueante): se o turn atual teve Edit/Write em código de app
 * e nenhuma tool leu `.contexts/`, emite systemMessage lembrando using-ddc.
 *
 * O payload do Stop NÃO traz histórico de tools; ele traz `transcript_path`
 * (JSONL). Lemos o transcript a partir da última mensagem real do usuário.
 * Heurística best-effort: sem transcript legível, sai em silêncio (sem falso positivo).
 */
const fs = require('fs');

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const APP_PATH = /(^|\/)(src|app|functions|packages|lib|server|api|e2e)\/[^"']+\.(ts|tsx|js|jsx|mjs|cjs|sql)$/;
const HARNESS_PATH = /(^|\/)(\.claude|\.contexts|docs)\//;

const readLines = (p) => {
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
};

const parse = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

// Prompt real do usuário: role user sem tool_result (tool results também chegam como "user").
const isUserPrompt = (entry) => {
  const msg = entry && entry.type === 'user' && entry.message;
  if (!msg || entry.isSidechain) return false;
  if (typeof msg.content === 'string') return true;
  return Array.isArray(msg.content) && !msg.content.some((b) => b && b.type === 'tool_result');
};

const toolUsesOfCurrentTurn = (entries) => {
  let start = 0;
  entries.forEach((e, i) => {
    if (isUserPrompt(e)) start = i + 1;
  });
  return entries
    .slice(start)
    .filter((e) => e && e.type === 'assistant' && e.message && Array.isArray(e.message.content))
    .flatMap((e) => e.message.content.filter((b) => b && b.type === 'tool_use'));
};

const normalize = (value) => String(value || '').replace(/\\/g, '/');

try {
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }
  if (!input.transcript_path) process.exit(0);

  const entries = readLines(input.transcript_path).map(parse).filter(Boolean);
  const uses = toolUsesOfCurrentTurn(entries);
  if (!uses.length) process.exit(0);

  const wroteApp = uses.some((u) => {
    if (!WRITE_TOOLS.has(u.name)) return false;
    const fp = normalize(u.input && (u.input.file_path || u.input.notebook_path));
    return APP_PATH.test(fp) && !HARNESS_PATH.test(fp);
  });
  const readContexts = uses.some(
    (u) => !WRITE_TOOLS.has(u.name) && /(^|\/)\.contexts\//.test(normalize(JSON.stringify(u.input || {})))
  );

  if (wroteApp && !readContexts) {
    process.stdout.write(
      JSON.stringify({
        systemMessage:
          'Grounding: houve Edit/Write em código de app neste turn sem leitura de `.contexts`. ' +
          'Reaplique using-ddc: Read MEMORY/contracts/rules relevantes antes de mais implementação. ' +
          'Skill: using-ddc · verification-before-completion.',
      })
    );
  }
} catch {
  /* silent */
}
process.exit(0);
