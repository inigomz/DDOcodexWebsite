import React, { useEffect, useState } from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import styles from '../App.module.css';

export default function Account() {
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth) return;

    let active = true;
    let revision = 0;
    const unsubscribe = onIdTokenChanged(auth, async user => {
      const current = ++revision;
      try {
        const token = user && await user.getIdTokenResult();
        if (active && current === revision) {
          // The claim is for display here. Netlify verifies it before granting access.
          setAccount(user && {
            label: user.displayName || user.email || 'Signed in',
            role: token.claims.admin === true ? 'Admin' : 'User'
          });
        }
      } catch {
        if (active && current === revision) {
          setError('Could not load your account role.');
          setAccount({ label: 'Signed in', role: null });
        }
      } finally {
        if (active && current === revision) setReady(true);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setBusy(true);
    setError('');
    try {
      await signOut(auth);
    } catch {
      setError('Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!auth) return <p className={styles.account}>Google sign-in is unavailable.</p>;

  return (
    <div className={styles.account}>
      {account && <span>{account.label}{account.role && ` · ${account.role}`}</span>}
      {ready && (account
        ? <>
          <a href="/builds">Saved builds</a>
          {account.role === 'Admin' && <a href="/admin">Admin</a>}
          <button type="button" onClick={handleSignOut} disabled={busy}>Sign out</button>
        </>
        : <><a href="/login">Sign in</a><a href="/signup">Create account</a></>)}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
