import React, { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { accountRequest, useAuthUser } from '../accountApi';
import useGearsetUpdates from '../useGearsetUpdates';
import Account from './Account';
import styles from './BuildLibrary.module.css';

function LibraryContent({ user, admin, resource }) {
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [opened, setOpened] = useState(null);
  const [name, setName] = useState('');
  const endpoint = admin ? 'adminManage' : 'savedBuilds';
  const isUsers = resource === 'users';
  const [revision, setRevision] = useState(0);
  const currentRevision = useRef(0);
  const invalidate = useCallback(() => setRevision(++currentRevision.current), []);
  const liveStatus = useGearsetUpdates(user, isUsers ? null : admin ? 'admin' : 'owner', invalidate);

  function request(params = {}, options) {
    return accountRequest(user, endpoint, { ...(admin && { resource }), ...params }, options);
  }

  useEffect(() => {
    const controller = new AbortController();
    request({}, { signal: controller.signal }).then(
      data => {
        if (controller.signal.aborted) return;
        setRows(isUsers ? data.users : data.builds);
        setNext(data.next);
        setLoading(false);
      },
      error => {
        if (controller.signal.aborted) return;
        setError(error.message);
        setLoading(false);
      }
    );
    return () => controller.abort();
  }, [user, resource, admin, revision]);

  async function perform(action) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  function loadMore() {
    perform(async () => {
      const requestedRevision = currentRevision.current;
      const data = await request({ after: next });
      if (requestedRevision !== currentRevision.current) return;
      setRows(current => [...current, ...(isUsers ? data.users : data.builds)]);
      setNext(data.next);
    });
  }

  function view(row) {
    perform(async () => {
      const build = await request({ id: row.id });
      setOpened(build);
      setName(build.name);
    });
  }

  function rename(event) {
    event.preventDefault();
    perform(async () => {
      const saved = await request({ id: opened.id }, {
        method: 'PATCH', body: { name }
      });
      setOpened({ ...opened, ...saved });
      setName(saved.name);
      setRows(current => current.map(row => row.id === saved.id ? { ...row, ...saved } : row));
      setNotice('Gearset renamed.');
    });
  }

  function remove(row) {
    const label = isUsers ? row.email || row.displayName || row.uid : row.name;
    const message = isUsers
      ? `Delete the Firebase account for “${label}”? Its saved gearsets will remain available for separate deletion.`
      : `Delete the saved gearset “${label}”?`;
    if (!window.confirm(message)) return;
    perform(async () => {
      const params = isUsers ? { uid: row.uid } : admin ? { uid: row.ownerUid, id: row.id } : { id: row.id };
      await request(params, { method: 'DELETE' });
      setRows(current => current.filter(entry => entry !== row));
      if (opened?.id === row.id) setOpened(null);
      setNotice(isUsers ? 'Account deleted.' : 'Gearset deleted.');
      if (isUsers && row.uid === user.uid) {
        await signOut(auth);
        window.location.replace('/');
      }
    });
  }

  return (
    <>
      {liveStatus && <p className={styles.meta} role="status">Live updates: {liveStatus}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading…</p>}
      {!loading && !error && !rows.length && <p>{isUsers ? 'No accounts found.' : 'No saved gearsets yet.'}</p>}
      <ul className={styles.list} aria-label={isUsers ? 'Accounts' : 'Gearsets'}>
        {rows.map(row => (
          <li className={styles.card} key={isUsers ? row.uid : `${row.ownerUid}:${row.id}`}>
            <div className={styles.row}>
              <div>
                <strong>{isUsers ? row.email || row.displayName || row.uid : row.name}</strong>
                <p className={styles.meta}>
                  {isUsers ? `${row.role} · ${row.uid}` : `Updated ${new Date(row.updatedAt).toLocaleString()}`}
                </p>
                {admin && !isUsers && <p className={styles.meta}>Owner UID {row.ownerUid}</p>}
              </div>
              <div className={styles.actions}>
                {!admin && <button type="button" onClick={() => view(row)} disabled={busy}>View</button>}
                <button className={styles.danger} type="button" onClick={() => remove(row)} disabled={busy}>
                  {isUsers ? 'Delete account' : 'Delete gearset'}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {next && <button type="button" onClick={loadMore} disabled={busy}>Load more</button>}
      {opened && (
        <section className={styles.card} aria-label="Selected gearset">
          <form onSubmit={rename}>
            <label htmlFor="rename-build">Gearset name</label>
            <div className={styles.actions}>
              <input id="rename-build" value={name} onChange={event => setName(event.target.value)}
                maxLength={100} required disabled={busy} />
              <button type="submit" disabled={busy || !name.trim()}>Rename</button>
              <a href={`/?replaceBuild=${encodeURIComponent(opened.id)}`}>Replace with a new plan</a>
            </div>
          </form>
          <pre className={styles.summary}>{opened.summary.textSummary}</pre>
        </section>
      )}
    </>
  );
}

export default function BuildLibrary({ admin = false }) {
  const user = useAuthUser();
  const [resource, setResource] = useState(admin ? 'users' : 'gearsets');
  return (
    <main className={styles.page}>
      <header>
        <a href="/">← Back to planner</a>
        <Account />
      </header>
      <h1>{admin ? 'Administration' : 'Saved gearsets'}</h1>
      {user === undefined ? <p role="status">Loading account…</p> : user ? (
        <>
          {admin && (
            <nav className={styles.actions} aria-label="Admin sections">
              <button type="button" aria-pressed={resource === 'users'} onClick={() => setResource('users')}>Accounts</button>
              <button type="button" aria-pressed={resource === 'gearsets'} onClick={() => setResource('gearsets')}>Gearsets</button>
            </nav>
          )}
          <LibraryContent key={`${user.uid}:${resource}`} user={user} admin={admin} resource={resource} />
        </>
      ) : <p><a href="/login">Sign in</a> to continue.</p>}
    </main>
  );
}
