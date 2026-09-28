/**
 * Sprint 3.D, Task 13 — sanity test for the `agent-evals.yml` workflow.
 *
 * Sem dependencia de `yaml`/actionlint: validamos que o arquivo existe,
 * referencia os jobs esperados (smoke/full/drift), os triggers (cron +
 * pull_request) e os steps criticos (checkout, pnpm setup, run-evals).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const WF_PATH = join(process.cwd(), '.github/workflows/agent-evals.yml');

describe('agent-evals workflow', () => {
  it('file exists', () => {
    expect(existsSync(WF_PATH)).toBe(true);
  });

  it('declares the three jobs and required triggers', () => {
    const txt = readFileSync(WF_PATH, 'utf8');
    expect(txt).toContain('jobs:');
    expect(txt).toContain('smoke:');
    expect(txt).toContain('full:');
    expect(txt).toContain('drift:');
    // Triggers
    expect(txt).toContain('pull_request:');
    expect(txt).toContain("cron: '0 2 * * 1'");
    expect(txt).toContain("cron: '0 3 1 * *'");
    // Pinned actions
    expect(txt).toContain('actions/checkout@v4');
    expect(txt).toContain('pnpm/action-setup@v4');
    expect(txt).toContain('actions/setup-node@v4');
    expect(txt).toContain('google-github-actions/auth@v2');
    // Runner script invocations
    expect(txt).toContain('--suite=smoke');
    expect(txt).toContain('--suite=full');
    expect(txt).toContain('--suite=gold');
    expect(txt).toContain('detect-drift.ts');
  });
});
