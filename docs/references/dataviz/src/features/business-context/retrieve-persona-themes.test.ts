import { describe, it, expect, vi } from 'vitest';
import { retrievePersonaThemes, listKnownPersonaIds } from './retrieve-persona-themes';

describe('retrievePersonaThemes', () => {
  it('maps diretor-fii-cri to themes including yield, duration, oc, es', () => {
    const themes = retrievePersonaThemes('diretor-fii-cri');
    expect(themes).toEqual(expect.arrayContaining(['yield', 'duration', 'oc', 'es']));
  });

  it('maps cfo-securitizadora to overcollateralization, tranche, pdd', () => {
    const themes = retrievePersonaThemes('cfo-securitizadora');
    expect(themes).toEqual(expect.arrayContaining(['overcollateralization', 'tranche', 'pdd']));
  });

  it('maps controller to pdd, cmn_2682, ifrs9', () => {
    const themes = retrievePersonaThemes('controller');
    expect(themes).toEqual(expect.arrayContaining(['pdd', 'cmn_2682', 'ifrs9']));
  });

  it('returns deterministic non-empty array for every known personaId', () => {
    for (const pid of listKnownPersonaIds()) {
      const themes = retrievePersonaThemes(pid);
      expect(themes.length).toBeGreaterThan(0);
    }
  });

  it('returns generic themes for unknown personaId with warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const themes = retrievePersonaThemes('persona-nao-existe');
    expect(themes).toEqual(['analise-credito', 'imobiliario', 'geral']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
