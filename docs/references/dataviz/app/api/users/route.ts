import { NextRequest, NextResponse } from 'next/server';
import { getDb, getAdminAuth } from '@/shared/lib/firebase/admin';
import { verifyAuthToken, verifyCanProvision, getProvisionScope } from '@/shared/lib/api-auth';
import { isSubset, mergeClientAccessByScope, mergeAdminClientIdsByScope } from '@/shared/lib/permissions/authorize';
import { UserDocId, slugifyEmail } from '@/shared/schemas/identifier';
import { UserUpsertInput, formatIssues } from '@/shared/schemas/access';
import { auditFields } from '@/shared/lib/firestore/audit';

export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const scope = await getProvisionScope(email);
  if (!scope.allowed) {
    return NextResponse.json({ error: scope.error ?? 'Sem permissão' }, { status: scope.status ?? 403 });
  }

  try {
    const db = getDb();
    const snap = await db.collection('users').get();
    const all = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        email: data.email ?? null,
        displayName: data.displayName ?? null,
        groups: data.groups ?? [],
        clientAccess: data.clientAccess ?? [],
        adminClientIds: data.adminClientIds ?? [],
      };
    });
    const users = scope.global
      ? all
      : all.filter((u) => {
          // Footprint completo do alvo = clientAccess ∪ adminClientIds. Vazio (ex.: admin
          // global sem acesso por-tenant) nunca é "no escopo" — isSubset([], x) seria
          // vacuamente true e vazaria o alvo para qualquer clientAdmin.
          const footprint = [
            ...(u.clientAccess as { clientId: string }[]).map((ca) => ca.clientId),
            ...((u.adminClientIds as string[] | undefined) ?? []),
          ];
          return footprint.length > 0 && isSubset(footprint, scope.adminClientIds);
        });
    return NextResponse.json({ data: users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar usuários';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    // `clientAccess[].routeOverrides` define acesso (é o que vence sobre os
    // grupos em `canAccessRoute`) e `clientAccess[].clientId` vira o claim
    // `clientIds` mais abaixo. Os dois entravam por cast — sem validação em
    // runtime. Parse na borda, uma vez; o resto do handler confia no shape.
    const parsed = UserUpsertInput.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido.', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // Valida o id antes de usá-lo como path do doc Firestore (evita id vazio ou
    // com `/` → path injection). Mesmo padrão de Slug.safeParse em clients/route.
    const idResult = UserDocId.safeParse(body.id);
    if (!idResult.success) {
      return NextResponse.json({ error: 'ID de usuário inválido.' }, { status: 400 });
    }

    const db = getDb();

    // Validate duplicate email
    const emailSnap = await db.collection('users').where('email', '==', body.email).limit(1).get();
    if (!emailSnap.empty && emailSnap.docs[0].id !== body.id) {
      return NextResponse.json({ error: 'Já existe um usuário com este email.' }, { status: 400 });
    }

    // Validate clientAccess references
    if (body.clientAccess?.length > 0) {
      const clientsSnap = await db.collection('clients').get();
      const validClientIds = new Set(clientsSnap.docs.map((d) => d.id));
      for (const ca of body.clientAccess) {
        if (!validClientIds.has(ca.clientId)) {
          return NextResponse.json({ error: `Cliente referenciado não existe: ${ca.clientId}` }, { status: 400 });
        }
      }
    }

    // Validate group references
    if (body.groups?.length > 0) {
      const groupsSnap = await db.collection('groups').get();
      const validGroupIds = new Set(groupsSnap.docs.map((d) => d.id));
      for (const groupId of body.groups) {
        if (!validGroupIds.has(groupId)) {
          return NextResponse.json({ error: `Grupo referenciado não existe: ${groupId}` }, { status: 400 });
        }
      }
    }

    const scope = await verifyCanProvision(email, {
      email: body.email,
      clientAccess: body.clientAccess ?? [],
      adminClientIds: body.adminClientIds ?? [],
    });
    if (!scope.allowed) {
      return NextResponse.json({ error: scope.error ?? 'Sem permissão' }, { status: scope.status ?? 403 });
    }

    // Doc existente em `body.id` lido UMA vez aqui (pós-autorização) — reutilizado
    // por FIX #1 (email imutável), pelo merge por-tenant (§3.3), por FIX #2
    // (campos globais) e pela decisão de createdAt no set final. TEM que preceder
    // QUALQUER efeito colateral (Auth/claim/doc) para que todos os checks sejam
    // fail-closed.
    const ref = db.collection('users').doc(body.id);
    const existingSnap = await ref.get();
    const existingData = existingSnap.exists ? existingSnap.data() ?? {} : {};

    // FIX #1 (CRITICAL, review final 2): email é IMUTÁVEL em doc existente.
    // `slugifyEmail` é NÃO-injetivo (`@` e `.` colapsam no mesmo `_`), então o
    // guard C1a (`id === slug(email)`) pode ser satisfeito por um email-COLISÃO
    // controlado pelo atacante que aponta para o doc de OUTRO usuário — p.ex.
    // `alice.sub@acme.com` e `alice@sub.acme.com` geram o mesmo id
    // `alice_sub_acme_com`. Se o doc já existe, o email do body TEM que bater com
    // o email armazenado; caso contrário é colisão/captura cross-tenant (o
    // atacante criaria uma conta Auth nova com o email-colisão, herdaria o
    // footprint do doc alheio via merge e ainda corromperia o email do doc real).
    // Vale para TODOS os callers (global e clientAdmin) — troca de email é fora de
    // escopo deste endpoint, então não há caso legítimo aqui.
    if (existingSnap.exists && existingData.email !== body.email) {
      return NextResponse.json({ error: 'email não corresponde ao usuário existente.' }, { status: 400 });
    }

    // Footprint do doc EXISTENTE (clientAccess ∪ adminClientIds), hoisted para
    // fora do bloco de merge (§3.3) porque também GATEIA a criação de credencial
    // no bloco Auth (vetor 3f, review final 3 — ver comentário lá).
    // `footprintInScope` = footprint ⊆ escopo do caller, com footprint VAZIO → NÃO
    // in-scope (fail-closed, mesmo idioma do GET/DELETE — isSubset([], x) seria
    // vacuamente true). Para doc NOVO (!existingSnap.exists) o footprint aqui é
    // vazio, mas o gate de credencial trata doc novo como in-scope via o próprio
    // `!existingSnap.exists` (o incoming já foi validado ⊆ escopo por
    // verifyCanProvision). Para caller global o gate curto-circuita em scope.global,
    // então este valor é irrelevante nesse caso.
    const existingFootprint = [
      ...((existingData.clientAccess ?? []) as { clientId: string }[]).map((ca) => ca.clientId),
      ...((existingData.adminClientIds ?? []) as string[]),
    ];
    const footprintInScope =
      existingFootprint.length > 0 && isSubset(existingFootprint, scope.adminClientIds);

    // Merge por tenant para caller com escopo restrito (§3.3): preserva tenants
    // fora do escopo do doc existente; nunca concede/remove cross-tenant.
    let finalClientAccess = body.clientAccess ?? [];
    let finalAdminClientIds = body.adminClientIds ?? [];
    // FIX #2 (Important, review final 2): campos GLOBAIS (groups/displayName) são
    // gravados por atacado, fora do merge por-tenant. Default = body; um
    // clientAdmin editando doc compartilhado fora do seu escopo os tem preservados
    // (ver bloco de merge abaixo).
    let finalGroups: string[] = body.groups ?? [];
    let finalDisplayName: string = body.displayName;
    if (!scope.global) {
      // C1a (CRITICAL, review final): id precisa corresponder ao slug do
      // PRÓPRIO email do body. Sem isso, um clientAdmin passa `id` = doc de
      // OUTRO usuário (qualquer tenant) + `email` fresh sob seu controle; o
      // merge abaixo puxaria o clientAccess do doc alheio para o claim
      // aplicado à conta do email fresh — cross-tenant capture. Admin global
      // não passa por aqui (não depende do merge por doc existente).
      if (body.id !== slugifyEmail(body.email)) {
        return NextResponse.json({ error: 'ID de usuário não corresponde ao email.' }, { status: 400 });
      }

      // Reusa o doc já lido acima (existingSnap/existingData) — não re-lê.
      const existingCA = (existingData.clientAccess ?? []) as { clientId: string; routeOverrides?: string[] | null }[];
      const existingAdmin = (existingData.adminClientIds ?? []) as string[];

      // C1b (CRITICAL, review final): se o doc já existe e seu footprint
      // (clientAccess ∪ adminClientIds) não tem NENHUMA sobreposição com o
      // escopo do caller, é um doc inteiramente alheio (o caller nunca teve
      // relação nenhuma com ele) — nega. Doc novo (não existe ainda) nunca
      // dispara este 403. Doc com overlap PARCIAL (multi-tenant, §3.3) também
      // não dispara — o merge por-tenant abaixo já garante que só a parte no
      // escopo é concedida/alterada, preservando o resto intacto; negar aqui
      // quebraria a edição legítima de usuário multi-tenant.
      if (existingSnap.exists) {
        // Reusa o `existingFootprint` hoisted acima (mesmos existingCA/existingAdmin).
        const inScopeSet = new Set(scope.adminClientIds);
        const hasOverlap = existingFootprint.some((id) => inScopeSet.has(id));
        if (existingFootprint.length > 0 && !hasOverlap) {
          return NextResponse.json({ error: 'Usuário fora do seu escopo.' }, { status: 403 });
        }

        // FIX #2 (Important, review final 2): campos GLOBAIS (groups/displayName)
        // não passam pelo merge por-tenant — são gravados por atacado. Se o
        // footprint do doc existente NÃO é ⊆ escopo do caller (usuário
        // compartilhado com tenant fora do escopo — o caso de overlap parcial
        // permitido por C1b — ou footprint vazio/alheio), um clientAdmin não
        // pode alterar rotas globais (`groups`) nem o `displayName` de um usuário
        // que também pertence a outro tenant: preserva os valores do doc. Só
        // quando o footprint é INTEIRAMENTE ⊆ escopo (usuário totalmente do
        // caller) o body aplica. Footprint vazio nunca é vacuamente ⊆ (mesmo
        // idioma fail-closed do GET/DELETE). Reusa o `footprintInScope` hoisted.
        if (!footprintInScope) {
          finalGroups = (existingData.groups as string[] | undefined) ?? [];
          finalDisplayName = (existingData.displayName as string | undefined) ?? body.displayName;
        }
      }

      finalClientAccess = mergeClientAccessByScope(existingCA, finalClientAccess, scope.adminClientIds);
      finalAdminClientIds = mergeAdminClientIdsByScope(existingAdmin, finalAdminClientIds, scope.adminClientIds);
    }

    // ── Abordagem A: provisionamento de credencial (Auth → claim → doc) ──────────
    const provisionCredential = body.provisionCredential !== false; // default true

    // CRITICAL (review final 3, vetor 3f): um caller NÃO-global não pode
    // BOOTSTRAPAR credencial (createUser + resetLink + claim em conta NOVA) de um
    // usuário que não é 100% do seu escopo. Sem este gate, um clientAdmin de
    // vila-rosa provisiona a conta (ainda inexistente) de um usuário COMPARTILHADO
    // com `om` (fora do escopo): `createUser` cria uma conta NOVA com o email REAL
    // da vítima, `setCustomUserClaims` grava clientIds incluindo `om`, e
    // `generatePasswordResetLink` devolve o link AO ATACANTE — ele define a senha
    // e loga com acesso cross-tenant a `om`. O email bate com o doc, então o guard
    // de email-match (FIX #1) não dispara; o merge por-tenant preserva `om` no
    // claim. Só bootstrapamos credencial quando: caller global; OU doc NOVO (o
    // incoming já foi validado ⊆ escopo por verifyCanProvision); OU o footprint do
    // doc existente é INTEIRAMENTE ⊆ escopo (usuário totalmente do caller). Fail-
    // closed: footprint vazio/parcial/alheio de doc existente → NÃO bootstrapa.
    const mayBootstrapCredential = scope.global || !existingSnap.exists || footprintInScope;

    let uid: string | undefined;
    let credentialCreated = false;
    let resetLink: string | undefined;

    // I2 (Important, review final): a busca da conta Auth e a re-emissão do
    // claim rodam SEMPRE que existir conta para o email — mesmo com
    // provisionCredential:false, que passa a controlar só a CRIAÇÃO de conta
    // nova + resetLink, não a sincronização do claim. Sem isso, editar
    // clientAccess com provisionCredential:false deixava o claim (mais
    // permissivo, persistente) desatualizado em relação ao doc.
    const auth = getAdminAuth();
    let existingClaims: Record<string, unknown> = {};
    try {
      const existingUser = await auth.getUserByEmail(body.email);
      uid = existingUser.uid;
      existingClaims = (existingUser.customClaims as Record<string, unknown> | undefined) ?? {};
    } catch (e) {
      if ((e as { code?: string }).code === 'auth/user-not-found') {
        // Só cria conta nova quando o caller tem escopo para bootstrapar a
        // credencial (vetor 3f, ver comentário em `mayBootstrapCredential`). Caller
        // não-global editando doc EXISTENTE compartilhado/alheio (footprint ⊄
        // escopo) NÃO cria conta, NÃO gera resetLink e NÃO seta claim em conta nova
        // — mas o request NÃO é derrubado: uid permanece undefined e o merge
        // in-scope do doc (ref.set abaixo) segue normalmente.
        if (provisionCredential && mayBootstrapCredential) {
          try {
            const created = await auth.createUser({ email: body.email, displayName: body.displayName });
            uid = created.uid;
            credentialCreated = true;
          } catch {
            return NextResponse.json({ error: 'Falha ao resolver conta de autenticação.' }, { status: 502 });
          }
        }
        // Sem provisionCredential, sem escopo para bootstrapar, ou sem conta
        // existente: nada a criar, nada a sincronizar — uid permanece undefined,
        // segue para o ref.set abaixo.
      } else {
        return NextResponse.json({ error: 'Falha ao resolver conta de autenticação.' }, { status: 502 });
      }
    }

    // Guard explícito: quando o caller PODE bootstrapar (provisionCredential=true e
    // mayBootstrapCredential), uid tem que ter sido resolvido (getUserByEmail ou
    // createUser acima) — nunca deveria disparar. Quando o bootstrap foi pulado por
    // escopo (mayBootstrapCredential=false), uid undefined é ESPERADO e o request
    // segue sem credencial, então não entra aqui.
    if (provisionCredential && mayBootstrapCredential && !uid) {
      return NextResponse.json({ error: 'Falha ao resolver conta de autenticação.' }, { status: 502 });
    }

    if (uid) {
      // Claim clientIds = projeção read-only de clientAccess (fonte única = doc). §2.4
      const clientIds = finalClientAccess.map((ca) => ca.clientId);
      try {
        await auth.setCustomUserClaims(uid, { ...existingClaims, clientIds });
      } catch {
        // Aborta ANTES de gravar o doc — doc nunca fica "à frente" do claim (§5 V4).
        return NextResponse.json({ error: 'Falha ao aplicar permissões (claim).' }, { status: 500 });
      }

      if (credentialCreated && body.generatePasswordLink !== false) {
        try {
          resetLink = await auth.generatePasswordResetLink(body.email);
        } catch {
          resetLink = undefined; // link é opcional; nunca bloqueia o provisionamento
        }
      }
    }

    await ref.set({
      email: body.email,
      displayName: finalDisplayName,
      groups: finalGroups,
      clientAccess: finalClientAccess,
      // I1 (Important, review final): grava SEMPRE (mesmo []) — sob merge:true,
      // omitir o campo quando vazio deixava adminClientIds stale ao rebaixar
      // um clientAdmin (desmarcar tudo não removia o valor antigo do doc).
      adminClientIds: finalAdminClientIds,
      ...auditFields(email, !existingSnap.exists),
    }, { merge: true });

    if (!provisionCredential) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, uid, credentialCreated, ...(resetLink ? { resetLink } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar usuário';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const scope = await getProvisionScope(email);
  if (!scope.allowed) {
    return NextResponse.json({ error: scope.error ?? 'Sem permissão' }, { status: scope.status ?? 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
    }

    const db = getDb();
    const targetDoc = await db.collection('users').doc(id).get();
    if (targetDoc.exists) {
      const targetData = targetDoc.data() ?? {};
      // Self-deletion guard (preservado).
      if (targetData.email && targetData.email === email) {
        return NextResponse.json({ error: 'Você não pode excluir seu próprio usuário.' }, { status: 400 });
      }
      // clientAdmin não exclui usuário com tenant fora do seu escopo (V6). Footprint
      // completo = clientAccess ∪ adminClientIds; vazio nunca está no escopo (mesmo
      // furo do GET — sem isso, isSubset([], x) libera o alvo vacuamente).
      if (!scope.global) {
        const targetTenants = ((targetData.clientAccess ?? []) as { clientId: string }[]).map((ca) => ca.clientId);
        const targetAdminClientIds = (targetData.adminClientIds ?? []) as string[];
        const footprint = [...targetTenants, ...targetAdminClientIds];
        if (footprint.length === 0 || !isSubset(footprint, scope.adminClientIds)) {
          return NextResponse.json({ error: 'Sem permissão para excluir usuário fora do seu escopo.' }, { status: 403 });
        }
      }
    }

    await db.collection('users').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir usuário';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
