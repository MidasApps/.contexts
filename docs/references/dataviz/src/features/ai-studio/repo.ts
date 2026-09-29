import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getDb } from '@/shared/lib/firebase/admin';
import { getEntityConfig, type EntityConfig } from './entity-config';
import type { AiEntityType } from './protection';
import { assertDeletable, assertPatchAllowed, stripLockedOnUpsert } from './protection';
import { hasTool } from './tools-manifest';

export interface AiStudioRecord {
  id: string;
  origin: 'system' | 'user';
  systemKey?: string;
  status: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export interface UpsertResult {
  id: string;
  warnings?: string[];
}

function toIso(v: unknown): string | undefined {
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

export class AiStudioRepo {
  private cfg: EntityConfig;
  private db: FirebaseFirestore.Firestore;

  constructor(type: AiEntityType, db?: FirebaseFirestore.Firestore) {
    this.cfg = getEntityConfig(type);
    this.db = db ?? getDb();
  }

  private col() { return this.db.collection(this.cfg.collection); }

  private serialize(id: string, data: FirebaseFirestore.DocumentData): AiStudioRecord {
    const parsed = this.cfg.docSchema.parse({ ...data }) as Record<string, unknown>;
    return {
      ...parsed,
      id,
      origin: (data.origin as 'system' | 'user') ?? 'user',
      systemKey: data.systemKey,
      status: (data.status as string) ?? 'active',
      updatedAt: toIso(data.updatedAt),
    };
  }

  async list(): Promise<AiStudioRecord[]> {
    const snap = await this.col().get();
    return snap.docs.map((d) => this.serialize(d.id, d.data()));
  }

  async get(id: string): Promise<AiStudioRecord | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return this.serialize(snap.id, snap.data()!);
  }

  /** Garante exatamente 1 workflow default. Só para type==='workflow'. */
  private async enforceWorkflowDefault(
    id: string,
    desired: boolean | undefined,
    existingIsDefault: boolean,
  ): Promise<void> {
    if (this.cfg.type !== 'workflow') return;
    if (desired === true) {
      const snap = await this.col().where('isDefault', '==', true).get();
      const batch = this.db.batch();
      for (const d of snap.docs) {
        if (d.id !== id) batch.update(d.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();
    } else if (desired === false && existingIsDefault) {
      const snap = await this.col().where('isDefault', '==', true).get();
      const others = snap.docs.filter((d) => d.id !== id);
      if (others.length === 0) {
        throw new Error('Não é possível desmarcar o único workflow default; promova outro antes.');
      }
    }
  }

  private async collectWarnings(doc: Record<string, unknown>): Promise<string[]> {
    const warnings: string[] = [];
    for (const spec of this.cfg.refSpecs) {
      const refs = (doc[spec.field] as string[] | undefined) ?? [];
      for (const ref of refs) {
        if (spec.kind === 'toolManifest') {
          if (!hasTool(ref)) warnings.push(`${spec.field} "${ref}" inexistente no catálogo de tools`);
        } else {
          const exists = (await this.db.collection(spec.collection!).doc(ref).get()).exists;
          if (!exists) warnings.push(`${spec.field} "${ref}" inexistente em ${spec.collection}`);
        }
      }
    }
    return warnings;
  }

  async upsert(id: string, body: Record<string, unknown>): Promise<UpsertResult> {
    // 1. valida o payload pelo schema da entidade (aplica defaults)
    const parsed = this.cfg.docSchema.parse({ ...body });
    let doc = parsed as Record<string, unknown>;

    // 2. proteção: admin nunca cria system; em system existente preserva travados
    const existingSnap = await this.col().doc(id).get();
    const existing = existingSnap.exists ? existingSnap.data()! : {};
    const existingOrigin = (existing.origin as 'system' | 'user') ?? 'user';
    doc = stripLockedOnUpsert(this.cfg.type, existingOrigin, doc, existing);
    doc.origin = existingSnap.exists ? existingOrigin : 'user';
    if (existing.systemKey) doc.systemKey = existing.systemKey;

    // 2.b enforcement de 1-default (workflow)
    await this.enforceWorkflowDefault(
      id,
      doc.isDefault as boolean | undefined,
      existing.isDefault === true,
    );

    // 3. soft-refs (warning, não bloqueia)
    const warnings = await this.collectWarnings(doc);

    // 4. persiste
    await this.col().doc(id).set(
      {
        ...doc,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existingSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    return { id, ...(warnings.length > 0 ? { warnings } : {}) };
  }

  async patch(id: string, updates: Record<string, unknown>): Promise<void> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) throw new Error('Registro não encontrado');
    const origin = (snap.data()!.origin as 'system' | 'user') ?? 'user';
    assertPatchAllowed(this.cfg.type, origin, updates);
    await this.enforceWorkflowDefault(
      id,
      updates.isDefault as boolean | undefined,
      snap.data()!.isDefault === true,
    );

    // Paridade com upsert: valida os campos editáveis contra o schema da
    // entidade (a6-ia-01 — antes o PATCH gravava sem validar, permitindo
    // tiers inválidos). partial() só valida os campos presentes.
    const candidate: Record<string, unknown> = {};
    for (const key of this.cfg.editableOnPatch) {
      if (updates[key] !== undefined) candidate[key] = updates[key];
    }
    // docSchema é sempre um ZodObject nas entidades registradas (entity-config.ts);
    // o cast só destrava .partial(), que não existe no tipo base z.ZodType.
    const validated = (this.cfg.docSchema as z.ZodObject)
      .partial()
      .parse(candidate) as Record<string, unknown>;

    const clean: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    for (const key of Object.keys(candidate)) {
      clean[key] = validated[key];
    }
    await this.col().doc(id).update(clean);
  }

  async remove(id: string): Promise<void> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return;
    const origin = (snap.data()!.origin as 'system' | 'user') ?? 'user';
    assertDeletable(origin);
    await this.col().doc(id).delete();
  }

  async reset(id: string, seedDoc: Record<string, unknown>): Promise<void> {
    await this.col().doc(id).set(
      { ...seedDoc, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
}
