import React, { useEffect, useRef, useState } from 'react';
import { animate } from 'animejs';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase.js';
import styles from './AuthPage.module.css';

function authError(code, signup) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'The email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already uses this email. Sign in to continue.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Choose a stronger password and try again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is currently unavailable.';
    case 'auth/unauthorized-domain':
      return 'This domain needs to be authorized in Firebase Authentication.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Check your internet connection and try again.';
    default:
      return signup ? 'Could not create your account. Try again.' : 'Could not sign in. Try again.';
  }
}

export default function AuthPage({ signup }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const heroRef = useRef(null);
  const stepRef = useRef(null);
  const inputRef = useRef(null);
  const focusStep = useRef(false);
  const title = signup ? 'Create your account' : 'Welcome back';

  useEffect(() => {
    document.title = `${signup ? 'Create account' : 'Sign in'} | DDO Codex`;
    if (!auth) return;
    return onAuthStateChanged(auth, user => {
      if (user) window.location.replace('/');
      else setReady(true);
    });
  }, [signup]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const entrance = animate(heroRef.current, {
      opacity: [0, 1], y: [20, 0], duration: 500, ease: 'outExpo'
    });
    return () => entrance.revert();
  }, []);

  useEffect(() => {
    if (!focusStep.current) return;
    inputRef.current?.focus();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const transition = animate(stepRef.current, {
      opacity: [0, 1], y: [10, 0], duration: 310, ease: 'outExpo'
    });
    return () => transition.revert();
  }, [step]);

  function changeStep(nextStep) {
    focusStep.current = true;
    setError('');
    setNotice('');
    setPassword('');
    setShowPassword(false);
    setStep(nextStep);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!ready || pending) return;
    if (step === 'email') {
      setEmail(email.trim());
      changeStep('password');
      return;
    }
    setPending('email');
    setError('');
    setNotice('');
    try {
      const authenticate = signup ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
      await authenticate(auth, email, password);
      // The auth listener returns the user to the planner after Firebase restores the session.
    } catch (err) {
      setError(authError(err.code, signup));
      setPending('');
    }
  }

  async function handleGoogle() {
    if (!ready || pending) return;
    setPending('google');
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') setError(authError(err.code, signup));
      setPending('');
    }
  }

  async function handleReset() {
    if (!ready || pending) return;
    setPending('reset');
    setError('');
    setNotice('');
    try {
      await sendPasswordResetEmail(auth, email);
      setNotice('If an account uses this email, a password reset link is on its way.');
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setNotice('If an account uses this email, a password reset link is on its way.');
      } else {
        setError(authError(err.code, false));
      }
    } finally {
      setPending('');
    }
  }

  const disabled = !ready || Boolean(pending);

  return (
    <main className={styles.page}>
      <a className={styles.back} href="/">← Back to planner</a>
      <div className={styles.layout}>
        <section className={styles.hero} ref={heroRef} aria-label="DDO Codex">
          <div className={styles.mark} aria-hidden="true">⚔</div>
          <p className={styles.brand}>DDO Codex</p>
          <p className={styles.heroCopy}>Plan your next gear set.</p>
          <p className={styles.heroDetail}>Gear planning for Dungeons &amp; Dragons Online.</p>
        </section>
        <section className={styles.panel} aria-labelledby="auth-title">
          <h1 id="auth-title">{title}</h1>
          {!auth ? (
            <p className={styles.description}>Sign-in is unavailable. You can still use the gear planner.</p>
          ) : (
            <>
              <form onSubmit={handleSubmit} aria-busy={Boolean(pending)}>
                <div className={styles.step} ref={stepRef} key={step}>
                  {step === 'email' ? (
                    <>
                      <p className={styles.description}>Enter your email to get started.</p>
                      <label htmlFor="auth-email">Email address</label>
                      <input id="auth-email" name="email" type="email" autoComplete="username"
                        ref={inputRef} value={email} onChange={event => setEmail(event.target.value)}
                        placeholder="you@example.com" required disabled={disabled} />
                    </>
                  ) : (
                    <>
                      <div className={styles.emailSummary}>
                        <input aria-label="Email address" name="email" type="email"
                          autoComplete="username" value={email} readOnly tabIndex={-1} />
                        <button type="button" onClick={() => changeStep('email')} disabled={disabled}>
                          Edit email
                        </button>
                      </div>
                      <label htmlFor="auth-password">{signup ? 'Create a password' : 'Password'}</label>
                      <div className={styles.password}>
                        <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'}
                          autoComplete={signup ? 'new-password' : 'current-password'} ref={inputRef}
                          value={password} onChange={event => setPassword(event.target.value)}
                          minLength={signup ? 6 : undefined} required disabled={disabled} />
                        <button type="button" onClick={() => setShowPassword(value => !value)}
                          disabled={disabled} aria-controls="auth-password">
                          {showPassword ? 'Hide' : 'Show'}<span className={styles.srOnly}> password</span>
                        </button>
                      </div>
                      {signup && <p className={styles.hint}>Use at least 6 characters.</p>}
                    </>
                  )}
                  <button className={styles.primary} type="submit" disabled={disabled}>
                    {pending === 'email' ? 'Please wait…' : step === 'email' ? 'Continue' : signup ? 'Create account' : 'Sign in'}
                  </button>
                </div>
              </form>
              {step === 'email' ? (
                <>
                  <div className={styles.divider}>or</div>
                  <button className={styles.google} type="button" onClick={handleGoogle} disabled={disabled}>
                    {pending === 'google' ? 'Opening Google…' : 'Continue with Google'}
                  </button>
                </>
              ) : !signup && (
                <button className={styles.reset} type="button" onClick={handleReset} disabled={disabled}>
                  {pending === 'reset' ? 'Sending…' : 'Forgot password?'}
                </button>
              )}
              {error && <p className={styles.error} role="alert">{error}</p>}
              {notice && <p className={styles.notice} role="status">{notice}</p>}
              <p className={styles.switch}>
                {signup ? 'Already have an account?' : 'New to DDO Codex?'}{' '}
                <a href={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</a>
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
