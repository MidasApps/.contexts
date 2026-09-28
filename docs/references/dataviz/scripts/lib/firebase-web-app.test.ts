import { describe, expect, it } from 'vitest';
import { chooseWebApp } from './firebase-web-app.mjs';

const APP_NAME = 'dataviz-local';
const named = (displayName: string, appId: string) => ({ displayName, appId });

describe('chooseWebApp', () => {
  it('uses the only app whose displayName equals the app name, wherever it is in the list', () => {
    const target = named(APP_NAME, '1:123:web:bbb');
    const apps = [named('other-app', '1:123:web:aaa'), target];
    expect(chooseWebApp(apps, APP_NAME)).toEqual({ kind: 'existing', app: target });
  });

  it('asks to create the app when no displayName matches, even if other apps exist', () => {
    const apps = [named('other-app', '1:123:web:aaa'), { appId: '1:123:web:ccc' }];
    expect(chooseWebApp(apps, APP_NAME)).toEqual({ kind: 'create' });
  });

  it('asks to create the app when the project has no Web app', () => {
    expect(chooseWebApp([], APP_NAME)).toEqual({ kind: 'create' });
    expect(chooseWebApp(undefined, APP_NAME)).toEqual({ kind: 'create' });
  });

  it('refuses to choose when several apps share the app name, listing their ids', () => {
    const apps = [named(APP_NAME, '1:123:web:aaa'), named('other-app', '1:123:web:bbb'), named(APP_NAME, '1:123:web:ccc')];
    const choice = chooseWebApp(apps, APP_NAME);
    expect(choice.kind).toBe('ambiguous');
    const reason = choice.kind === 'ambiguous' ? choice.reason : '';
    expect(reason).toContain('1:123:web:aaa');
    expect(reason).toContain('1:123:web:ccc');
    expect(reason).not.toContain('1:123:web:bbb');
  });

  it('matches the displayName exactly', () => {
    const apps = [named('Dataviz-Local', '1:123:web:aaa'), named(`${APP_NAME} `, '1:123:web:bbb')];
    expect(chooseWebApp(apps, APP_NAME)).toEqual({ kind: 'create' });
  });
});
