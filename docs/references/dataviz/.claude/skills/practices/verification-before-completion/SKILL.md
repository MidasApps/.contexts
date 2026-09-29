---
name: verification-before-completion
description: >
  Use antes de declarar trabalho concluído, fix pronto, testes passando, build ok,
  ou PR/commit — exige evidência fresca (comando + output ou Read em @.contexts).
  Keywords: verify, done, complete, tests pass, pronto, verificação, evidence.
---

# Verification Before Completion

Claim sem evidência é desonestidade, não eficiência.

## Iron law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Se você **não rodou** o comando de verificação (ou não leu o contrato) **neste turn**,
não pode afirmar que passou / está conforme.

## Gate

Antes de qualquer status positivo (“done”, “pronto”, “passou”, “conforme MEMORY”):

1. **IDENTIFY** — qual comando ou leitura prova a claim?
2. **RUN / READ** — execute completo, fresco; ou Read/Grep no path real de `.contexts`
3. **READ OUTPUT** — exit code, falhas, trechos relevantes
4. **VERIFY** — o output confirma a claim?
5. **ONLY THEN** — afirme **com** a evidência

Pular passo = claim inválida.

## Claims comuns (DDC)

| Claim | Exige | Não basta |
|---|---|---|
| Tests pass | Output do runner (vitest/playwright), 0 fail | “deve passar”, run antigo |
| Linter / typecheck clean | `tsc --noEmit` / lint exit 0 | Só o editor sem erro vermelho |
| Build ok | Build exit 0 | Typecheck sozinho |
| Bug fixed | Reprodução do sintoma falhando → passando | Diff “parece certo” |
| Conforme contrato API | Read `@.contexts/engineering/contracts/api.md` + check do shape | “segui REST” |
| Conforme pin de stack | Read `MEMORY.md` ou stack doc | Memória do modelo |
| Agent “terminou” | Diff/VCS ou arquivos alterados inspecionados | Relato do subagent |
| Requirements met | Checklist do plano/task vs diff | “testes verdes” sozinho |

## Red flags — PARE

- “should work”, “provavelmente”, “parece ok”
- “Great!” / “Pronto!” antes de verificar
- Commit/PR sem typecheck/test quando a mudança é de código
- Confiar cegamente em subagent
- “só desta vez”
- Claim de conformidade com `.contexts` sem ter **lido** o path neste trabalho

## Rationalizations

| Desculpa | Realidade |
|---|---|
| “Estou confiante” | Confiança ≠ evidência |
| “Já rodei antes” | Precisa ser fresco neste claim |
| “Linter passou” | Linter ≠ typecheck ≠ testes |
| “Agent disse success” | Verifique diff e testes |
| “É só docs” | Ainda assim confira paths e links `@` |

## Integração DDC

- Após feature material: rode verification **antes** de pedir review a `code-reviewer`.
- “Conforme contracts” exige paths reais sob `.contexts/engineering/contracts/`.
- Use junto com `using-ddc` e `writing-plans-ddc` (tasks com step de verify).
- ADR da onda de harness: `@.contexts/engineering/decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md`.

## Bottom line

Rode o comando. Leia o output. **Só então** afirme o resultado.
