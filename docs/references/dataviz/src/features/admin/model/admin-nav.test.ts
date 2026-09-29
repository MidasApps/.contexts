import { describe, it, expect } from 'vitest';
import { ADMIN_SECTIONS, ADMIN_GROUP_ORDER, ADMIN_GROUP_LABELS, isAdminSectionId } from './admin-nav';

describe('admin-nav AI Studio', () => {
  it('inclui as 5 seções do AI Studio no grupo ai-studio', () => {
    const aiSections = ADMIN_SECTIONS.filter((s) => s.group === 'ai-studio').map((s) => s.id);
    expect(aiSections).toEqual(expect.arrayContaining([
      'ai-agents', 'ai-skills', 'ai-knowledge-bases', 'ai-workflows', 'ai-tools',
    ]));
  });
  it('grupo ai-studio está na ordem e tem label', () => {
    expect(ADMIN_GROUP_ORDER).toContain('ai-studio');
    expect(ADMIN_GROUP_LABELS['ai-studio']).toBeTruthy();
  });
  it('isAdminSectionId reconhece nova seção e rejeita inválida', () => {
    expect(isAdminSectionId('ai-agents')).toBe(true);
    expect(isAdminSectionId('foo')).toBe(false);
  });
});
