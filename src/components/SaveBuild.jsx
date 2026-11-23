import React, { useEffect, useRef, useState } from 'react';
import { accountRequest, useAuthUser } from '../accountApi';
import styles from './BuildLibrary.module.css';

export default function SaveBuild({ summary, replaceId }) {
  const user = useAuthUser();
  const id = useRef(replaceId || null);
  const [name, setName] = useState('My gearset');
  const [targetReady, setTargetReady] = useState(!replaceId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !replaceId) return;
    let active = true;
    accountRequest(user, 'savedBuilds', { id: replaceId }).then(
      build => {
        if (!active) return;
        setName(build.name);
        setTargetReady(true);
      },
      error => {
        if (active) setError(error.message);
      }
    );
    return () => { active = false; };
  }, [user, replaceId]);

  async function save(event) {
    event.preventDefault();
    if (!user || !targetReady || saving) return;
    if (replaceId && !saved && !window.confirm(`Replace “${name}” with this gearset?`)) return;

    setSaving(true);
    setError('');
    try {
      id.current ||= crypto.randomUUID();
      await accountRequest(user, 'savedBuilds', { id: id.current }, {
        method: 'PUT', body: { name, summary }
      });
      setSaved(true);
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (user === undefined) return null;
  if (!user) return <p><a href="/login" target="_blank" rel="noopener">Sign in</a> to save this gearset.</p>;

  return (
    <form className={styles.card} onSubmit={save}>
      <label htmlFor="save-build-name">Gearset name</label>
      <div className={styles.actions}>
        <input id="save-build-name" value={name} onChange={event => setName(event.target.value)}
          maxLength={100} required disabled={!targetReady || saving} />
        <button type="submit" disabled={!targetReady || saving || !name.trim()}>
          {saving ? 'Saving…' : saved ? 'Update saved gearset' : replaceId ? 'Replace saved gearset' : 'Save gearset'}
        </button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {saved && <p role="status">Saved. <a href="/builds">View saved builds</a></p>}
    </form>
  );
}
