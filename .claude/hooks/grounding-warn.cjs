#!/usr/bin/env node
/**
 * Stop hook (não-bloqueante): se o turn atual teve Edit/Write em código de app
 * e nenhuma tool leu `.contexts/`, avisa o Claude (additionalContext, uma vez
 * por turn, o que continua a conversa) e o usuário (systemMessage).
 *
 * O payload do Stop NÃO traz histórico de tools; ele traz `transcript_path`
 * (JSONL). Lemos o transcript a partir da última mensagem real do usuário.
 * Paths são testados relativos ao projeto, porque o próprio diretório do
 * projeto pode se chamar `.contexts`. Sem transcript legível, sai em silêncio.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const APP_PATH = /^(src|app|functions|packages|lib|server|api|e2e)\/.+\.(ts|tsx|js|jsx|mjs|cjs|sql)$/;
const HARNESS_PATH = /^(\.claude|\.contexts|docs)\//;
const CONTEXTS_REF = /(^|[\s"'`@=(])\.contexts\//;

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
  if (!msg || entry.isSidechain || entry.isMeta) return false;
  if (typeof msg.content === 'string') return true;
  return Array.isArray(msg.content) && !msg.content.some((b) => b && b.type === 'tool_result');
};

const currentTurnStart = (entries) => {
  let start = 0;
  entries.forEach((e, i) => {
    if (isUserPrompt(e)) start = i + 1;
  });
  return start;
};

const toolUsesFrom = (entries, start) =>
  entries
    .slice(start)
    .filter((e) => e && e.type === 'assistant' && e.message && Array.isArray(e.message.content))
    .flatMap((e) => e.message.content.filter((b) => b && b.type === 'tool_use'));

const normalize = (value) => String(value || '').replace(/\\/g, '/');

// Remove o prefixo do projeto (case-insensitive, por causa do Windows) em qualquer ponto do texto.
const relativize = (value, root) => {
  const text = normalize(value);
  const base = normalize(root).replace(/\/+$/, '');
  if (!base) return text;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${escaped}/`, 'gi'), '');
};

// Um aviso ao Claude por turn: marcador em tmp com sessão + início do turn.
const firstWarningOfTurn = (sessionId, turnStart) => {
  const id = String(sessionId || 'nosession').replace(/[^\w-]/g, '');
  const marker = path.join(os.tmpdir(), `ddc-grounding-${id}`);
  const key = String(turnStart);
  try {
    if (fs.readFileSync(marker, 'utf8') === key) return false;
  } catch {
    /* sem marcador ainda */
  }
  try {
    fs.writeFileSync(marker, key);
    return true;
  } catch {
    return false; // sem como registrar: não arrisca loop
  }
};

try {
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }
  if (!input.transcript_path) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || '';
  const entries = readLines(input.transcript_path).map(parse).filter(Boolean);
  const turnStart = currentTurnStart(entries);
  const uses = toolUsesFrom(entries, turnStart);
  if (!uses.length) process.exit(0);

  const wroteApp = uses.some((u) => {
    if (!WRITE_TOOLS.has(u.name)) return false;
    const fp = relativize(u.input && (u.input.file_path || u.input.notebook_path), root);
    return APP_PATH.test(fp) && !HARNESS_PATH.test(fp);
  });
  // Leitura de SSOT: path (Read), pattern/path (Grep/Glob) ou comando (Bash) citando `.contexts/`.
  const readContexts = uses.some(
    (u) => !WRITE_TOOLS.has(u.name) && Object.values(u.input || {}).some((v) => CONTEXTS_REF.test(relativize(v, root)))
  );

  if (wroteApp && !readContexts) {
    const message =
      'Grounding: houve Edit/Write em código de app neste turn sem leitura de `.contexts`. ' +
      'Reaplique using-ddc: Read MEMORY/contracts/rules relevantes antes de mais implementação. ' +
      'Skill: using-ddc · verification-before-completion.';
    const payload = { systemMessage: message };
    // stop_hook_active: outro Stop hook já continuou a conversa; não empilha continuação.
    if (!input.stop_hook_active && firstWarningOfTurn(input.session_id, turnStart)) {
      payload.hookSpecificOutput = { hookEventName: 'Stop', additionalContext: message };
    }
    process.stdout.write(JSON.stringify(payload));
  }
} catch {
  /* silent */
}
process.exit(0);
