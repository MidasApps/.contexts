#!/usr/bin/env node
// Stop: avisa se CLAUDE.md > 200 linhas. Não-bloqueante.
const fs = require('fs');
const path = require('path');

try {
  JSON.parse(fs.readFileSync(0, 'utf8'));
} catch (e) { /* ignora */ }

try {
  // CLAUDE_PROJECT_DIR é estável; process.cwd() deriva se a sessão fizer cd.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const p = path.join(projectDir, 'CLAUDE.md');
  if (!fs.existsSync(p)) process.exit(0);
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split(/\r?\n/).filter((l, i, a) => i < a.length - 1 || l !== '').length;
  if (lines > 200) {
    process.stdout.write(JSON.stringify({
      systemMessage: `CLAUDE.md tem ${lines} linhas (>200). Revise: deve ser índice + imports @, não manual.`
    }));
  }
} catch (e) { /* ignora */ }
process.exit(0);
