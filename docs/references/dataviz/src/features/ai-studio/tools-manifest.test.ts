import { describe, it, expect } from 'vitest';
import { TOOL_MANIFEST } from './tools-manifest';
import { TOOL_REGISTRY } from '@/features/ai-studio/runtime/tool-registry';

describe('tools-manifest ↔ registry', () => {
  it('toda key do manifesto tem factory no registry', () => {
    for (const t of TOOL_MANIFEST) expect(TOOL_REGISTRY[t.key], `manifest key sem factory: ${t.key}`).toBeDefined();
  });
  it('toda key do registry está no manifesto', () => {
    const manifestKeys = new Set(TOOL_MANIFEST.map((t) => t.key));
    for (const k of Object.keys(TOOL_REGISTRY)) expect(manifestKeys.has(k), `registry key fora do manifesto: ${k}`).toBe(true);
  });
  it('chaves canônicas presentes; antigas ausentes', () => {
    const keys = new Set(TOOL_MANIFEST.map((t) => t.key));
    expect(keys.has('dry_run_sql')).toBe(true);
    expect(keys.has('list_validated_queries')).toBe(true);
    expect(keys.has('bq_dry_run_sql')).toBe(false);
    expect(keys.has('bq_list_validated_queries')).toBe(false);
  });
});
