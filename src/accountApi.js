import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

export function useAuthUser() {
  const [user, setUser] = useState(auth ? undefined : null);
  useEffect(() => {
    if (auth) return onAuthStateChanged(auth, setUser);
  }, []);
  return user;
}

export async function accountRequest(user, endpoint, params, options = {}) {
  const token = await user.getIdToken();
  const { body, ...request } = options;
  const response = await fetch(`/.netlify/functions/${endpoint}?${new URLSearchParams(params)}`, {
    ...request,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && { 'Content-Type': 'application/json' })
    },
    body: body && JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.error || 'The request could not be completed.');
  }
  return data;
}
