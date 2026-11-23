import React, { useEffect, useState } from 'react';
import { onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.js';
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

  async function handleAccountAction() {
    setBusy(true);
    setError('');
    try {
      if (auth.currentUser) {
        await signOut(auth);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      if (err.code === 'auth/unauthorized-domain') {
        setError('This site domain must be authorized in Firebase Authentication.');
      } else if (err.code !== 'auth/popup-closed-by-user') {
        setError('Could not complete the account action. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!auth) return <p className={styles.account}>Google sign-in is unavailable.</p>;

  return (
    <div className={styles.account}>
      {account && <span>{account.label}{account.role && ` · ${account.role}`}</span>}
      <button type="button" onClick={handleAccountAction} disabled={!ready || busy}>
        {account ? 'Sign out' : 'Sign in with Google'}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
