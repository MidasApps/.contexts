export interface Group {
  id: string;
  name: string;
  order: number;
}

async function getToken(): Promise<string> {
  const { getExternalToken } = await import('@/shared/lib/external-token');
  const externalToken = getExternalToken();
  if (externalToken) return externalToken;

  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchGroups(clientId: string): Promise<Group[]> {
  const token = await getToken();
  const res = await fetch(`/api/report-groups?clientId=${encodeURIComponent(clientId)}`, {
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to fetch groups');
  }
  const body = await res.json();
  return body.data ?? [];
}

export async function createGroup(clientId: string, name: string): Promise<string> {
  const token = await getToken();
  const res = await fetch('/api/report-groups', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ clientId, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create group');
  }
  const body = await res.json();
  return body.data.id;
}

export async function renameGroup(clientId: string, groupId: string, name: string): Promise<void> {
  const token = await getToken();
  const res = await fetch('/api/report-groups', {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ clientId, groupId, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to rename group');
  }
}

export async function deleteGroup(clientId: string, groupId: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(
    `/api/report-groups?clientId=${encodeURIComponent(clientId)}&groupId=${encodeURIComponent(groupId)}`,
    {
      method: 'DELETE',
      headers: headers(token),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to delete group');
  }
}
