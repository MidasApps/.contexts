/**
 * Picks the Firebase Web app that `firebase-bootstrap.mjs` configures.
 *
 * Lives in `.mjs` because the bootstrap runs under plain `node`. The choice is
 * by exact displayName: taking the first app of the list read whichever app
 * the API happened to return first when a project had several.
 */

/**
 * @typedef {{ appId?: string, displayName?: string }} WebApp
 * @typedef {{ kind: 'existing', app: WebApp } | { kind: 'create' } | { kind: 'ambiguous', reason: string }} WebAppChoice
 */

/**
 * @param {WebApp[] | undefined} apps  `apps` from `GET projects/{id}/webApps`
 * @param {string} appName             the `--app-name` value
 * @returns {WebAppChoice}
 */
export const chooseWebApp = (apps, appName) => {
  const matches = (apps ?? []).filter((app) => app.displayName === appName);
  if (matches.length === 0) return { kind: 'create' };
  if (matches.length === 1) return { kind: 'existing', app: matches[0] };
  const ids = matches.map((app) => app.appId ?? '(sem appId)').join(', ');
  return {
    kind: 'ambiguous',
    reason: `${matches.length} apps Web com displayName "${appName}": ${ids}. ` +
      'Renomeie ou apague os extras no console do Firebase, ou passe outro --app-name.',
  };
};
