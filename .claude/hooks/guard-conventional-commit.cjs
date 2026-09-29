#!/usr/bin/env node
// PreToolUse(Bash|PowerShell) — bloqueia git commit fora de Conventional Commits.
// O filtro `if` do settings.json casa subcomandos (`git add . && git commit ...`),
// então o script também procura `git commit` em qualquer posição do comando.
const fs = require('fs');
const path = require('path');

const TYPES = 'feat|fix|chore|docs|refactor|test|build|ci|perf|style|revert';
const HEADER = new RegExp(`^(${TYPES})(\\([a-z0-9][a-z0-9-]*\\))?!?: \\S.*$`);
const MAX_HEADER = 72;

// `git commit`, `git -C dir commit`, `git -c k=v commit`, após início, ;, &&, || ou |.
const GIT_COMMIT = /(?:^|[;&|\n(]\s*)git(?:\s+-[Cc]\s+\S+)*\s+commit\b([^\n;&|]*(?:\n[\s\S]*)?)/;

const firstLine = (text) => (String(text).split(/\r?\n/).find((l) => l.trim() !== '') || '').trim();

// Primeira linha da mensagem, cobrindo os formatos que o Claude usa.
const extractHeader = (cmd, cwd) => {
  const commit = cmd.match(GIT_COMMIT);
  if (!commit) return undefined; // não é commit
  const rest = commit[1];
  const patterns = [
    // -m "$(cat <<'EOF' ... EOF)" (Bash heredoc)
    /-[a-zA-Z]*m\s+"\$\(cat\s+<<-?\s*['"]?(\w+)['"]?\s*\r?\n([\s\S]*?)\r?\n\s*\1/,
    // -F - <<'EOF' ... EOF (heredoc em stdin)
    /-[a-zA-Z]*F\s+-\s[\s\S]*?<<-?\s*['"]?(\w+)['"]?\s*\r?\n([\s\S]*?)\r?\n\s*\1/,
    // -m @'<newline> ... '@ (PowerShell here-string)
    /-[a-zA-Z]*m\s+@(['"])\s*\r?\n([\s\S]*?)\r?\n\1@/,
  ];
  for (const re of patterns) {
    const m = rest.match(re);
    if (m) return firstLine(m[2]);
  }
  const quoted = rest.match(/-[a-zA-Z]*m\s*(?:"([^"]*)"|'([^']*)')/);
  if (quoted) return firstLine(quoted[1] ?? quoted[2]);
  const file = rest.match(/(?:-F|--file)[=\s]+(?!-\s)("[^"]+"|'[^']+'|\S+)/);
  if (file) {
    try {
      return firstLine(fs.readFileSync(path.resolve(cwd, file[1].replace(/^['"]|['"]$/g, '')), 'utf8'));
    } catch {
      return null;
    }
  }
  return null; // sem mensagem parseável (editor, --amend --no-edit, --fixup): deixa passar
};

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const cmd = (input.tool_input && input.tool_input.command) || '';
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const header = extractHeader(cmd, cwd);
  if (!header) process.exit(0);

  const problems = [];
  if (!HEADER.test(header)) problems.push('formato <type>(scope?)!?: <descrição>');
  if (header.length > MAX_HEADER) problems.push(`header com ${header.length} caracteres (máx. ${MAX_HEADER})`);
  if (!problems.length) process.exit(0);

  process.stderr.write(
    `Commit fora de Conventional Commits: ${problems.join('; ')}.\n` +
      `Types: ${TYPES.split('|').join(', ')}. Escopo em minúsculas (módulo/feature).\n` +
      `Veja @.contexts/engineering/processes/commits.md\n` +
      `Header recebido: ${header}\n`
  );
  process.exit(2);
} catch {
  process.exit(0); // falha do hook nunca bloqueia
}
