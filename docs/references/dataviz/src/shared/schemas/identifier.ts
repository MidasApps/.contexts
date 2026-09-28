import { z } from 'zod';

/**
 * SQL-safe identifier: letras, dígitos, underscore.
 * Usado em nomes de colunas e tabelas interpolados em SQL.
 */
export const SqlIdentifier = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: 'Identificador deve começar por letra/underscore e conter apenas [a-zA-Z0-9_]',
  });

/**
 * Slug de documento (kebab-case, usado como ID no Firestore).
 */
export const Slug = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, {
    message: 'Slug deve ser kebab-case começando por letra',
  });

/**
 * Deriva o ID do documento de usuário a partir do e-mail.
 *
 * Fonte única: o formulário da admin, a rota `POST /api/users` e o script de
 * bootstrap precisam gerar o MESMO id — divergir criaria um segundo documento
 * para a mesma pessoa, com permissões diferentes e nenhum erro visível.
 *
 * É NÃO-injetivo de propósito histórico (`@` e `.` colapsam no mesmo `_`):
 * `alice.sub@acme.com` e `alice@sub.acme.com` caem no mesmo id. Quem escreve
 * trata a colisão comparando o `email` gravado — ver o gate em `/api/users`.
 */
export function slugifyEmail(email: string): string {
  return email.replace(/[@.]/g, '_').toLowerCase();
}

/**
 * ID de documento de usuário (derivado do e-mail via `slugifyEmail`, que troca
 * `@`/`.` por `_`). Exige começar por alfanumérico e conter apenas
 * [a-z0-9_+-] — bloqueia o separador de path `/` e ids vazios antes de
 * `users.doc(id)`, fechando path-injection no doc id.
 */
export const UserDocId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_+-]*$/, {
    message: 'ID de usuário inválido',
  });

/**
 * ID de documento Firestore gerado pelo próprio Firestore (`.add()` devolve 20
 * chars alfanuméricos) ou escolhido pelo admin.
 *
 * Existe pelo mesmo motivo que `UserDocId`: `collection(x).doc(id)` interpreta
 * `/` como separador de path, então um id não validado escreve em subcoleção
 * arbitrária. Bloqueia também `.` (`..` sobe na hierarquia) e id vazio.
 */
export const FirestoreDocId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/, {
    message: 'ID de documento inválido',
  });

/**
 * BigQuery project ID. Regras oficiais do GCP:
 * 6-30 chars, letras minúsculas / dígitos / hífen, começando por letra.
 */
export const GcpProjectId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{5,29}$/, {
    message: 'Project ID GCP inválido',
  });

// BigQueryDatasetRef removido: era um validador de "projeto.dataset" que
// nenhum schema compunha nem rota aplicava. Quem valida dataset hoje é o
// parseDatasetRef do client de BigQuery, no ponto de uso.
