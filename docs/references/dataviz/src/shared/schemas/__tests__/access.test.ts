import { describe, it, expect } from 'vitest';
import {
  RoutePath,
  GroupUpsertInput,
  ClientAccessInput,
  UserUpsertInput,
  formatIssues,
} from '../access';
import { FirestoreDocId } from '../identifier';
import { canAccessRoute } from '@/shared/lib/permissions/authorize';
import { ALL_ROUTES } from '@/features/admin/model/types';

describe('RoutePath', () => {
  // Iterar o catálogo em vez de listar caminhos à mão: rota nova na admin que
  // o schema recusasse quebraria o salvamento de grupo em produção, e uma lista
  // literal aqui não perceberia.
  it('aceita todo path do catálogo real da admin', () => {
    for (const { path } of ALL_ROUTES) {
      expect(RoutePath.safeParse(path).success).toBe(true);
    }
  });

  it.each([
    ['dashboard', 'sem barra inicial'],
    ['/dashboard?x=1', 'query string'],
    ['/dashboard#top', 'hash'],
    ['/dash board', 'espaço'],
    ['/dashboard\n/admin', 'quebra de linha'],
    ['', 'vazio'],
  ])('rejeita %s (%s)', (value) => {
    expect(RoutePath.safeParse(value).success).toBe(false);
  });
});

describe('ClientAccessInput — os três estados de routeOverrides', () => {
  // Esta distinção é o coração de `canAccessRoute`: `Array.isArray` separa
  // "herda dos grupos" de "nega tudo". Um `.default([])` no schema converteria
  // silenciosamente todo usuário que herda em usuário sem acesso nenhum.
  it('null continua null (herda dos grupos)', () => {
    const r = ClientAccessInput.parse({ clientId: 'vila-rosa', routeOverrides: null });
    expect(r.routeOverrides).toBeNull();
  });

  it('ausente continua ausente (herda dos grupos)', () => {
    const r = ClientAccessInput.parse({ clientId: 'vila-rosa' });
    expect(Array.isArray(r.routeOverrides)).toBe(false);
  });

  it('[] continua [] (nega todas as rotas)', () => {
    const r = ClientAccessInput.parse({ clientId: 'vila-rosa', routeOverrides: [] });
    expect(r.routeOverrides).toEqual([]);
  });

  it('o parse preserva a decisão que canAccessRoute toma em cada estado', () => {
    const groups = [{ id: 'g1', routes: ['/dashboard'] }];
    const check = (entry: unknown) =>
      canAccessRoute({
        isAdmin: false,
        user: { groups: ['g1'], clientAccess: [ClientAccessInput.parse(entry)] },
        groups,
        clientId: 'vila-rosa',
        route: '/dashboard',
      });
    expect(check({ clientId: 'vila-rosa', routeOverrides: null })).toBe(true); // herda
    expect(check({ clientId: 'vila-rosa', routeOverrides: [] })).toBe(false); // nega
    expect(check({ clientId: 'vila-rosa', routeOverrides: ['/dashboard'] })).toBe(true);
  });

  it('rejeita clientId que não é slug', () => {
    expect(ClientAccessInput.safeParse({ clientId: 'Vila Rosa' }).success).toBe(false);
  });
});

describe('GroupUpsertInput', () => {
  it('rejeita routes com item não-string — a confusão de tipo que o cast deixava passar', () => {
    expect(GroupUpsertInput.safeParse({ name: 'Ops', routes: [{ $ne: null }] }).success).toBe(false);
    expect(GroupUpsertInput.safeParse({ name: 'Ops', routes: [123] }).success).toBe(false);
  });

  it('rejeita routes que não é array', () => {
    expect(GroupUpsertInput.safeParse({ name: 'Ops', routes: '/dashboard' }).success).toBe(false);
  });

  it('rejeita nome só de espaços', () => {
    expect(GroupUpsertInput.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('aplica trim no nome (o handler compara nome normalizado para detectar duplicata)', () => {
    expect(GroupUpsertInput.parse({ name: '  Ops  ' }).name).toBe('Ops');
  });

  it('rejeita id com barra — vira path de .doc() e escreveria em subcoleção', () => {
    expect(GroupUpsertInput.safeParse({ id: 'a/b/c', name: 'Ops' }).success).toBe(false);
  });

  it('array de rotas tem teto', () => {
    const routes = Array.from({ length: 101 }, (_, i) => `/r${i}`);
    expect(GroupUpsertInput.safeParse({ name: 'Ops', routes }).success).toBe(false);
  });
});

describe('FirestoreDocId', () => {
  it('aceita o id auto-gerado do Firestore', () => {
    expect(FirestoreDocId.safeParse('N9kQ2fZxAbCdEfGhIjKl').success).toBe(true);
  });

  it.each(['a/b', '..', '.', '', 'a.b'])('rejeita %s', (v) => {
    expect(FirestoreDocId.safeParse(v).success).toBe(false);
  });
});

describe('UserUpsertInput', () => {
  const base = {
    id: 'alice_acme_com',
    email: 'alice@acme.com',
    displayName: 'Alice',
    groups: [],
    clientAccess: [{ clientId: 'vila-rosa', routeOverrides: null }],
  };

  it('aceita o payload que o UserForm envia', () => {
    expect(UserUpsertInput.safeParse(base).success).toBe(true);
  });

  it('rejeita adminClientIds fora de slug — o valor decide escopo de admin por tenant', () => {
    expect(UserUpsertInput.safeParse({ ...base, adminClientIds: ['../om'] }).success).toBe(false);
  });

  it('rejeita provisionCredential não-booleano (decide criação de credencial)', () => {
    expect(UserUpsertInput.safeParse({ ...base, provisionCredential: 'false' }).success).toBe(false);
  });
});

describe('formatIssues', () => {
  it('devolve { field, message } como manda a rule validation', () => {
    const r = GroupUpsertInput.safeParse({ name: '', routes: [123] });
    expect(r.success).toBe(false);
    if (r.success) return;
    const issues = formatIssues(r.error);
    expect(issues.every((i) => typeof i.field === 'string' && typeof i.message === 'string')).toBe(true);
    expect(issues.map((i) => i.field)).toContain('routes.0');
  });
});
