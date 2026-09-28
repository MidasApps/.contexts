import { describe, it, expect } from 'vitest';
import {
  computeBaseRoutes,
  canAccessRoute,
  isSubset,
  mergeClientAccessByScope,
  mergeAdminClientIdsByScope,
  type PermissionGroup,
  type UserAccessDoc,
  type ClientAccessEntry,
} from './authorize';

/**
 * G1 — a MESMA lógica de autorização do hook de UI (useUserPermissions),
 * agora pura e reutilizável para enforcement SERVER-SIDE. Replica exatamente
 * o comportamento do cliente para não negar acesso legítimo.
 */
const groups: PermissionGroup[] = [
  { id: 'analyst', routes: ['/contratos', '/pdd'] },
  { id: 'viewer', routes: ['/dashboard'] },
  { id: 'all-ind', routes: ['/pricing'] },
];

describe('computeBaseRoutes', () => {
  it('une as rotas dos grupos do usuário', () => {
    expect(computeBaseRoutes(['analyst', 'viewer'], groups).sort()).toEqual([
      '/contratos',
      '/dashboard',
      '/pdd',
    ]);
  });
  it('retorna vazio quando o usuário não tem grupos', () => {
    expect(computeBaseRoutes([], groups)).toEqual([]);
  });
});

describe('canAccessRoute', () => {
  const user: UserAccessDoc = { groups: ['analyst'], clientAccess: [{ clientId: 'brz' }] };

  it('admin acessa qualquer rota', () => {
    expect(canAccessRoute({ isAdmin: true, user: null, groups, clientId: 'brz', route: '/x' })).toBe(true);
  });
  it('nega quando o usuário não tem acesso ao cliente', () => {
    expect(canAccessRoute({ isAdmin: false, user, groups, clientId: 'om', route: '/contratos' })).toBe(false);
  });
  it('permite rota presente nas rotas dos grupos (base)', () => {
    expect(canAccessRoute({ isAdmin: false, user, groups, clientId: 'brz', route: '/contratos' })).toBe(true);
  });
  it('nega rota fora das rotas dos grupos', () => {
    expect(canAccessRoute({ isAdmin: false, user, groups, clientId: 'brz', route: '/dashboard' })).toBe(false);
  });
  it('routeOverrides por cliente vence sobre os grupos', () => {
    const u: UserAccessDoc = {
      groups: ['analyst'],
      clientAccess: [{ clientId: 'brz', routeOverrides: ['/dashboard'] }],
    };
    expect(canAccessRoute({ isAdmin: false, user: u, groups, clientId: 'brz', route: '/dashboard' })).toBe(true);
    expect(canAccessRoute({ isAdmin: false, user: u, groups, clientId: 'brz', route: '/contratos' })).toBe(false);
  });
  it('nega quando não há userDoc', () => {
    expect(canAccessRoute({ isAdmin: false, user: null, groups, clientId: 'brz', route: '/contratos' })).toBe(false);
  });
});

describe('isSubset', () => {
  it('true quando todos os candidatos estão no universo', () => {
    expect(isSubset(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
  });
  it('false quando algum candidato está fora', () => {
    expect(isSubset(['a', 'x'], ['a', 'b'])).toBe(false);
  });
  it('true para candidato vazio (fail-closed não se aplica a conjunto vazio)', () => {
    expect(isSubset([], ['a'])).toBe(true);
  });
});

describe('mergeClientAccessByScope', () => {
  const scope = ['vila-rosa'];
  const existing: ClientAccessEntry[] = [
    { clientId: 'vila-rosa', routeOverrides: null },
    { clientId: 'om', routeOverrides: ['/dashboard'] },
  ];

  it('preserva entradas FORA do escopo e substitui as DENTRO', () => {
    const incoming: ClientAccessEntry[] = [{ clientId: 'vila-rosa', routeOverrides: ['/pdd'] }];
    const out = mergeClientAccessByScope(existing, incoming, scope);
    expect(out).toContainEqual({ clientId: 'om', routeOverrides: ['/dashboard'] }); // preservada byte-idêntica
    expect(out).toContainEqual({ clientId: 'vila-rosa', routeOverrides: ['/pdd'] }); // atualizada
    expect(out.some((c) => c.clientId === 'vila-rosa' && c.routeOverrides === null)).toBe(false);
  });

  it('ignora entradas incoming FORA do escopo (não concede cross-tenant)', () => {
    const incoming: ClientAccessEntry[] = [
      { clientId: 'vila-rosa', routeOverrides: null },
      { clientId: 'brz', routeOverrides: null }, // fora do escopo → deve ser descartada
    ];
    const out = mergeClientAccessByScope(existing, incoming, scope);
    expect(out.some((c) => c.clientId === 'brz')).toBe(false);
  });

  it('remover uma entrada DENTRO do escopo é permitido; FORA é preservada', () => {
    const incoming: ClientAccessEntry[] = []; // clientAdmin tenta remover tudo
    const out = mergeClientAccessByScope(existing, incoming, scope);
    expect(out).toEqual([{ clientId: 'om', routeOverrides: ['/dashboard'] }]); // om (fora) intacto; vila-rosa removida
  });
});

describe('mergeAdminClientIdsByScope', () => {
  it('preserva adminClientIds fora do escopo e aplica os de dentro', () => {
    const out = mergeAdminClientIdsByScope(['om'], ['vila-rosa'], ['vila-rosa']);
    expect(out.sort()).toEqual(['om', 'vila-rosa']);
  });
  it('descarta sub-delegação fora do escopo', () => {
    const out = mergeAdminClientIdsByScope([], ['brz'], ['vila-rosa']);
    expect(out).toEqual([]);
  });
});
