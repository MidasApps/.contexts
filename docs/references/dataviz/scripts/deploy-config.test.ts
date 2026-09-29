import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Trava o contrato entre o que o deploy define e o que o app lê para escolher o
// banco Firestore. O deploy chegou a definir FIRESTORE_DATABASE_ID enquanto o
// app lia DATAVIZ_DATABASE_ID: o Cloud Run caía no default `dataviz` e só
// acertava produção por coincidência.

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const SERVER_VAR = 'DATAVIZ_DATABASE_ID';
const CLIENT_VAR = 'NEXT_PUBLIC_DATAVIZ_DATABASE_ID';

const envFlagOf = (source: string, flag: string): string => {
  // Comment lines are skipped so a commented-out flag can't satisfy the test.
  const line = source.split('\n').find((l) => l.includes(`${flag}=`) && !l.trimStart().startsWith('#'));
  if (!line) throw new Error(`${flag} not found`);
  return line;
};

describe('database env vars in the deploy', () => {
  it('runtime-config reads the server and client database vars', () => {
    const source = read('src/shared/lib/runtime-config.ts');
    expect(source).toContain(`process.env.${SERVER_VAR}`);
    expect(source).toContain(`process.env.${CLIENT_VAR}`);
  });

  it('Dockerfile accepts the client var as a build arg and exposes it to next build', () => {
    const dockerfile = read('Dockerfile');
    expect(dockerfile).toMatch(new RegExp(`^ARG ${CLIENT_VAR}$`, 'm'));
    expect(dockerfile).toMatch(new RegExp(`^ENV ${CLIENT_VAR}=\\$${CLIENT_VAR}$`, 'm'));
  });

  it('cloudbuild.yaml feeds build arg and runtime env from the same substitution, default dataviz', () => {
    const cloudbuild = read('cloudbuild.yaml');
    expect(cloudbuild).toContain(`'${CLIENT_VAR}=\${_DATAVIZ_DATABASE_ID}'`);
    expect(envFlagOf(cloudbuild, '--set-env-vars')).toContain(`${SERVER_VAR}=\${_DATAVIZ_DATABASE_ID}`);
    expect(cloudbuild).toMatch(/^ {2}_DATAVIZ_DATABASE_ID: 'dataviz'$/m);
    expect(cloudbuild).not.toContain('FIRESTORE_DATABASE_ID');
    // A secret with the same name as a --set-env-vars entry makes gcloud reject the deploy.
    expect(cloudbuild.split('\n').filter((l) => l.includes('--update-secrets')).join('\n')).not.toContain(SERVER_VAR);
  });

  it('deploy.sh feeds build arg and runtime env from the same variable, default dataviz', () => {
    const script = read('deploy.sh');
    expect(script).toMatch(/^DATABASE_ID="dataviz"$/m);
    expect(script).toContain(`--build-arg "${CLIENT_VAR}=\${DATABASE_ID}"`);
    expect(envFlagOf(script, '--set-env-vars')).toContain(`${SERVER_VAR}=\${DATABASE_ID}`);
    expect(script).not.toContain('FIRESTORE_DATABASE_ID');
  });
});
