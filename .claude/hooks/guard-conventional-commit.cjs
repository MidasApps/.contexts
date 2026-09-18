#!/usr/bin/env node
// PreToolUse(Bash) — bloqueia git commit sem prefixo conventional commit.
const fs = require('fs');

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const cmd = (input.tool_input && input.tool_input.command) || '';

  // Early-return se não for git commit
  if (!/^\s*git\s+commit\b/.test(cmd)) {
    process.exit(0);
  }

  // Extrai a PRIMEIRA LINHA (subject) da mensagem, cobrindo os formatos reais:
  //   -m "..." / -m '...'                       (uma linha)
  //   -m "$(cat <<'EOF' ... EOF)"               (heredoc — Bash tool)
  //   -m @'<newline>... '@                      (here-string — PowerShell tool)
  const heredoc = cmd.match(/-[a-zA-Z]*m\s+"\$\(cat\s+<<-?\s*'?EOF'?\s*\r?\n\s*([^\r\n]+)/);
  const hereString = cmd.match(/-[a-zA-Z]*m\s+@['"]\s*\r?\n\s*([^\r\n]+)/);
  const quoted = cmd.match(/-[a-zA-Z]*m\s+(?:"([^"\r\n]+)"|'([^'\r\n]+)')/);
  const message = heredoc
    ? heredoc[1]
    : hereString
      ? hereString[1]
      : quoted
        ? (quoted[1] ?? quoted[2] ?? '')
        : null;
  if (message === null) {
    // sem -m parseável: deixa passar (commit interativo/formato exótico, fora do escopo)
    process.exit(0);
  }

  // <type>(scope)?!?: <subject> — "!" marca breaking change (ver rule commits)
  const re = /^(feat|fix|chore|docs|refactor|test|build|ci|perf|style|revert)(\(.+\))?!?: .+/;
  if (!re.test(message)) {
    process.stderr.write(
      `Commit message não segue Conventional Commits.\n` +
      `Esperado: <type>(scope?): <subject>\n` +
      `Types: feat|fix|chore|docs|refactor|test|build|ci|perf|style|revert\n` +
      `Veja @.contexts/engineering/processes/commits.md\n` +
      `Mensagem recebida: ${message}\n`
    );
    process.exit(2);
  }
  process.exit(0);
} catch (e) {
  // Falha silenciosa não-bloqueante
  process.exit(0);
}
