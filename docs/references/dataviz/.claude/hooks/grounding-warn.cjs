#!/usr/bin/env node
/**
 * Stop hook (não-bloqueante): se o turn teve Edit/Write em código de app
 * e não há sinal de Read/leitura de .contexts no transcript resumido do stdin,
 * emite systemMessage lembrando using-ddc.
 *
 * Heurística best-effort: depende do payload do Stop (tool history se presente).
 */
const fs = require('fs');

function emit(msg) {
  process.stdout.write(JSON.stringify({ systemMessage: msg }));
  process.exit(0);
}

try {
  const raw = fs.readFileSync(0, 'utf8');
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }

  const blob = JSON.stringify(input);

  // Sinais de escrita em app (paths comuns)
  const wroteApp =
    /"(Edit|Write)"/.test(blob) &&
    /["']([^"']*\/)?(src|app|functions|packages|lib|server|api)\/[^"']+\.(ts|tsx|js|jsx|sql)["']/.test(
      blob
    );

  // Sinais de leitura de SSOT
  const readContexts =
    /\.contexts\//.test(blob) ||
    /@\.contexts\//.test(blob) ||
    /engineering\/(MEMORY|rules|contracts|stacks)/.test(blob);

  // Edições só em .claude ou .contexts não disparam o aviso de "app sem context"
  const onlyHarness =
    wroteApp === false &&
    (/\.claude\//.test(blob) || /\.contexts\//.test(blob));

  if (onlyHarness) process.exit(0);

  // Se não detectamos tool history no payload, não inventar falso positivo
  const hasToolTrace =
    /tool_name|toolName|tool_input|ToolUse|tool_use/.test(blob);
  if (!hasToolTrace) process.exit(0);

  if (wroteApp && !readContexts) {
    emit(
      'Grounding: houve Edit/Write em código de app neste turn sem evidência de leitura de `.contexts`. ' +
        'Reaplique using-ddc: Read MEMORY/contracts/rules relevantes antes de mais implementação. ' +
        'Skill: using-ddc · verification-before-completion.'
    );
  }
} catch {
  /* silent */
}
process.exit(0);
